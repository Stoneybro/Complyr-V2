"use client";

import * as React from "react";
import { useState } from "react";
import { Loader2, ShieldAlert, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toHex, type Abi } from "viem";
import { sepolia } from "wagmi/chains";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { getFhevmInstance } from "@/lib/fhe";

interface ThresholdEditorProps {
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}

const USDC_DECIMALS = 6n;

function toTokenUnits(usdcAmount: string): bigint {
  const parsed = parseFloat(usdcAmount);
  if (isNaN(parsed) || parsed <= 0) throw new Error("Invalid amount");
  return BigInt(Math.round(parsed)) * 10n ** USDC_DECIMALS;
}

export function ThresholdEditor({
  auditRegistryAddress,
  walletAddress,
}: ThresholdEditorProps) {
  // Local state for the inputs. Since they are encrypted on-chain,
  // we can't easily fetch their plaintext defaults. 
  // We initialize the UI with the defaults we set during onboarding.
  const [managerThreshold, setManagerThreshold] = useState("500");
  const [directorThreshold, setDirectorThreshold] = useState("1500");
  const [boardThreshold, setBoardThreshold] = useState("3000");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");
    reset();

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
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      const fhevm = await getFhevmInstance();

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
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ThresholdInput
            id="manager"
            label="Manager Tier"
            desc="Requires Manager approval"
            value={managerThreshold}
            onChange={(e) => setManagerThreshold(e.target.value)}
          />
          <ThresholdInput
            id="director"
            label="Director Tier"
            desc="Requires Director approval"
            value={directorThreshold}
            onChange={(e) => setDirectorThreshold(e.target.value)}
          />
          <ThresholdInput
            id="board"
            label="Board Tier"
            desc="Requires Board approval"
            value={boardThreshold}
            onChange={(e) => setBoardThreshold(e.target.value)}
          />
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-foreground/80">
          <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p>
            Thresholds are FHE-encrypted client-side before submission. The contract stores only ciphertexts. All three values must be submitted together.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full md:w-auto"
          >
            {isEncrypting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Encrypting…</>
            ) : isWaitingForSignature ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming in Wallet…</>
            ) : isConfirming ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating onchain…</>
            ) : isConfirmed ? (
              <><Check className="mr-2 h-4 w-4" />Saved Successfully</>
            ) : (
              "Save Thresholds"
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
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <input
          id={id}
          type="number"
          required
          min="1"
          value={value}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input bg-background pl-7 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="0"
        />
      </div>
      <p className="text-[13px] text-muted-foreground">{desc}</p>
    </div>
  );
}
