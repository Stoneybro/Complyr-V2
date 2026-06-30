"use client";

import * as React from "react";
import { useOnboardingState } from "@/hooks/useOnboardingState";
import { WalletConnectStep } from "@/components/onboarding/WalletConnectStep";
import { CloneActivationStep } from "@/components/onboarding/CloneActivationStep";
import { SkeletonPage } from "@/components/ui/skeleton-page";

interface OnboardingShellProps {
  /** The actual dashboard content — rendered only when phase === "ready" */
  children: (walletAddress: `0x${string}`) => React.ReactNode;
  /**
   * Called with the current phase so the parent (payments/page.tsx) can
   * tell the sidebar whether to lock its nav items.
   */
  onPhaseChange?: (isReady: boolean) => void;
}

/**
 * Orchestrates the gated setup flow inside the dashboard content area.
 *
 * Phases:
 *   loading        → skeleton shimmer (no content flash)
 *   connect-wallet → WalletConnectStep  (Step 1)
 *   activate-clone → CloneActivationStep (Step 2, new users only)
 *   ready          → children(walletAddress) — real dashboard content
 *
 * The sidebar chrome is always rendered by the parent; this component
 * only controls what appears in SidebarInset's content area.
 */
export function OnboardingShell({ children, onPhaseChange }: OnboardingShellProps) {
  const { state, markCloneDeployed } = useOnboardingState();

  // Notify parent whenever the ready state changes so it can toggle sidebar lock
  React.useEffect(() => {
    onPhaseChange?.(state.phase === "ready");
  }, [state.phase, onPhaseChange]);

  switch (state.phase) {
    case "loading":
      return <SkeletonPage />;

    case "connect-wallet":
      return <WalletConnectStep />;

    case "activate-clone":
      return (
        <CloneActivationStep
          walletAddress={state.walletAddress}
          onActivated={markCloneDeployed}
        />
      );

    case "ready":
      return <>{children(state.walletAddress)}</>;
  }
}
