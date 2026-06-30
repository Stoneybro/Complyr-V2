"use client";

import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Lock, ShieldCheck, Cpu } from "lucide-react";

/**
 * Standalone Login Page.
 *
 * Renders cleanly in the center of the dashboard shell for unauthenticated users.
 * Custom ConnectButton.Custom — zero RainbowKit default styles.
 */
export function LoginPage() {
  return (
    <div className="max-w-[460px] flex flex-col items-center text-center">
      <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Lock className="h-8 w-8 text-primary" />
      </div>

      {/* Headline */}
      <h1 className="text-3xl font-semibold tracking-tight mb-4">
        Welcome back
      </h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
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

          if (!ready) return <div className="h-11 w-40" />;

          if (connected) {
            if (chain.unsupported) {
              return (
                <button
                  id="btn-wrong-network"
                  onClick={openChainModal}
                  className="h-11 rounded-lg border border-destructive/40 bg-destructive/10 px-8 text-base font-medium text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
                >
                  Wrong network — switch
                </button>
              );
            }
            return (
              <button
                id="btn-connected-wallet"
                onClick={openAccountModal}
                className="h-11 rounded-lg border border-border bg-muted/50 px-8 text-base font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 font-mono"
              >
                {account.displayName}
              </button>
            );
          }

          return (
            <button
              id="btn-connect-wallet"
              onClick={openConnectModal}
              className="h-11 rounded-lg bg-primary px-10 text-base font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm"
            >
              Connect Wallet
            </button>
          );
        }}
      </ConnectButton.Custom>

      {/* Feature list */}
      <div className="mt-12 space-y-4 border-t border-border pt-8 text-left w-full">
        {[
          { icon: ShieldCheck, text: "FHE-encrypted audit trail on every payment" },
          { icon: Cpu, text: "Self-custodial smart wallet — no shared keys" },
          { icon: Lock, text: "Payments cannot be recorded without your signature" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-4 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/50">
            <div className="bg-background rounded p-1.5 border border-border/50 shadow-sm">
              <Icon className="h-4 w-4 shrink-0 text-foreground/80" />
            </div>
            <span className="font-medium leading-tight">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
