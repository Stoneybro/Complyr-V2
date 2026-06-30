"use client";

import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Lock, ShieldCheck, Cpu } from "lucide-react";

/**
 * Step 1 — Connect a wallet.
 *
 * Renders inside OnboardingLayout's right panel.
 * No card, no border, no shadow — content sits directly on bg-background.
 * Custom ConnectButton.Custom — zero RainbowKit default styles.
 */
export function WalletConnectStep() {
  return (
    <div className="max-w-[400px]">
      {/* Headline */}
      <h1 className="text-2xl font-semibold tracking-tight mb-3">
        Connect your wallet
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        Complyr uses your wallet to sign transactions and attach encrypted audit
        records to every payment. No account or password needed.
      </p>

      {/* Custom RainbowKit connect button */}
      <ConnectButton.Custom>
        {({
          account,
          chain,
          openAccountModal,
          openChainModal,
          openConnectModal,
          authenticationStatus,
          mounted,
        }) => {
          const ready = mounted && authenticationStatus !== "loading";
          const connected =
            ready &&
            account &&
            chain &&
            (!authenticationStatus || authenticationStatus === "authenticated");

          if (!ready) return <div className="h-9" />;

          if (connected) {
            if (chain.unsupported) {
              return (
                <button
                  id="btn-wrong-network"
                  onClick={openChainModal}
                  className="h-9 rounded-lg border border-destructive/40 bg-destructive/10 px-5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
                >
                  Wrong network — switch
                </button>
              );
            }
            return (
              <button
                id="btn-connected-wallet"
                onClick={openAccountModal}
                className="h-9 rounded-lg border border-border bg-muted/50 px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 font-mono"
              >
                {account.displayName}
              </button>
            );
          }

          return (
            <button
              id="btn-connect-wallet"
              onClick={openConnectModal}
              className="h-9 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm"
            >
              Connect Wallet
            </button>
          );
        }}
      </ConnectButton.Custom>

      {/* Trust signal */}
      <p className="mt-5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3 shrink-0" />
        Your keys stay in your wallet. Complyr never has custody.
      </p>

      {/* Feature list */}
      <div className="mt-10 space-y-3 border-t border-border pt-8">
        {[
          { icon: ShieldCheck, text: "FHE-encrypted audit trail on every payment" },
          { icon: Cpu, text: "Self-custodial smart wallet — no shared keys" },
          { icon: Lock, text: "Payments cannot be recorded without your signature" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
