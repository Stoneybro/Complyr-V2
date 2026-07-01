"use client";

/**
 * useSingleTransfer — real on-chain implementation.
 *
 * Flow:
 *   1. Client-side FHE encrypt amount (euint64) + category (euint8) via Zama SDK.
 *      Both values go into one createEncryptedInput call → single shared inputProof.
 *   2. Call ConfidentialUSDC.confidentialTransferAndCallWithAudit(
 *        to, encAmount, amountProof, { category, inputProof, recipient, invoiceHash, poHash }
 *      ) via wagmi writeContractAsync.
 *   3. Wait for receipt.
 */

import { useMutation } from "@tanstack/react-query";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
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

export interface SingleTransferParams {
  to: `0x${string}`;
  amount: string;           // USDC string, e.g. "500"
  category: string;         // GL category string
  invoiceHash?: `0x${string}`;
  poHash?: `0x${string}`;
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  onStatusUpdate?: (status: string) => void;
}

export function useSingleTransfer() {
  const { writeContractAsync } = useWriteContract();

  return useMutation({
    mutationFn: async (data: SingleTransferParams) => {
      const {
        to,
        amount,
        category,
        invoiceHash,
        poHash,
        auditRegistryAddress,
        walletAddress,
        onStatusUpdate,
      } = data;

      // ── Step 1: FHE encrypt amount + category client-side ──────────────────
      onStatusUpdate?.("Encrypting with Zama FHE…");

      const fhevm = await getFhevmInstance();
      const input = fhevm.createEncryptedInput(
        ConfidentialUSDCAddress,
        walletAddress
      );
      input.add64(toTokenUnits(amount));                 // handle[0] = encAmount
      input.add8(stringToCategory(category));            // handle[1] = encCategory
      const encrypted = await input.encrypt();

      const encAmount   = toHex(encrypted.handles[0]) as `0x${string}`;
      const encCategory = toHex(encrypted.handles[1]) as `0x${string}`;
      const amountProof = toHex(encrypted.inputProof)  as `0x${string}`;

      // inputProof for the audit fields struct is the same shared proof
      const auditInputProof = amountProof;

      // ── Step 2: Submit to ConfidentialUSDC ────────────────────────────────
      onStatusUpdate?.("Waiting for MetaMask…");

      const txHash = await writeContractAsync({
        address: ConfidentialUSDCAddress as `0x${string}`,
        abi: ConfidentialUSDCAbi,
        functionName: "confidentialTransferAndCallWithAudit",
        args: [
          to,
          encAmount,
          amountProof,
          {
            category: encCategory,
            inputProof: auditInputProof,
            recipient: to,
            invoiceHash: invoiceHash ?? ZERO_BYTES32,
            poHash: poHash ?? ZERO_BYTES32,
          },
        ],
        chainId: sepolia.id,
      });

      onStatusUpdate?.("Confirming…");
      return { txHash };
    },
    onSuccess: ({ txHash }) => {
      toast.success("Payment sent!", {
        description: (
          `${txHash.slice(0, 10)}…${txHash.slice(-8)}`
        ),
        action: {
          label: "View",
          onClick: () =>
            window.open(`https://sepolia.etherscan.io/tx/${txHash}`, "_blank"),
        },
      });
    },
    onError: (err: Error) => {
      toast.error("Payment failed", {
        description: err.message?.slice(0, 120),
      });
    },
  });
}
