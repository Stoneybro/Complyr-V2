"use client";

import * as React from "react";
import { useAuditorPortalState } from "@/hooks/useAuditorPortalState";
import { LoginPage } from "@/components/auth/LoginPage";
import { SkeletonPage } from "@/components/ui/skeleton-page";
import { WrongNetworkPage } from "@/components/auth/WrongNetworkPage";
import { useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { FileSearchCorner, LogOut } from "lucide-react";

interface AuditorShellProps {
  businessAddress: `0x${string}`;
  children: (addresses: {
    walletAddress: `0x${string}`;
    auditRegistryAddress: `0x${string}`;
    reviewRegistryAddress: `0x${string}`;
    accessLevel: number;
    deployedAtBlock: bigint;
  }) => React.ReactNode;
  onPhaseChange?: (isReady: boolean) => void;
}

export function AuditorShell({ businessAddress, children, onPhaseChange }: AuditorShellProps) {
  const { state } = useAuditorPortalState(businessAddress);
  const { disconnect } = useDisconnect();

  React.useEffect(() => {
    onPhaseChange?.(state.phase === "ready");
  }, [state.phase, onPhaseChange]);

  if (state.phase === "loading") {
    return <SkeletonPage />;
  }

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

  if (state.phase === "business-not-found" || state.phase === "unauthorized") {
    return (
      <div className="flex flex-1 items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-300 p-6">
        <div className="flex flex-col items-center max-w-md text-center space-y-4">
          <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
             <FileSearchCorner className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            {state.phase === "business-not-found"
              ? "This business has not deployed a Complyr registry or it has been deactivated."
              : "You are not listed as an authorized auditor for this business. Please switch to an authorized wallet or ask the business owner for access."}
          </p>
          <Button variant="outline" onClick={() => disconnect()} className="gap-2">
            <LogOut className="h-4 w-4" />
            Switch Wallet / Disconnect
          </Button>
        </div>
      </div>
    );
  }

  if (state.phase === "ready") {
    return (
      <>
        {children({
          walletAddress: state.walletAddress!,
          auditRegistryAddress: state.auditRegistryAddress!,
          reviewRegistryAddress: state.reviewRegistryAddress!,
          accessLevel: state.accessLevel!,
          deployedAtBlock: state.deployedAtBlock ?? 0n,
        })}
      </>
    );
  }

  return null;
}
