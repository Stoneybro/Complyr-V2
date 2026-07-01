"use client";

import * as React from "react";
import { CheckCircle2, ArrowRight, Loader2, Cpu, ExternalLink } from "lucide-react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import ComplyrFactoryAbi from "@/lib/abis/ComplyrFactory.json";
import { ComplyrFactoryAddress } from "@/lib/CA";

interface DeployRegistryStepProps {
  walletAddress: `0x${string}`;
  onDeployed: () => void;
}

/**
 * Step 1 — Self-register with ComplyrFactory.
 *
 * Calls deployRegistry() (permissionless, msg.sender becomes business owner).
 * On tx confirmation, calls onDeployed() which triggers a refetch() in
 * useOnboardingState — the state machine auto-advances to set-thresholds.
 */
export function DeployRegistryStep({ walletAddress, onDeployed }: DeployRegistryStepProps) {
  const chainId = useChainId();

  const {
    writeContract,
    data: txHash,
    isPending: isWaitingForSignature,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: sepolia.id,
  });

  // Advance state once confirmed
  React.useEffect(() => {
    if (isConfirmed) {
      const timer = setTimeout(onDeployed, 600);
      return () => clearTimeout(timer);
    }
  }, [isConfirmed, onDeployed]);

  const handleDeploy = () => {
    reset();
    writeContract({
      address: ComplyrFactoryAddress as `0x${string}`,
      abi: ComplyrFactoryAbi,
      functionName: "deployRegistry",
      chainId: sepolia.id,
    });
  };

  const isDeploying = isWaitingForSignature || isConfirming;
  const error = writeError || receiptError;

  const statusLabel = isWaitingForSignature
    ? "Waiting for signature…"
    : isConfirming
    ? "Confirming on Sepolia…"
    : isConfirmed
    ? "Account deployed"
    : "Deploy your account";

  return (
    <div className="max-w-[460px]">
      {/* Icon */}
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
        {isConfirmed ? (
          <CheckCircle2 className="h-5 w-5 text-primary animate-in zoom-in duration-300" />
        ) : (
          <Cpu className="h-5 w-5 text-primary" />
        )}
      </div>

      {/* Headline */}
      <h1 className="text-3xl font-semibold tracking-tight mb-4">{statusLabel}</h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
        {isConfirmed
          ? "Your Complyr smart registry is live on Sepolia. Setting up authorization rules…"
          : "Complyr deploys an isolated AuditRegistry and ReviewTestRegistry clone pair for your business. Ownership is transferred to you immediately — Complyr has zero admin rights after this transaction."}
      </p>

      {/* What gets deployed — idle only */}
      {!isDeploying && !isConfirmed && !error && (
        <div className="mb-8 space-y-2.5">
          {[
            "AuditRegistry — encrypted payment records + findings",
            "ReviewTestRegistry — automated audit test engine",
            "Ownership transferred to your wallet — Complyr has zero admin rights",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 text-base">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tx hash link — shown while confirming or confirmed */}
      {txHash && (
        <a
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-6 flex items-center gap-2 text-xs text-primary hover:underline font-mono"
        >
          {txHash.slice(0, 10)}…{txHash.slice(-8)}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {/* Error */}
      {error && (
        <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(error as Error).message?.includes("AlreadyRegistered")
            ? "This wallet is already registered. Refreshing…"
            : (error as Error).message?.slice(0, 120) ?? "Transaction failed. Please retry."}
        </p>
      )}

      {/* CTA */}
      {!isConfirmed && (
        <button
          id="btn-deploy-registry"
          onClick={handleDeploy}
          disabled={isDeploying}
          className="h-11 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isDeploying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isWaitingForSignature ? "Waiting for MetaMask…" : "Confirming…"}
            </>
          ) : error ? (
            <>Retry <ArrowRight className="h-4 w-4" /></>
          ) : (
            <>Deploy Account <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      )}

      {/* Wallet hint */}
      {!isDeploying && !isConfirmed && (
        <p className="mt-6 text-xs text-muted-foreground font-mono">
          Registering {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)} on Sepolia
        </p>
      )}
    </div>
  );
}
