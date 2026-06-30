"use client";

import * as React from "react";
import { CheckCircle2, ArrowRight, Loader2, Cpu } from "lucide-react";

interface CloneActivationStepProps {
  walletAddress: `0x${string}`;
  onActivated: (cloneAddress: `0x${string}`) => void;
}

/**
 * Step 2 — Deploy the Complyr smart registry (AuditRegistry + ReviewTestRegistry clone pair).
 *
 * Renders inside OnboardingLayout's right panel.
 * No card, no border — left-aligned directly on bg-background.
 *
 * ─── PLACEHOLDER ──────────────────────────────────────────────────────────────
 * Wire the real ComplyrFactory.deployRegistry(business) call into handleActivate()
 * when the factory contract address is available. Replace fakeCloneAddress with
 * the actual AuditRegistry clone address returned by the factory event.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export function CloneActivationStep({ walletAddress, onActivated }: CloneActivationStepProps) {
  const [status, setStatus] = React.useState<"idle" | "deploying" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleActivate = async () => {
    setStatus("deploying");
    setErrorMsg("");

    try {
      // ─── PLACEHOLDER ────────────────────────────────────────────────────────
      // Replace with the real factory call:
      //
      //   const hash = await writeContractAsync({
      //     address: COMPLYR_FACTORY_ADDRESS,
      //     abi: ComplyrFactoryAbi,
      //     functionName: "deployRegistry",
      //     args: [walletAddress],
      //   });
      //   const receipt = await waitForTransactionReceipt(config, { hash });
      //   const cloneAddress = extractAuditRegistryFromLogs(receipt.logs);
      //
      await new Promise((r) => setTimeout(r, 1500));
      const fakeCloneAddress = walletAddress; // swap for real AuditRegistry clone address
      // ────────────────────────────────────────────────────────────────────────

      setStatus("success");
      await new Promise((r) => setTimeout(r, 500));
      onActivated(fakeCloneAddress);
    } catch (err) {
      console.error("Clone activation error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Deployment failed. Please retry.");
      setStatus("error");
    }
  };

  const isDeploying = status === "deploying";

  return (
    <div className="max-w-[400px]">
      {/* Icon — transitions to check on success */}
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
        {status === "success" ? (
          <CheckCircle2 className="h-5 w-5 text-primary animate-in zoom-in duration-300" />
        ) : (
          <Cpu className="h-5 w-5 text-primary" />
        )}
      </div>

      {/* Headline */}
      <h1 className="text-2xl font-semibold tracking-tight mb-3">
        {status === "success" ? "Account deployed" : "Deploy your account"}
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        {status === "success"
          ? "Your Complyr smart registry is live onchain. Setting up approval rules…"
          : "Complyr deploys an isolated AuditRegistry and ReviewTestRegistry clone pair for your business. This is a one-time transaction."}
      </p>

      {/* What gets deployed */}
      {status === "idle" && (
        <div className="mb-8 space-y-2.5">
          {[
            "AuditRegistry — encrypted payment records + findings",
            "ReviewTestRegistry — automated audit test engine",
            "Ownership transferred to you — Complyr has zero admin rights",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
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
          className="h-9 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isDeploying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Deploying…
            </>
          ) : status === "error" ? (
            <>Retry <ArrowRight className="h-4 w-4" /></>
          ) : (
            <>Deploy Account <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      )}

      {/* Wallet hint */}
      {status === "idle" && (
        <p className="mt-5 text-[11px] text-muted-foreground font-mono">
          Deploying for {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
        </p>
      )}
    </div>
  );
}
