"use client";

import * as React from "react";
import { useOnboardingState } from "@/hooks/useOnboardingState";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { WalletConnectStep } from "@/components/onboarding/WalletConnectStep";
import { CloneActivationStep } from "@/components/onboarding/CloneActivationStep";
import { SetThresholdsStep } from "@/components/onboarding/SetThresholdsStep";
import { SkeletonPage } from "@/components/ui/skeleton-page";

// Map each setup phase to the step number shown in OnboardingLayout
const PHASE_TO_STEP: Record<string, 1 | 2 | 3> = {
  "connect-wallet": 1,
  "activate-clone": 2,
  "set-thresholds": 3,
};

interface OnboardingShellProps {
  /** Dashboard content — rendered only when phase === "ready" */
  children: (walletAddress: `0x${string}`) => React.ReactNode;
  /** Tells the parent sidebar whether to lock its nav items */
  onPhaseChange?: (isReady: boolean) => void;
  /** Exposes clearSession so the sidebar disconnect button can call it */
  onReady?: (api: { clearSession: () => void }) => void;
}

/**
 * Orchestrates the 3-step gated setup flow inside the dashboard content area.
 *
 * Phases:
 *   loading        → SkeletonPage (no content flash)
 *   connect-wallet → WalletConnectStep      (Step 1)
 *   activate-clone → CloneActivationStep    (Step 2)
 *   set-thresholds → SetThresholdsStep      (Step 3)
 *   ready          → children(walletAddress) — real dashboard content
 *
 * All setup steps render inside OnboardingLayout (split-panel) so the
 * sidebar chrome + left step tracker are always visible.
 */
export function OnboardingShell({ children, onPhaseChange, onReady }: OnboardingShellProps) {
  const { state, markCloneDeployed, markThresholdsSet, clearSession } = useOnboardingState();

  // Expose clearSession to parent once available
  React.useEffect(() => {
    onReady?.({ clearSession });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSession]);

  // Keep sidebar lock in sync
  React.useEffect(() => {
    onPhaseChange?.(state.phase === "ready");
  }, [state.phase, onPhaseChange]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state.phase === "loading") {
    return <SkeletonPage />;
  }

  // ── Ready ──────────────────────────────────────────────────────────────────
  if (state.phase === "ready") {
    return <>{children(state.walletAddress)}</>;
  }

  // ── Setup steps (wrapped in the split-panel layout) ────────────────────────
  const currentStep = PHASE_TO_STEP[state.phase] ?? 1;

  return (
    <OnboardingLayout currentStep={currentStep}>
      {state.phase === "connect-wallet" && <WalletConnectStep />}

      {state.phase === "activate-clone" && (
        <CloneActivationStep
          walletAddress={state.walletAddress}
          onActivated={markCloneDeployed}
        />
      )}

      {state.phase === "set-thresholds" && (
        <SetThresholdsStep
          walletAddress={state.walletAddress}
          cloneAddress={state.cloneAddress}
          onCompleted={markThresholdsSet}
        />
      )}
    </OnboardingLayout>
  );
}
