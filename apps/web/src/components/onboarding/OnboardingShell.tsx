"use client";

import * as React from "react";
import { useOnboardingState } from "@/hooks/useOnboardingState";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { LoginPage } from "@/components/auth/LoginPage";
import { DeployRegistryStep } from "@/components/onboarding/DeployRegistryStep";
import { InitializeDefaultsStep } from "@/components/onboarding/InitializeDefaultsStep";
import { DeactivatedStep } from "@/components/onboarding/DeactivatedStep";
import { SkeletonPage } from "@/components/ui/skeleton-page";
import { WrongNetworkPage } from "@/components/auth/WrongNetworkPage";

// Map each setup phase to the step number shown in OnboardingLayout
const PHASE_TO_STEP: Record<string, 1 | 2> = {
  "deploy-registry": 1,
  "set-thresholds": 2,
};

interface OnboardingShellProps {
  /**
   * Dashboard content — rendered only when phase === "ready".
   * Receives both the EOA and the business's AuditRegistry clone address.
   */
  children: (addresses: {
    walletAddress: `0x${string}`;
    auditRegistryAddress: `0x${string}`;
    reviewRegistryAddress: `0x${string}`;
  }) => React.ReactNode;
  /** Tells the parent sidebar whether to lock its nav items */
  onPhaseChange?: (isReady: boolean) => void;
}

/**
 * Orchestrates the gated setup flow inside the dashboard content area.
 *
 * Phase derivation is entirely chain-state driven (via useOnboardingState).
 * No localStorage is involved in phase gating.
 *
 * Phases:
 *   loading          → SkeletonPage (no content flash)
 *   connect-wallet   → LoginPage (standalone)
 *   wrong-network    → WrongNetworkPage (standalone)
 *   deactivated      → DeactivatedStep (standalone)
 *   deploy-registry  → DeployRegistryStep (Step 1, split-panel)
 *   set-thresholds   → InitializeDefaultsStep  (Step 2, split-panel)
 *   ready            → children({ walletAddress, auditRegistryAddress, reviewRegistryAddress })
 */
export function OnboardingShell({ children, onPhaseChange }: OnboardingShellProps) {
  const { state, refetch } = useOnboardingState();

  // Keep sidebar lock in sync
  React.useEffect(() => {
    onPhaseChange?.(state.phase === "ready");
  }, [state.phase, onPhaseChange]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state.phase === "loading") {
    return <SkeletonPage />;
  }

  // ── Standalone pages (no onboarding layout chrome) ─────────────────────────
  if (state.phase === "connect-wallet") {
    return (
      <div className="flex flex-1 items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-300">
        <LoginPage />
      </div>
    );
  }

  if (state.phase === "wrong-network") {
    return (
      <div className="flex flex-1 items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-300">
        <WrongNetworkPage />
      </div>
    );
  }

  if (state.phase === "deactivated") {
    return (
      <div className="flex flex-1 items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-300">
        <DeactivatedStep walletAddress={state.walletAddress} />
      </div>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────────────────
  if (state.phase === "ready") {
    return (
      <>
        {children({
          walletAddress: state.walletAddress,
          auditRegistryAddress: state.auditRegistryAddress,
          reviewRegistryAddress: state.reviewRegistryAddress,
        })}
      </>
    );
  }

  // ── Setup steps (wrapped in the split-panel layout) ────────────────────────
  const currentStep = PHASE_TO_STEP[state.phase] ?? 1;

  return (
    <OnboardingLayout currentStep={currentStep}>
      {state.phase === "deploy-registry" && (
        <DeployRegistryStep
          walletAddress={state.walletAddress}
          onDeployed={refetch}
        />
      )}

      {state.phase === "set-thresholds" && (
        <InitializeDefaultsStep
          auditRegistryAddress={state.auditRegistryAddress}
          walletAddress={state.walletAddress}
          onConfigured={refetch}
        />
      )}
    </OnboardingLayout>
  );
}
