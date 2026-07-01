"use client";

/**
 * useBatchTransfer — real on-chain implementation.
 *
 * For each recipient:
 *   1. Client-side FHE encrypt amount (euint64) + category (euint8) for that recipient.
 *      Each recipient gets its own createEncryptedInput call (separate inputProof per tx).
 *   2. Call ConfidentialUSDC.confidentialTransferAndCallWithAudit() for that recipient.
 *   3. Await each receipt sequentially to avoid nonce collisions.
 */

import { useMutation } from "@tanstack/react-query";
import { useWriteContract } from "wagmi";
import { toHex } from "viem";
import { sepolia } from "wagmi/chains";
import { toast } from "sonner";
import { getFhevmInstance } from "@/lib/fhe";
import { stringToCategory } from "@/lib/audit-enums";
import ConfidentialUSDCAbi from "@/lib/abis/ConfidentialUSDC.json";
import { ConfidentialUSDCAddress } from "@/lib/CA";

const ZERO_BYTES32 = "0x" + "00".repeat(32) as `0x${string}`;
const USDC_DECIMALS = 6n;

function toTokenUnits(amount: string): bigint {
  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0) throw new Error("Invalid amount");
  return BigInt(Math.round(parsed * 1_000_000)) * 10n ** (USDC_DECIMALS - 6n);
}

export interface BatchRecipient {
  address: `0x${string}`;
  amount: string;
  category: string;
  invoiceHash?: `0x${string}`;
  poHash?: `0x${string}`;
}

export interface BatchTransferParams {
  recipients: BatchRecipient[];
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  onStatusUpdate?: (status: string) => void;
  onProgress?: (done: number, total: number) => void;
}

export function useBatchTransfer() {
  const { writeContractAsync } = useWriteContract();

  return useMutation({
    mutationFn: async (data: BatchTransferParams) => {
      const { recipients, walletAddress, onStatusUpdate, onProgress } = data;
      const fhevm = await getFhevmInstance();
      const txHashes: `0x${string}`[] = [];

      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        onStatusUpdate?.(`Encrypting ${i + 1}/${recipients.length}…`);

        // Each recipient: independent encrypt call → its own inputProof
        const input = fhevm.createEncryptedInput(
          ConfidentialUSDCAddress,
          walletAddress
        );
        input.add64(toTokenUnits(r.amount));
        input.add8(stringToCategory(r.category));
        const encrypted = await input.encrypt();

        const encAmount   = toHex(encrypted.handles[0]) as `0x${string}`;
        const encCategory = toHex(encrypted.handles[1]) as `0x${string}`;
        const amountProof = toHex(encrypted.inputProof) as `0x${string}`;

        onStatusUpdate?.(`Signing ${i + 1}/${recipients.length}…`);

        const txHash = await writeContractAsync({
          address: ConfidentialUSDCAddress as `0x${string}`,
          abi: ConfidentialUSDCAbi,
          functionName: "confidentialTransferAndCallWithAudit",
          args: [
            data.auditRegistryAddress,
            encAmount,
            amountProof,
            {
              category: encCategory,
              inputProof: amountProof,
              recipient: r.address,
              invoiceHash: r.invoiceHash ?? ZERO_BYTES32,
              poHash: r.poHash ?? ZERO_BYTES32,
            },
          ],
          chainId: sepolia.id,
        });

        txHashes.push(txHash);
        onProgress?.(i + 1, recipients.length);
      }

      onStatusUpdate?.("Complete");
      return { txHashes };
    },
    onSuccess: ({ txHashes }) => {
      toast.success(`${txHashes.length} payments sent!`, {
        description: `${txHashes.length} transactions submitted to Sepolia.`,
      });
    },
    onError: (err: Error) => {
      toast.error("Batch payment failed", {
        description: err.message?.slice(0, 120),
      });
    },
  });
}
