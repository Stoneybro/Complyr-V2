"use client";

import React, { useState } from "react";
import { useTransactionHistory, type TransactionRow } from "@/hooks/useTransactionHistory";
import { useWalletClient, useChainId, usePublicClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import { formatUnits, type Abi } from "viem";
import { Loader2, Lock, Unlock, ArrowLeftRight, ShieldX, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { CATEGORY_LABELS } from "@/lib/audit-enums";
import { fheHandleToHex, type FheHandle } from "@/lib/fhe-handle";
import { getFhevmInstance } from "@/lib/fhe";
import { getDecryptSession } from "@/lib/decrypt-session";

const auditRegistryAbi = AuditRegistryAbi as Abi;

interface TransactionHistoryProps {
  auditRegistryAddress?: `0x${string}`;
  walletAddress?: `0x${string}`;
}

type DecryptState = "idle" | "decrypting" | "done" | "error";

type DecryptedPayment = {
  amount: string;
};

function formatAddress(addr: string) {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTimestamp(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day:   "numeric",
    year:  "numeric",
    hour:  "2-digit",
    minute: "2-digit",
  });
}

export function TransactionHistory({
  auditRegistryAddress,
  walletAddress,
}: TransactionHistoryProps) {
  const { rows, status, error, refetch } = useTransactionHistory(auditRegistryAddress, walletAddress);
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const [decryptStates, setDecryptStates] = useState<Record<number, DecryptState>>({});
  const [decryptedPayments, setDecryptedPayments] = useState<Record<number, DecryptedPayment>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleDecrypt = async (paymentId: number) => {
    if (!walletClient || !publicClient || !auditRegistryAddress || !walletAddress) return;
    setDecryptStates((s) => ({ ...s, [paymentId]: "decrypting" }));
    try {
      // 1. Fetch encrypted handles
      const handlesData = await publicClient.readContract({
        address: auditRegistryAddress,
        abi: auditRegistryAbi,
        functionName: "getPaymentHandles",
        args: [BigInt(paymentId)],
        account: walletAddress,
      });

      const [amountHandle, categoryHandle, authLevelHandle] = handlesData as [FheHandle, FheHandle, FheHandle];

      // 2. FHE decrypt session
      const fhevm = await getFhevmInstance();
      const session = await getDecryptSession(
        chainId,
        walletAddress,
        auditRegistryAddress,
        (typedData) =>
          walletClient.signTypedData(
            typedData as Parameters<typeof walletClient.signTypedData>[0]
          )
      );

      // 3. Encode handles as full bytes32
      const amountHex = fheHandleToHex(amountHandle);

      // 4. Decrypt just the amount
      const results = await fhevm.userDecrypt(
        [
          { handle: amountHex, contractAddress: auditRegistryAddress },
        ],
        session.privateKey,
        session.publicKey,
        session.signature,
        [auditRegistryAddress],
        walletAddress,
        session.startTimestamp,
        session.durationDays
      );

      const rawAmount = BigInt(results[amountHex] as bigint | string);

      const formatted: DecryptedPayment = {
        amount: `${Number(formatUnits(rawAmount, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`,
      };

      setDecryptedPayments((v) => ({ ...v, [paymentId]: formatted }));
      setDecryptStates((s) => ({ ...s, [paymentId]: "done" }));
    } catch (err) {
      console.error("Payment decryption failed:", err);
      setDecryptStates((s) => ({ ...s, [paymentId]: "error" }));
    }
  };

  const isLoading = status === "loading";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading payments…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
        <ShieldX className="h-10 w-10 text-destructive/50" />
        <p className="text-sm font-medium">Failed to load transactions</p>
        <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          Try again
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight">Transaction History</h2>
            <p className="text-sm text-muted-foreground">
              All onchain payments recorded in your audit registry.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="shrink-0 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <EmptyState
          icon={<ArrowLeftRight className="h-5 w-5" />}
          title="No transactions yet"
          description="Your onchain transaction history will appear here after your first payment."
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Transaction History</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} payment{rows.length !== 1 ? "s" : ""} recorded.
            Encrypted amounts can be decrypted on demand since you are the owner.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="shrink-0 gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Recipient</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const decryptState = decryptStates[row.paymentId] ?? "idle";
              const decrypted = decryptedPayments[row.paymentId];

              return (
                <tr key={row.paymentId} className="hover:bg-muted/20 transition-colors">
                  {/* Date */}
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(row.timestamp)}
                  </td>

                  {/* Recipient */}
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.recipient ? formatAddress(row.recipient) : "—"}
                  </td>

                  {/* Amount — always encrypted until decrypted */}
                  <td className="px-4 py-3">
                    {decrypted ? (
                      <span className="font-mono text-xs text-emerald-600">{decrypted.amount}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Encrypted
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant={decryptState === "done" ? "ghost" : "outline"}
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      disabled={decryptState === "decrypting" || decryptState === "done"}
                      onClick={() => handleDecrypt(row.paymentId)}
                      title={
                        decryptState === "error"
                          ? "Decryption failed — click to retry"
                          : undefined
                      }
                    >
                      {decryptState === "decrypting" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : decryptState === "done" ? (
                        <Unlock className="h-3 w-3" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                      {decryptState === "decrypting"
                        ? "Decrypting…"
                        : decryptState === "done"
                        ? "Decrypted"
                        : decryptState === "error"
                        ? "Retry"
                        : "Decrypt"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
