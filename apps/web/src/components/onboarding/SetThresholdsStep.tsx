"use client";

import * as React from "react";
import { ArrowRight, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";

interface SetThresholdsStepProps {
  walletAddress: `0x${string}`;
  cloneAddress: `0x${string}`;
  onCompleted: () => void;
}

/**
 * Step 3 — Set Delegation of Authority (DoA) thresholds.
 *
 * Configures three FHE-encrypted USDC payment thresholds on the AuditRegistry clone:
 *   - Manager  : payments above this amount require manager approval
 *   - Director : payments above this amount require director approval
 *   - Board    : payments above this amount require board resolution
 *   - (below manager threshold = Routine, no approval needed)
 *
 * Also sets an authorized approver address (setAuthorizedApprover).
 *
 * Payments cannot be recorded by the contract until this step is complete —
 * the AuditRegistry reverts with ThresholdsNotConfigured otherwise.
 *
 * ─── PLACEHOLDER ──────────────────────────────────────────────────────────────
 * Wire the real contract calls into handleSubmit() when ready:
 *
 *   1. POST /api/fhe/encrypt-input three times (or a single batch endpoint)
 *      to FHE-encrypt manager, director, board threshold amounts.
 *
 *   2. writeContractAsync({
 *        address: cloneAddress,
 *        abi: AuditRegistryAbi,
 *        functionName: "setAuthTierThresholds",
 *        args: [encManager, encDirector, encBoard, inputProof],
 *      });
 *
 *   3. writeContractAsync({
 *        address: cloneAddress,
 *        abi: AuditRegistryAbi,
 *        functionName: "setAuthorizedApprover",
 *        args: [approverAddress, true],
 *      });
 *
 *   Then call onCompleted() to trigger markThresholdsSet() optimistic update.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export function SetThresholdsStep({ walletAddress, cloneAddress, onCompleted }: SetThresholdsStepProps) {
  const [status, setStatus] = React.useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const [form, setForm] = React.useState({
    managerThreshold: "",
    directorThreshold: "",
    boardThreshold: "",
    approverAddress: "",
  });

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const isValid =
    form.managerThreshold !== "" &&
    form.directorThreshold !== "" &&
    form.boardThreshold !== "" &&
    form.approverAddress.startsWith("0x") &&
    form.approverAddress.length === 42;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setStatus("submitting");
    setErrorMsg("");

    try {
      // ─── PLACEHOLDER ──────────────────────────────────────────────────────
      // 1. FHE-encrypt the three threshold amounts
      // 2. Call AuditRegistry.setAuthTierThresholds(...)
      // 3. Call AuditRegistry.setAuthorizedApprover(approverAddress, true)
      await new Promise((r) => setTimeout(r, 1800));
      // ──────────────────────────────────────────────────────────────────────

      setStatus("success");
      await new Promise((r) => setTimeout(r, 500));
      onCompleted();
    } catch (err) {
      console.error("Threshold setup error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed. Please retry.");
      setStatus("error");
    }
  };

  const isSubmitting = status === "submitting";

  return (
    <div className="max-w-[440px]">
      {/* Icon */}
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
        {status === "success" ? (
          <CheckCircle2 className="h-5 w-5 text-primary animate-in zoom-in duration-300" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-primary" />
        )}
      </div>

      {/* Headline */}
      <h1 className="text-2xl font-semibold tracking-tight mb-3">
        {status === "success" ? "Approval rules saved" : "Set approval rules"}
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        {status === "success"
          ? "Your Delegation of Authority thresholds are configured. Entering your dashboard…"
          : "Define when payments require a second authorizer. Amounts are FHE-encrypted — even Complyr cannot read them."}
      </p>

      {status !== "success" && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Threshold fields */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Delegation of Authority Tiers
            </legend>

            <ThresholdField
              id="manager-threshold"
              label="Manager threshold"
              hint="Payments above this require manager approval"
              value={form.managerThreshold}
              onChange={set("managerThreshold")}
              disabled={isSubmitting}
            />
            <ThresholdField
              id="director-threshold"
              label="Director threshold"
              hint="Payments above this require director approval"
              value={form.directorThreshold}
              onChange={set("directorThreshold")}
              disabled={isSubmitting}
            />
            <ThresholdField
              id="board-threshold"
              label="Board threshold"
              hint="Payments above this require board resolution"
              value={form.boardThreshold}
              onChange={set("boardThreshold")}
              disabled={isSubmitting}
            />
          </fieldset>

          {/* Approver address */}
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Authorized Approver
            </legend>
            <div>
              <label
                htmlFor="approver-address"
                className="block text-xs text-muted-foreground mb-1.5"
              >
                Approver wallet address
              </label>
              <input
                id="approver-address"
                type="text"
                placeholder="0x…"
                value={form.approverAddress}
                onChange={set("approverAddress")}
                disabled={isSubmitting}
                spellCheck={false}
                className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground/60">
                This address can call <code className="font-mono">approvePayment()</code> on your registry.
              </p>
            </div>
          </fieldset>

          {/* Error */}
          {status === "error" && errorMsg && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              {errorMsg}
            </p>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button
              id="btn-save-thresholds"
              type="submit"
              disabled={isSubmitting || !isValid}
              className="h-9 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : status === "error" ? (
                <>Retry <ArrowRight className="h-4 w-4" /></>
              ) : (
                <>Save &amp; Enter Dashboard <ArrowRight className="h-4 w-4" /></>
              )}
            </button>

            <p className="mt-4 text-[11px] text-muted-foreground/50 font-mono">
              Registry: {cloneAddress.slice(0, 6)}…{cloneAddress.slice(-4)}
            </p>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThresholdField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-muted-foreground mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min="0"
          step="any"
          placeholder="0"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition disabled:opacity-60 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs text-muted-foreground shrink-0 font-mono">USDC</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground/50">{hint}</p>
    </div>
  );
}
