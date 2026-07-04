"use client";

import * as React from "react";
import { useState } from "react";
import { Loader2, Plus, UserX, Check, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toHex, isAddress } from "viem";
import { sepolia } from "wagmi/chains";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { getFhevmInstance } from "@/lib/fhe";

interface ApproverManagementProps {
  auditRegistryAddress: `0x${string}`;
}

export function ApproverManagement({ auditRegistryAddress }: ApproverManagementProps) {
  const [approverAddress, setApproverAddress] = useState("");
  const [selectedTier, setSelectedTier] = useState<string>("0");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [error, setError] = useState("");

  const {
    writeContract: writeAuth,
    data: authTxHash,
    isPending: isAuthWaiting,
    reset: resetAuth,
  } = useWriteContract();

  const { isLoading: isAuthConfirming, isSuccess: isAuthConfirmed } =
    useWaitForTransactionReceipt({ hash: authTxHash, chainId: sepolia.id });

  const {
    writeContract: writeTier,
    data: tierTxHash,
    isPending: isTierWaiting,
    reset: resetTier,
  } = useWriteContract();

  const { isLoading: isTierConfirming, isSuccess: isTierConfirmed } =
    useWaitForTransactionReceipt({ hash: tierTxHash, chainId: sepolia.id });

  const handleAuthorize = (authorized: boolean) => {
    setError("");
    resetAuth();
    if (!isAddress(approverAddress)) {
      setError("Invalid Ethereum address.");
      return;
    }
    writeAuth({
      address: auditRegistryAddress,
      abi: AuditRegistryAbi,
      functionName: "setAuthorizedApprover",
      args: [approverAddress as `0x${string}`, authorized],
      chainId: sepolia.id,
    });
  };

  const handleSetTier = async () => {
    setError("");
    resetTier();
    if (!isAddress(approverAddress)) {
      setError("Invalid Ethereum address.");
      return;
    }

    setIsEncrypting(true);
    try {
      const fhevm = await getFhevmInstance();
      const input = fhevm.createEncryptedInput(auditRegistryAddress, approverAddress);
      input.add8(parseInt(selectedTier, 10));
      const encrypted = await input.encrypt();

      const encTier = toHex(encrypted.handles[0]) as `0x${string}`;
      const inputProof = toHex(encrypted.inputProof) as `0x${string}`;

      writeTier({
        address: auditRegistryAddress,
        abi: AuditRegistryAbi,
        functionName: "setApproverTier",
        args: [approverAddress as `0x${string}`, encTier, inputProof],
        chainId: sepolia.id,
      });
    } catch (err) {
      console.error("FHE encryption error:", err);
      setError(err instanceof Error ? err.message : "Encryption failed. Please retry.");
    } finally {
      setIsEncrypting(false);
    }
  };

  const isSubmittingAuth = isAuthWaiting || isAuthConfirming;
  const isSubmittingTier = isEncrypting || isTierWaiting || isTierConfirming;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Approver Wallet Address
          </label>
          <input
            type="text"
            value={approverAddress}
            onChange={(e) => setApproverAddress(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="0x..."
          />
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Authorize Section */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-4 border-b border-border">
          <Button
            variant="default"
            onClick={() => handleAuthorize(true)}
            disabled={isSubmittingAuth || !approverAddress}
            className="flex-1"
          >
            {isSubmittingAuth ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isAuthConfirmed ? (
              <><Check className="mr-2 h-4 w-4" /> Authorized</>
            ) : (
              <><Plus className="mr-2 h-4 w-4" /> Authorize Approver</>
            )}
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleAuthorize(false)}
            disabled={isSubmittingAuth || !approverAddress}
            className="flex-1"
          >
            <UserX className="mr-2 h-4 w-4" /> Remove Approver
          </Button>
        </div>

        {/* Tier Section */}
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Optional: Assign Approver Tier
            </label>
            <p className="text-xs text-muted-foreground">
              Tiers are used strictly to check for authorization breaches. If not set, the approver can still approve payments, but tests may flag it. The approver must be authorized first.
            </p>
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-2"
            >
              <option value="0">Routine (Level 0)</option>
              <option value="1">Manager (Level 1)</option>
              <option value="2">Director (Level 2)</option>
              <option value="3">Board (Level 3)</option>
            </select>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-foreground/80">
            <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p>
              Tiers are FHE-encrypted client-side. The contract stores only ciphertexts, ensuring internal hierarchies remain confidential.
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={handleSetTier}
            disabled={isSubmittingTier || !approverAddress}
            className="w-full"
          >
            {isEncrypting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Encrypting…</>
            ) : isTierWaiting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming in Wallet…</>
            ) : isTierConfirming ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating onchain…</>
            ) : isTierConfirmed ? (
              <><Check className="mr-2 h-4 w-4" />Tier Set</>
            ) : (
              "Set Encrypted Tier"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
