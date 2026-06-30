"use client";

import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from "react";
import { useAccount, useReadContract } from "wagmi";

// ─── Constants ───────────────────────────────────────────────────────────────

const CLONE_KEY = "wallet-deployed";

const WAGMI_KEYS = [
  "wagmi.store",
  "wagmi.wallet",
  "wagmi.connected",
  "rk-recent",
];

// Minimal ABI — we only need to read the authThresholdsConfigured boolean.
// Using an inline slice to avoid bundling the full 61KB artifact.
const AUDIT_REGISTRY_ABI = [
  {
    name: "authThresholdsConfigured",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ─── localStorage external store ─────────────────────────────────────────────

function subscribeCloneStore(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("focus", callback);
  };
}

const getCloneSnapshot = (): string | null => localStorage.getItem(CLONE_KEY);
const getCloneServerSnapshot = (): null => null;

function notifyCloneStore(newValue: string | null): void {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: CLONE_KEY,
      newValue,
      storageArea: localStorage,
    })
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type OnboardingPhase =
  | "loading"
  | "connect-wallet"
  | "activate-clone"
  | "set-thresholds"
  | "ready";

export type OnboardingState =
  | { phase: "loading" }
  | { phase: "connect-wallet" }
  | { phase: "activate-clone"; walletAddress: `0x${string}` }
  | { phase: "set-thresholds"; walletAddress: `0x${string}`; cloneAddress: `0x${string}` }
  | { phase: "ready"; walletAddress: `0x${string}` };

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOnboardingState(): {
  state: OnboardingState;
  markCloneDeployed: (address: `0x${string}`) => void;
  markThresholdsSet: () => void;
  clearSession: () => void;
} {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();

  // Guard against SSR/wagmi hydration flash
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Always in sync with localStorage — re-reads on focus (DevTools clear) and
  // storage events (cross-tab). Same-tab writes dispatch a synthetic StorageEvent.
  const cloneAddress = useSyncExternalStore(
    subscribeCloneStore,
    getCloneSnapshot,
    getCloneServerSnapshot
  );

  // Optimistic override: set true immediately after the user completes Step 3
  // so the dashboard unlocks instantly without waiting for the next RPC poll.
  const [thresholdsSetOptimistic, setThresholdsSetOptimistic] = useState(false);

  // Onchain source of truth: AuditRegistry.authThresholdsConfigured().
  // Only enabled once we have a clone address to call against.
  const { data: thresholdsConfiguredOnchain, isLoading: isThresholdLoading } =
    useReadContract({
      address: cloneAddress ? (cloneAddress as `0x${string}`) : undefined,
      abi: AUDIT_REGISTRY_ABI,
      functionName: "authThresholdsConfigured",
      query: { enabled: mounted && !!cloneAddress },
    });

  const thresholdsConfigured = thresholdsSetOptimistic || !!thresholdsConfiguredOnchain;

  // ─── Actions ─────────────────────────────────────────────────────────────

  const markCloneDeployed = useCallback((deployedAddress: `0x${string}`) => {
    localStorage.setItem(CLONE_KEY, deployedAddress);
    notifyCloneStore(deployedAddress);
    // Reset optimistic threshold flag in case the user re-deployed
    setThresholdsSetOptimistic(false);
  }, []);

  const markThresholdsSet = useCallback(() => {
    setThresholdsSetOptimistic(true);
  }, []);

  const clearSession = useCallback(() => {
    [CLONE_KEY, ...WAGMI_KEYS].forEach((k) => localStorage.removeItem(k));
    notifyCloneStore(null);
    setThresholdsSetOptimistic(false);
  }, []);

  // ─── State Machine ───────────────────────────────────────────────────────

  const state = useMemo((): OnboardingState => {
    // Still initializing — show skeleton
    if (!mounted || isConnecting || isReconnecting) return { phase: "loading" };

    // No wallet connected
    if (!isConnected || !address) return { phase: "connect-wallet" };

    // Wallet connected, no clone deployed yet
    if (!cloneAddress) return { phase: "activate-clone", walletAddress: address };

    // Clone exists — wait for the onchain threshold check to resolve
    if (isThresholdLoading) return { phase: "loading" };

    // Thresholds not configured yet
    if (!thresholdsConfigured) {
      return {
        phase: "set-thresholds",
        walletAddress: address,
        cloneAddress: cloneAddress as `0x${string}`,
      };
    }

    // All set — unlock the dashboard
    return { phase: "ready", walletAddress: cloneAddress as `0x${string}` };
  }, [
    mounted,
    isConnecting,
    isReconnecting,
    isConnected,
    address,
    cloneAddress,
    isThresholdLoading,
    thresholdsConfigured,
  ]);

  return { state, markCloneDeployed, markThresholdsSet, clearSession };
}
