"use client";

import * as React from "react";
import { useState } from "react";
import { ArrowRight, Loader2, Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toHex, type Abi } from "viem";
import { sepolia } from "wagmi/chains";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { getFhevmInstance } from "@/lib/fhe";

interface InitializeDefaultsStepProps {
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  onConfigured: () => void;
}

const USDC_DECIMALS = 6n;

/** Convert a user-entered USDC string to token base units (BigInt) */
function toTokenUnits(usdcAmount: string): bigint {
  const parsed = parseFloat(usdcAmount);
  if (isNaN(parsed) || parsed <= 0) throw new Error("Invalid amount");
  return BigInt(Math.round(parsed)) * 10n ** USDC_DECIMALS;
}

export function InitializeDefaultsStep({
  auditRegistryAddress,
  walletAddress,
  onConfigured,
}: InitializeDefaultsStepProps) {
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [validationError, setValidationError] = useState("");

  const {
    writeContract,
    data: txHash,
    isPending: isWaitingForSignature,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
      chainId: sepolia.id,
    });

  // Advance state once confirmed
  React.useEffect(() => {
    if (isConfirmed) {
      const timer = setTimeout(onConfigured, 600);
      return () => clearTimeout(timer);
    }
  }, [isConfirmed, onConfigured]);

  const handleInitialize = async () => {
    setValidationError("");
    reset();

    setIsEncrypting(true);
    try {
      const fhevm = await getFhevmInstance();

      // Set defaults as per requirements
      const managerThreshold = "500";
      const directorThreshold = "1500";
      const boardThreshold = "3000";

      const input = fhevm.createEncryptedInput(auditRegistryAddress, walletAddress);
      input.add64(toTokenUnits(managerThreshold));
      input.add64(toTokenUnits(directorThreshold));
      input.add64(toTokenUnits(boardThreshold));
      const encrypted = await input.encrypt();

      const encManager = toHex(encrypted.handles[0]) as `0x${string}`;
      const encDirector = toHex(encrypted.handles[1]) as `0x${string}`;
      const encBoard = toHex(encrypted.handles[2]) as `0x${string}`;
      const inputProof = toHex(encrypted.inputProof) as `0x${string}`;

      writeContract({
        address: auditRegistryAddress,
        abi: AuditRegistryAbi as Abi,
        functionName: "setAuthTierThresholds",
        args: [encManager, encDirector, encBoard, inputProof],
        chainId: sepolia.id,
      });
    } catch (err) {
      console.error("FHE encryption error:", err);
      setValidationError(
        err instanceof Error ? err.message : "Encryption failed. Please retry."
      );
    } finally {
      setIsEncrypting(false);
    }
  };

  const isSubmitting = isEncrypting || isWaitingForSignature || isConfirming;
  const error = validationError || (writeError ? (writeError as Error).message?.slice(0, 160) : "");

  return (
    <div className="max-w-[460px]">
      <h1 className="text-3xl font-semibold tracking-tight mb-4">
        Account deployed
      </h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        Your smart registry is live! We will now initialize it with default authorization thresholds for your delegation of authority rules.
      </p>

      <div className="space-y-4 mb-8">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm">
          <div className="flex justify-between items-center border-b border-border pb-2">
            <span className="text-sm font-medium">Manager Tier</span>
            <span className="text-sm font-mono text-muted-foreground">&gt; $500</span>
          </div>
          <div className="flex justify-between items-center border-b border-border pb-2">
            <span className="text-sm font-medium">Director Tier</span>
            <span className="text-sm font-mono text-muted-foreground">&gt; $1,500</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Board Tier</span>
            <span className="text-sm font-mono text-muted-foreground">&gt; $3,000</span>
          </div>
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-foreground/80">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p>
              You can change these thresholds and assign approver tiers later in the <strong>Settings</strong> page.
            </p>
            <p>
              <strong>Note:</strong> You must also add your external auditors in the Auditor page. Without adding auditors, your payments will not be monitored.
            </p>
          </div>
        </div>
      </div>

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

      {error && (
        <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        onClick={handleInitialize}
        className="w-full h-12 text-base font-medium"
        disabled={isSubmitting || isConfirmed}
      >
        {isEncrypting ? (
          <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Encrypting defaults…</>
        ) : isWaitingForSignature ? (
          <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Waiting for MetaMask…</>
        ) : isConfirming ? (
          <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Confirming on Sepolia…</>
        ) : isConfirmed ? (
          "Initialized ✓"
        ) : (
          <>Initialize Account <ArrowRight className="ml-2 h-5 w-5" /></>
        )}
      </Button>
    </div>
  );
}
