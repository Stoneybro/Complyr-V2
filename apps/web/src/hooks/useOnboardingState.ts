"use client";

import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

// ─── Constants ───────────────────────────────────────────────────────────────

const CLONE_KEY = "wallet-deployed";
const THRESHOLDS_KEY = "thresholds-configured";

const WAGMI_KEYS = [
  "wagmi.store",
  "wagmi.wallet",
  "wagmi.connected",
  "rk-recent",
];

// ─── localStorage external store ─────────────────────────────────────────────

function subscribeStore(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("focus", callback);
  };
}

const getCloneSnapshot = (): string | null => localStorage.getItem(CLONE_KEY);
const getThresholdsSnapshot = (): string | null => localStorage.getItem(THRESHOLDS_KEY);
const getServerSnapshot = (): null => null;

function notifyStore(key: string, newValue: string | null): void {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key,
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
  | { phase: "set-thresholds"; walletAddress: `0x${string}` }
  | { phase: "ready"; walletAddress: `0x${string}` };

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOnboardingState(): {
  state: OnboardingState;
  markCloneDeployed: (address: `0x${string}`) => void;
  markThresholdsConfigured: () => void;
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
    subscribeStore,
    getCloneSnapshot,
    getServerSnapshot
  );

  const thresholdsConfigured = useSyncExternalStore(
    subscribeStore,
    getThresholdsSnapshot,
    getServerSnapshot
  );

  // ─── Actions ─────────────────────────────────────────────────────────────

  const markCloneDeployed = useCallback((deployedAddress: `0x${string}`) => {
    localStorage.setItem(CLONE_KEY, deployedAddress);
    notifyStore(CLONE_KEY, deployedAddress);
  }, []);

  const markThresholdsConfigured = useCallback(() => {
    localStorage.setItem(THRESHOLDS_KEY, "true");
    notifyStore(THRESHOLDS_KEY, "true");
  }, []);

  const clearSession = useCallback(() => {
    [CLONE_KEY, THRESHOLDS_KEY, ...WAGMI_KEYS].forEach((k) => localStorage.removeItem(k));
    notifyStore(CLONE_KEY, null);
    notifyStore(THRESHOLDS_KEY, null);
  }, []);

  // ─── State Machine ───────────────────────────────────────────────────────

  const state = useMemo((): OnboardingState => {
    // Still initializing — show skeleton
    if (!mounted || isConnecting || isReconnecting) return { phase: "loading" };

    // No wallet connected
    if (!isConnected || !address) return { phase: "connect-wallet" };

    // Wallet connected, no clone deployed yet
    if (!cloneAddress) return { phase: "activate-clone", walletAddress: address };

    // Clone deployed, but thresholds not set
    if (!thresholdsConfigured) return { phase: "set-thresholds", walletAddress: cloneAddress as `0x${string}` };

    // All set — unlock the dashboard
    return { phase: "ready", walletAddress: cloneAddress as `0x${string}` };
  }, [
    mounted,
    isConnecting,
    isReconnecting,
    isConnected,
    address,
    cloneAddress,
    thresholdsConfigured,
  ]);

  return { state, markCloneDeployed, markThresholdsConfigured, clearSession };
}
