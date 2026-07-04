"use client";

import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import ComplyrFactoryAbi from "@/lib/abis/ComplyrFactory.json";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { ComplyrFactoryAddress } from "@/lib/CA";

export type AuditorPhase =
  | "loading"
  | "connect-wallet"
  | "wrong-network"
  | "business-not-found"
  | "unauthorized"
  | "ready";

export type AuditorPortalState = {
  phase: AuditorPhase;
  walletAddress?: `0x${string}`;
  auditRegistryAddress?: `0x${string}`;
  reviewRegistryAddress?: `0x${string}`;
  accessLevel?: number;
  deployedAtBlock?: bigint;
};

export function useAuditorPortalState(businessAddress: `0x${string}`): {
  state: AuditorPortalState;
  refetch: () => void;
} {
  const { address, isConnected, isConnecting, isReconnecting, chain } = useAccount();

  // Read business registry from factory
  const {
    data: registry,
    isLoading: registryLoading,
    refetch: refetchRegistry,
  } = useReadContract({
    address: ComplyrFactoryAddress as `0x${string}`,
    abi: ComplyrFactoryAbi,
    functionName: "getRegistry",
    args: [businessAddress],
    chainId: sepolia.id,
    query: {
      enabled: isConnected && !!address && chain?.id === sepolia.id,
    },
  });

  const reg = registry as any;
  const hasRegistry = !!reg && reg.deployedAtBlock > 0n;

  // Read auditor profile — returns (uint8 access, uint248 engagementId) struct tuple.
  // Index [0] is the access level. Previously "auditorAccess" — renamed to "auditorProfile".
  const {
    data: auditorProfileData,
    isLoading: accessLoading,
    refetch: refetchAccess,
  } = useReadContract({
    address: reg?.auditRegistry,
    abi: AuditRegistryAbi.abi,
    functionName: "auditorProfile",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: sepolia.id,
    query: {
      enabled: hasRegistry && reg?.active === true && !!address,
    },
  });

  const refetch = () => {
    refetchRegistry();
    refetchAccess();
  };

  const state = useMemo((): AuditorPortalState => {
    if (isConnecting || isReconnecting) return { phase: "loading" };
    if (!isConnected || !address) return { phase: "connect-wallet" };
    if (chain?.id !== sepolia.id) return { phase: "wrong-network" };
    if (registryLoading) return { phase: "loading" };
    if (!hasRegistry || !reg!.active) return { phase: "business-not-found" };
    if (accessLoading) return { phase: "loading" };

    // auditorProfile returns a struct tuple — index 0 is the AuditorAccess enum value
    const profileTuple = auditorProfileData as readonly [number, bigint] | undefined;
    const access = profileTuple ? Number(profileTuple[0]) : 0;

    // access == 0 is AuditorAccess.NONE
    if (access === 0 || access === undefined) return { phase: "unauthorized" };

    return {
      phase: "ready",
      walletAddress: address,
      auditRegistryAddress: reg!.auditRegistry,
      reviewRegistryAddress: reg!.reviewTestRegistry,
      accessLevel: access,
      deployedAtBlock: reg!.deployedAtBlock as bigint,
    };
  }, [
    isConnecting, isReconnecting, isConnected, address, chain,
    registryLoading, hasRegistry, reg, accessLoading, auditorProfileData
  ]);

  return { state, refetch };
}
