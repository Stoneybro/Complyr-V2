"use client";

import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import ComplyrFactoryAbi from "@/lib/abis/ComplyrFactory.json";
import { ComplyrFactoryAddress } from "@/lib/CA";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnboardingPhase =
  | "loading"
  | "connect-wallet"
  | "wrong-network"
  | "deploy-registry"
  | "deactivated"
  | "ready";

export type OnboardingState =
  | { phase: "loading" }
  | { phase: "connect-wallet" }
  | { phase: "wrong-network" }
  | { phase: "deploy-registry"; walletAddress: `0x${string}` }
  | { phase: "deactivated"; walletAddress: `0x${string}` }
  | {
      phase: "ready";
      walletAddress: `0x${string}`;
      auditRegistryAddress: `0x${string}`;
      reviewRegistryAddress: `0x${string}`;
    };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnboardingState(): {
  state: OnboardingState;
  refetch: () => void;
} {
  const { address, isConnected, isConnecting, isReconnecting, chain } = useAccount();

  // ── Step 1: Read business registry from factory ───────────────────────────
  const {
    data: registry,
    isLoading: registryLoading,
    refetch: refetchRegistry,
  } = useReadContract({
    address: ComplyrFactoryAddress as `0x${string}`,
    abi: ComplyrFactoryAbi,
    functionName: "getRegistry",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: sepolia.id,
    query: {
      enabled: isConnected && !!address && chain?.id === sepolia.id,
    },
  });

  const reg = registry as
    | {
        auditRegistry: `0x${string}`;
        reviewTestRegistry: `0x${string}`;
        active: boolean;
        deployedAtBlock: bigint;
      }
    | undefined;

  const hasRegistry =
    !!reg && reg.deployedAtBlock > 0n;

  // ── Refetch (called after tx confirmation) ────────────────────────────────
  const refetch = () => {
    refetchRegistry();
  };

  // ── State machine ─────────────────────────────────────────────────────────
  const state = useMemo((): OnboardingState => {
    // Still hydrating wagmi
    if (isConnecting || isReconnecting) return { phase: "loading" };

    // No wallet
    if (!isConnected || !address) return { phase: "connect-wallet" };

    // Wrong network
    if (chain?.id !== sepolia.id) return { phase: "wrong-network" };

    // Waiting for factory read
    if (registryLoading) return { phase: "loading" };

    // Not registered yet
    if (!hasRegistry) {
      return { phase: "deploy-registry", walletAddress: address };
    }

    // Deactivated by protocol admin
    if (!reg!.active) {
      return { phase: "deactivated", walletAddress: address };
    }

    const auditRegistryAddress = reg!.auditRegistry;
    const reviewRegistryAddress = reg!.reviewTestRegistry;

    // All good — unlock the dashboard
    return {
      phase: "ready",
      walletAddress: address,
      auditRegistryAddress,
      reviewRegistryAddress,
    };
  }, [
    isConnecting,
    isReconnecting,
    isConnected,
    address,
    chain,
    registryLoading,
    hasRegistry,
    reg,
  ]);

  return { state, refetch };
}
