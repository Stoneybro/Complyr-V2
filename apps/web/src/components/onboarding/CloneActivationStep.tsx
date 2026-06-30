"use client";

import * as React from "react";
import { Cpu, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";

interface CloneActivationStepProps {
  walletAddress: `0x${string}`;
  onActivated: (cloneAddress: `0x${string}`) => void;
}

/**
 * Step 2 of the onboarding gate — deploy the Complyr smart wallet (clone).
 *
 * This is a PLACEHOLDER. Wire the real contract deployment call into
 * handleActivate() when the factory contract is ready.
 *
 * Props:
 *   walletAddress — the connected EOA that will own the clone
 *   onActivated   — called with the deployed clone address when done;
 *                   the parent writes this to localStorage and unlocks the dashboard
 */
export function CloneActivationStep({
  walletAddress,
  onActivated,
}: CloneActivationStepProps) {
  const [status, setStatus] = React.useState<
    "idle" | "deploying" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleActivate = async () => {
    setStatus("deploying");
    setErrorMsg("");

    try {
      // ─── PLACEHOLDER ─────────────────────────────────────────────────────
      // Replace this block with the real clone factory contract call, e.g.:
      //
      //   const result = await writeContract({
      //     address: CLONE_FACTORY_ADDRESS,
      //     abi: cloneFactoryAbi,
      //     functionName: "deploy",
      //     args: [walletAddress],
      //   });
      //   const cloneAddress = await getDeployedAddress(result.hash);
      //
      // For now we simulate a 1.5 s deploy and mint a deterministic address.
      await new Promise((r) => setTimeout(r, 1500));
      const fakeCloneAddress = walletAddress; // swap for real address
      // ─────────────────────────────────────────────────────────────────────

      setStatus("success");
      // Small pause so the success tick is visible before the UI transitions
      await new Promise((r) => setTimeout(r, 600));
      onActivated(fakeCloneAddress);
    } catch (err) {
      console.error("Clone activation error:", err);
      setErrorMsg(
        err instanceof Error ? err.message : "Deployment failed. Please retry."
      );
      setStatus("error");
    }
  };

  const isDeploying = status === "deploying";

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-10">
        <StepDot complete label="1" />
        <div className="h-px w-12 bg-primary/40" />
        <StepDot active label="2" />
      </div>

      <div className="w-full max-w-md">
        {/* Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-lg">
          {/* Ambient glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-primary/5 blur-3xl"
          />

          {/* Icon */}
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            {status === "success" ? (
              <CheckCircle2 className="h-6 w-6 text-primary animate-in zoom-in duration-300" />
            ) : (
              <Cpu className="h-6 w-6 text-primary" />
            )}
          </div>

          {/* Headline */}
          <h1 className="text-2xl font-semibold tracking-tight mb-2">
            {status === "success"
              ? "Account activated"
              : "Activate your account"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            {status === "success"
              ? "Your Complyr smart wallet is deployed and ready. Redirecting you to the dashboard…"
              : "Complyr deploys a smart wallet (clone) that holds your payment approvals and audit records onchain. This is a one-time step."}
          </p>

          {/* What you get list */}
          {status === "idle" && (
            <ul className="mb-8 space-y-3">
              {[
                "Segregation-of-duties payment approvals",
                "FHE-encrypted GL category storage",
                "Immutable audit trail per transaction",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Error */}
          {status === "error" && errorMsg && (
            <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              {errorMsg}
            </p>
          )}

          {/* CTA */}
          {status !== "success" && (
            <button
              id="btn-activate-clone"
              onClick={handleActivate}
              disabled={isDeploying}
              className="w-full h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deploying smart wallet…
                </>
              ) : status === "error" ? (
                <>
                  Retry
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Activate Account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          )}

          {/* Wallet address hint */}
          {status === "idle" && (
            <p className="mt-4 text-center text-[11px] text-muted-foreground font-mono">
              Deploying for{" "}
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDot({
  active,
  complete,
  label,
}: {
  active?: boolean;
  complete?: boolean;
  label: string;
}) {
  if (complete) {
    return (
      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-[11px] font-medium flex items-center justify-center">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </div>
    );
  }
  return (
    <div
      className={`h-6 w-6 rounded-full border text-[11px] font-medium flex items-center justify-center transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </div>
  );
}
