"use client";

import * as React from "react";
import { useAccount } from "wagmi";

export type OnboardingPhase =
  | "loading"
  | "connect-wallet"
  | "activate-clone"
  | "ready";

export type OnboardingState =
  | { phase: "loading" }
  | { phase: "connect-wallet" }
  | { phase: "activate-clone"; walletAddress: `0x${string}` }
  | { phase: "ready"; walletAddress: `0x${string}` };

/**
 * Resolves the current onboarding phase:
 *
 * 1. "loading"         – wagmi is still reconnecting / app is not yet mounted
 * 2. "connect-wallet"  – no wallet connected
 * 3. "activate-clone"  – wallet connected but clone (smart wallet) not deployed yet
 * 4. "ready"           – wallet connected AND clone deployed → unlock dashboard
 */
export function useOnboardingState(): {
  state: OnboardingState;
  markCloneDeployed: (address: `0x${string}`) => void;
} {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const [mounted, setMounted] = React.useState(false);
  const [cloneAddress, setCloneAddress] = React.useState<`0x${string}` | null>(
    null
  );

  // Hydrate clone address from localStorage once mounted (avoids SSR mismatch)
  React.useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("wallet-deployed");
    if (saved) {
      setCloneAddress(saved as `0x${string}`);
    }
  }, []);

  const markCloneDeployed = React.useCallback(
    (deployedAddress: `0x${string}`) => {
      localStorage.setItem("wallet-deployed", deployedAddress);
      setCloneAddress(deployedAddress);
    },
    []
  );

  const state = React.useMemo((): OnboardingState => {
    // Not mounted yet or wagmi is still reconnecting — show skeleton
    if (!mounted || isConnecting || isReconnecting) {
      return { phase: "loading" };
    }

    // No wallet connected
    if (!isConnected || !address) {
      return { phase: "connect-wallet" };
    }

    // Wallet connected but no clone deployed yet
    if (!cloneAddress) {
      return { phase: "activate-clone", walletAddress: address };
    }

    // Fully set up — unlock the dashboard
    return { phase: "ready", walletAddress: cloneAddress };
  }, [mounted, isConnecting, isReconnecting, isConnected, address, cloneAddress]);

  return { state, markCloneDeployed };
}
