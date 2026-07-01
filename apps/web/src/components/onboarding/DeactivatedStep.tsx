"use client";

import { XCircle, ArrowRight } from "lucide-react";

interface DeactivatedStepProps {
  walletAddress: `0x${string}`;
}

/**
 * Shown when getRegistry().active === false.
 * The protocol admin has deactivated this business.
 * The business's deployed contracts are unaffected — data and ownership remain theirs.
 */
export function DeactivatedStep({ walletAddress }: DeactivatedStepProps) {
  return (
    <div className="max-w-[440px]">
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 border border-destructive/20">
        <XCircle className="h-5 w-5 text-destructive" />
      </div>

      <h1 className="text-3xl font-semibold tracking-tight mb-4">Account deactivated</h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-8">
        Your business account has been deactivated by the Complyr protocol admin. Your
        deployed contracts and data are unchanged and remain under your wallet's ownership.
      </p>

      <p className="text-sm text-muted-foreground mb-2 font-mono">
        Wallet: {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
      </p>

      <a
        href="mailto:support@complyr.io"
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        Contact support <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}
