"use client";

import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";

/**
 * Standalone Login Page.
 *
 * Renders cleanly in the center of the dashboard shell for unauthenticated users.
 * Custom ConnectButton.Custom — zero RainbowKit default styles.
 */
export function LoginPage() {
  return (
    <div className="max-w-[460px] flex flex-col items-center text-center -mt-24">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/5">
        <Image
          src="/complyrlogo-light.svg"
          alt="Complyr Logo"
          width={60}
          height={60}
          className="h-12 w-auto"
        />
      </div>

      {/* Headline */}
      <h1 className="text-3xl font-semibold tracking-tight mb-4">
        Welcome back
      </h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
        Connect your wallet to access Complyr.
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
    </div>
  );
}
