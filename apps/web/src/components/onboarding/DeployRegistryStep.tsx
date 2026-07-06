"use client";

import * as React from "react";
import { CheckCircle2, ArrowRight, Loader2, Cpu, ExternalLink } from "lucide-react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { toast } from "sonner";
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

  const hasToasted = React.useRef(false);

  // Advance state once confirmed
  React.useEffect(() => {
    if (isConfirmed && !hasToasted.current) {
      hasToasted.current = true;
      toast.success("Workspace deployed successfully!", {
        description: "Your smart contracts are live on Sepolia.",
        action: txHash ? {
          label: "View Tx",
          onClick: () => window.open(`https://sepolia.etherscan.io/tx/${txHash}`, "_blank"),
        } : undefined,
      });
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
    ? "Workspace created"
    : "Create your workspace";

  return (
    <div className="max-w-[460px]">
      {/* Headline */}
      <h1 className="text-3xl font-semibold tracking-tight mb-4">{statusLabel}</h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
        {isConfirmed
          ? "Your Complyr smart registries are live on Sepolia. Moving to security settings…"
          : "We are deploying an isolated pair of smart contracts for your business. Ownership is transferred to you immediately, ensuring Complyr has zero admin rights."}
      </p>

      {/* What gets deployed — idle only */}
      {!isDeploying && !isConfirmed && !error && (
        <div className="mb-8 space-y-2.5">
          {[
            "Deploy dedicated smart contracts for encrypted payments and compliance tests",
            "Transfer full contract ownership directly to your wallet",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 text-base">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{item}</span>
            </div>
          ))}
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-foreground/80">
            <span className="text-xl">🎁</span>
            <div>
              <strong className="block mb-0.5 text-primary">Demo Bonus</strong>
              Your workspace will be automatically funded with 5,000 cUSDC for testing.
            </div>
          </div>
        </div>
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
    </div>
  );
}
