"use client";

import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet, ShieldCheck, Lock } from "lucide-react";

/**
 * Step 1 of the onboarding gate — connect a wallet.
 *
 * Replaces the old AuthGuard. Renders inside the dashboard content area;
 * the sidebar stays visible but locked.
 *
 * Uses a fully custom ConnectButton render prop — zero RainbowKit default styles.
 */
export function WalletConnectStep({ isReturn = false }: { isReturn?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Progress indicator — only for first-time users */}
      {!isReturn && (
        <div className="flex items-center gap-2 mb-10">
          <StepDot active label="1" />
          <div className="h-px w-12 bg-border" />
          <StepDot label="2" />
        </div>
      )}

      <div className="w-full max-w-md">
        {/* Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-lg">
          {/* Subtle ambient glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/5 blur-3xl"
          />

          {/* Icon */}
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            <Wallet className="h-6 w-6 text-primary" />
          </div>

          {/* Headline */}
          <h1 className="text-2xl font-semibold tracking-tight mb-2">
            Connect your wallet
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Complyr uses your wallet to sign transactions and attach encrypted
            audit records to every payment — no account or password needed.
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
                (!authenticationStatus ||
                  authenticationStatus === "authenticated");

              if (!ready) return <div className="h-9" />;

              if (connected) {
                // Wrong network
                if (chain.unsupported) {
                  return (
                    <button
                      id="btn-wrong-network"
                      onClick={openChainModal}
                      className="w-full h-9 rounded-lg border border-destructive/40 bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
                    >
                      Wrong network — switch
                    </button>
                  );
                }

                // Already connected (shouldn't appear in this step, safety net)
                return (
                  <button
                    id="btn-connected-wallet"
                    onClick={openAccountModal}
                    className="w-full h-9 rounded-lg border border-border bg-muted/50 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 font-mono"
                  >
                    {account.displayName}
                  </button>
                );
              }

              return (
                <button
                  id="btn-connect-wallet"
                  onClick={openConnectModal}
                  className="w-full h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm"
                >
                  Connect Wallet
                </button>
              );
            }}
          </ConnectButton.Custom>

          {/* Trust signal */}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" />
            Your keys stay in your wallet. Complyr never has custody.
          </p>
        </div>

        {/* Feature pills */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { icon: ShieldCheck, text: "FHE-encrypted audit trail" },
            { icon: Wallet, text: "Self-custodial payments" },
            { icon: Lock, text: "No password required" },
          ].map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 text-center"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground leading-tight">
                {text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepDot({ active, label }: { active?: boolean; label: string }) {
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
