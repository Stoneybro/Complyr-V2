"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

/**
 * Shown when the connected wallet is on the wrong network.
 * Prompts the user to switch to Sepolia.
 */
export function WrongNetworkPage() {
  const { switchChain, isPending } = useSwitchChain();

  return (
    <div className="max-w-[420px] text-center">
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10 border border-yellow-500/20 mx-auto">
        <AlertTriangle className="h-5 w-5 text-yellow-500" />
      </div>

      <h1 className="text-3xl font-semibold tracking-tight mb-4">Wrong network</h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-8">
        Complyr runs on the{" "}
        <span className="font-medium text-foreground">Sepolia testnet</span>. Please switch
        your wallet to continue.
      </p>

      <button
        onClick={() => switchChain({ chainId: sepolia.id })}
        disabled={isPending}
        className="inline-flex items-center gap-2 h-11 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Switching…" : "Switch to Sepolia"}{" "}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
