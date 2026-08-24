"use client";

import * as React from "react";
import { CheckCircle2, ArrowRight, Loader2, Cpu, ExternalLink, InfoIcon } from "lucide-react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
          : "This creates an isolated environment for running audits over confidential transactions: a dedicated pair of smart contracts, owned by no one but you."}
      </p>

      {/* What gets deployed — idle only */}
      {!isDeploying && !isConfirmed && !error && (
        <div className="mb-8 space-y-2.5">
          {[
            "Dedicated contracts for encrypted payments and the compliance tests that evaluate them",
            "Full contract ownership transferred to your wallet at deploy time — the platform holds nothing",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 text-base">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{item}</span>
            </div>
          ))}
          <Alert className="mt-6 border-primary/20 bg-primary/5">
          <InfoIcon />
            <AlertTitle className="text-primary font-bold">Funded for testing</AlertTitle>
            <AlertDescription className="text-foreground/80 leading-relaxed">
              5,000 test cUSDC is minted automatically so you can send real confidential
              payments end-to-end.
            </AlertDescription>
          </Alert>
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
        <Button
          id="btn-deploy-registry"
          onClick={handleDeploy}
          disabled={isDeploying}
          className="gap-2"
        >
          {isDeploying ? (
            <>
              <Loader2 data-icon="inline-start" className="animate-spin" />
              {isWaitingForSignature ? "Waiting for wallet…" : "Confirming…"}
            </>
          ) : error ? (
            <>Retry <ArrowRight data-icon="inline-end" /></>
          ) : (
            <>Deploy Workspace <ArrowRight data-icon="inline-end" /></>
          )}
        </Button>
      )}

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground/80">
        Complyr is an experiment in how audits can be carried out on confidential
        token transactions — this Sepolia deployment is a demonstration, and a
        production setup would differ.
      </p>
    </div>
  );
}
