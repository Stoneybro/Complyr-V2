"use client";

import * as React from "react";
import { useState } from "react";
import { ArrowRight, Loader2, ShieldAlert, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toHex } from "viem";
import { sepolia } from "wagmi/chains";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { getFhevmInstance } from "@/lib/fhe";

interface SetThresholdsStepProps {
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  onConfigured: () => void;
}

const USDC_DECIMALS = 6n;

/** Convert a user-entered USDC string ("1000") to token base units (BigInt) */
function toTokenUnits(usdcAmount: string): bigint {
  const parsed = parseFloat(usdcAmount);
  if (isNaN(parsed) || parsed <= 0) throw new Error("Invalid amount");
  return BigInt(Math.round(parsed)) * 10n ** USDC_DECIMALS;
}

/**
 * Step 2 — Set Delegation of Authority thresholds on the business's AuditRegistry clone.
 *
 * Uses @zama-fhe/relayer-sdk to client-side encrypt three euint64 values
 * (managerThreshold, directorThreshold, boardThreshold) and submits them to
 * AuditRegistry.setAuthTierThresholds() via wagmi.
 *
 * The contract derives all future payment auth levels from these thresholds
 * using FHE comparisons — no plaintext is ever stored on-chain.
 */
export function SetThresholdsStep({
  auditRegistryAddress,
  walletAddress,
  onConfigured,
}: SetThresholdsStepProps) {
  const [managerThreshold, setManagerThreshold] = useState("1000");
  const [directorThreshold, setDirectorThreshold] = useState("10000");
  const [boardThreshold, setBoardThreshold] = useState("50000");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");
    reset();

    // Validate ordering
    const mgr = parseFloat(managerThreshold);
    const dir = parseFloat(directorThreshold);
    const brd = parseFloat(boardThreshold);

    if (mgr >= dir) {
      setValidationError("Director threshold must be greater than Manager threshold.");
      return;
    }
    if (dir >= brd) {
      setValidationError("Board threshold must be greater than Director threshold.");
      return;
    }

    setIsEncrypting(true);
    try {
      // Step 1 — Initialize the Zama FHE instance (singleton, no re-init on repeat)
      const fhevm = await getFhevmInstance();

      // Step 2 — Create a single encrypted input with all 3 threshold values.
      // A single shared inputProof covers all handles from one encrypt() call.
      const input = fhevm.createEncryptedInput(auditRegistryAddress, walletAddress);
      input.add64(toTokenUnits(managerThreshold));
      input.add64(toTokenUnits(directorThreshold));
      input.add64(toTokenUnits(boardThreshold));
      const encrypted = await input.encrypt();

      // handles: Uint8Array[] → convert each to 0x-hex for ABI encoding
      const encManager  = toHex(encrypted.handles[0]) as `0x${string}`;
      const encDirector = toHex(encrypted.handles[1]) as `0x${string}`;
      const encBoard    = toHex(encrypted.handles[2]) as `0x${string}`;
      const inputProof  = toHex(encrypted.inputProof) as `0x${string}`;

      // Step 3 — Submit to contract
      writeContract({
        address: auditRegistryAddress,
        abi: AuditRegistryAbi,
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
        Set authorization thresholds
      </h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
        Define the monetary thresholds for each approval tier. Payments exceeding these
        amounts will automatically require higher-level cryptographic signatures.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <ThresholdInput
            id="manager"
            label="Manager Tier"
            desc="Payments above this amount require Manager approval"
            value={managerThreshold}
            onChange={(e) => setManagerThreshold(e.target.value)}
          />
          <ThresholdInput
            id="director"
            label="Director Tier"
            desc="Payments above this amount require Director approval"
            value={directorThreshold}
            onChange={(e) => setDirectorThreshold(e.target.value)}
          />
          <ThresholdInput
            id="board"
            label="Board Tier"
            desc="Payments above this amount require full Board approval"
            value={boardThreshold}
            onChange={(e) => setBoardThreshold(e.target.value)}
          />
        </div>

        <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-foreground/80">
          <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p>
            These thresholds are FHE-encrypted client-side via the Zama SDK before being
            submitted. The contract stores only ciphertexts — no plaintext amount is ever
            written on-chain.
          </p>
        </div>

        {/* Tx hash link */}
        {txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-primary hover:underline font-mono"
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="pt-2">
          <Button
            type="submit"
            className="w-full h-12 text-base font-medium"
            disabled={isSubmitting || isConfirmed}
          >
            {isEncrypting ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Encrypting with Zama FHE…</>
            ) : isWaitingForSignature ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Waiting for MetaMask…</>
            ) : isConfirming ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Confirming on Sepolia…</>
            ) : isConfirmed ? (
              "Thresholds saved ✓"
            ) : (
              <>Save thresholds <ArrowRight className="ml-2 h-5 w-5" /></>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ThresholdInput({
  id,
  label,
  desc,
  value,
  onChange,
}: {
  id: string;
  label: string;
  desc: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <input
          id={id}
          type="number"
          required
          min="1"
          value={value}
          onChange={onChange}
          className="flex h-11 w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="0"
        />
      </div>
      <p className="text-[13px] text-muted-foreground">{desc}</p>
    </div>
  );
}
