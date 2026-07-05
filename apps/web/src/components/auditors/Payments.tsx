"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useWalletClient, useChainId } from "wagmi";
import { formatUnits } from "viem";
import { sepolia } from "wagmi/chains";
import {
  Loader2,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { CATEGORY_LABELS } from "@/lib/audit-enums";
import { fheHandleToHex, type FheHandle } from "@/lib/fhe-handle";
import { getFhevmInstance } from "@/lib/fhe";
import { getDecryptSession } from "@/lib/decrypt-session";
import type { Abi } from "viem";

const auditRegistryAbi = AuditRegistryAbi as Abi;

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function truncateHash(hash: string | undefined): string {
  const zero = "0x" + "0".repeat(64);
  if (!hash || hash === zero) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

interface PaymentsProps {
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}

type DecryptState = "idle" | "decrypting" | "done" | "error";

type PaymentMeta = {
  paymentId: number;
  recipient: string;
  approver: string;
  invoiceHash: string;
  poHash: string;
  blockNumber: number;
  approved: boolean;
};

type DecryptedPayment = {
  amount: string;        // formatted USDC
  category: string;      // GL category label
  authLevel: string;     // ROUTINE / MANAGER / DIRECTOR / BOARD
};

const AUTH_LEVEL_LABELS: Record<number, string> = {
  0: "Routine",
  1: "Manager",
  2: "Director",
  3: "Board",
};

export function Payments({ auditRegistryAddress, walletAddress }: PaymentsProps) {
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const [decryptStates, setDecryptStates] = useState<Record<number, DecryptState>>({});
  const [decryptedPayments, setDecryptedPayments] = useState<Record<number, DecryptedPayment>>({});
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // ── Step 1: payment count ─────────────────────────────────────────────────
  const { data: countData, isLoading: countLoading } = useQuery({
    queryKey: ["payment-count", auditRegistryAddress],
    queryFn: async () => {
      if (!publicClient) return 0;
      const result = await publicClient.readContract({
        address: auditRegistryAddress,
        abi: auditRegistryAbi,
        functionName: "paymentCount",
      });
      return Number(result ?? 0);
    },
    enabled: !!publicClient,
    refetchInterval: 10_000,
  });

  const paymentCount = countData ?? 0;

  // ── Step 2: which payments has the business granted this auditor access to ─
  // paymentAccessGranted has no msg.sender gate — Multicall3 is fine here.
  const { data: accessResults, isLoading: accessLoading } = useQuery({
    queryKey: ["payment-access", auditRegistryAddress, walletAddress, paymentCount],
    queryFn: async () => {
      if (!publicClient || paymentCount === 0) return [];
      const results = await Promise.all(
        Array.from({ length: paymentCount }, (_, i) =>
          publicClient.readContract({
            address: auditRegistryAddress,
            abi: auditRegistryAbi,
            functionName: "paymentAccessGranted",
            args: [walletAddress, BigInt(i)],
          })
        )
      );
      return results.map((r, i) => ({ paymentId: i, granted: Boolean(r) }));
    },
    enabled: !!publicClient && paymentCount > 0,
    refetchInterval: 10_000,
  });

  const inScopeIds = useMemo(
    () => (accessResults ?? []).filter((r) => r.granted).map((r) => r.paymentId),
    [accessResults]
  );

  // ── Step 3: getPaymentMeta for in-scope payments ──────────────────────────
  // getPaymentMeta checks _canReadPayment(msg.sender). Multicall3 would set
  // msg.sender = 0x0 which fails (only FULL auditors, owner, sender, recipient pass).
  // Must use direct readContract with account= walletAddress.
  const { data: metaResults, isLoading: metaLoading } = useQuery({
    queryKey: ["payment-meta", auditRegistryAddress, walletAddress, inScopeIds.join(",")],
    queryFn: async () => {
      if (!publicClient || inScopeIds.length === 0) return [];
      const results = await Promise.all(
        inScopeIds.map((id) =>
          publicClient.readContract({
            address: auditRegistryAddress,
            abi: auditRegistryAbi,
            functionName: "getPaymentMeta",
            args: [BigInt(id)],
            account: walletAddress,
          })
        )
      );
      return results.map((r, i) => {
        const t = r as readonly [string, string, string, string, string, number, boolean] | undefined;
        if (!t) return null;
        return {
          paymentId:   inScopeIds[i],
          recipient:   t[1],
          approver:    t[2],
          invoiceHash: t[3] as string,
          poHash:      t[4] as string,
          blockNumber: Number(t[5]),
          approved:    t[6],
        } satisfies PaymentMeta;
      }).filter(Boolean) as PaymentMeta[];
    },
    enabled: !!publicClient && inScopeIds.length > 0,
    refetchInterval: 10_000,
  });

  const paymentRows = metaResults ?? [];
  const isLoading = countLoading || accessLoading || metaLoading;

  // ── Decrypt a single payment ──────────────────────────────────────────────
  // getPaymentHandles also checks _canReadPayment — same account= pattern needed.
  const handleDecrypt = async (paymentId: number) => {
    if (!walletClient || !publicClient) return;
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

      // 2. FHE decrypt session (signs once per tab session)
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

      // 3. Encode handles as full bytes32 — toHex preserves the FHEVM layout
      const amountHex    = fheHandleToHex(amountHandle);
      const categoryHex  = fheHandleToHex(categoryHandle);
      const authHex      = fheHandleToHex(authLevelHandle);

      const results = await fhevm.userDecrypt(
        [
          { handle: amountHex,   contractAddress: auditRegistryAddress },
          { handle: categoryHex, contractAddress: auditRegistryAddress },
          { handle: authHex,     contractAddress: auditRegistryAddress },
        ],
        session.privateKey,
        session.publicKey,
        session.signature,
        [auditRegistryAddress],
        walletAddress,
        session.startTimestamp,
        session.durationDays
      );

      const rawAmount   = BigInt(results[amountHex]   as bigint | string);
      const rawCategory = Number(results[categoryHex] as bigint | string);
      const rawAuth     = Number(results[authHex]     as bigint | string);

      const formatted: DecryptedPayment = {
        amount:    `${Number(formatUnits(rawAmount, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`,
        category:  CATEGORY_LABELS[rawCategory] ?? `Category ${rawCategory}`,
        authLevel: AUTH_LEVEL_LABELS[rawAuth] ?? `Level ${rawAuth}`,
      };

      setDecryptedPayments((v) => ({ ...v, [paymentId]: formatted }));
      setDecryptStates((s) => ({ ...s, [paymentId]: "done" }));
      setExpandedRows((prev) => new Set(prev).add(paymentId));
    } catch (err) {
      console.error("Payment decryption failed:", err);
      setDecryptStates((s) => ({ ...s, [paymentId]: "error" }));
    }
  };

  const toggleExpand = (paymentId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) {
        next.delete(paymentId);
      } else {
        next.add(paymentId);
      }
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading payments…
      </div>
    );
  }

  if (paymentRows.length === 0) {
    return (
      <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
        <div className="flex flex-col gap-1 border-b border-border pb-6">
          <h2 className="text-2xl font-semibold tracking-tight">Payments</h2>
          <p className="text-sm text-muted-foreground">
            Payments within your engagement scope. Only records you have been explicitly granted access to are shown.
          </p>
        </div>
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title="No in-scope payments"
          description="Ask the business owner to grant historical access, or wait for new payments to be recorded after your engagement started."
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
      <div className="flex flex-col gap-1 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Payments</h2>
        <p className="text-sm text-muted-foreground">
          {paymentRows.length} payment{paymentRows.length !== 1 ? "s" : ""} in scope.
          Encrypted amounts, categories and authorization levels can be decrypted on demand.
        </p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">ID</th>
              <th className="text-left px-4 py-3 font-medium">Recipient</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Evidence</th>
              <th className="text-left px-4 py-3 font-medium">Block</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paymentRows.map((row) => {
              const decryptState = decryptStates[row.paymentId] ?? "idle";
              const decrypted = decryptedPayments[row.paymentId];
              const isExpanded = expandedRows.has(row.paymentId);
              const zeroHash = "0x" + "0".repeat(64);

              return (
                <React.Fragment key={row.paymentId}>
                  <tr className="hover:bg-muted/20 transition-colors">
                    {/* ID */}
                    <td className="px-4 py-3 font-mono text-xs">#{row.paymentId}</td>

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

                    {/* Approval status */}
                    <td className="px-4 py-3">
                      {row.approved ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-0">
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </td>

                    {/* Evidence hashes */}
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground space-x-2">
                      {row.invoiceHash && row.invoiceHash !== zeroHash ? (
                        <span className="text-emerald-600" title={row.invoiceHash}>INV ✓</span>
                      ) : (
                        <span className="text-muted-foreground/50">INV —</span>
                      )}
                      {row.poHash && row.poHash !== zeroHash ? (
                        <span className="text-emerald-600" title={row.poHash}>PO ✓</span>
                      ) : (
                        <span className="text-muted-foreground/50">PO —</span>
                      )}
                    </td>

                    {/* Block */}
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {row.blockNumber > 0 ? row.blockNumber : "—"}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {decryptState === "done" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => toggleExpand(row.paymentId)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            {isExpanded ? "Collapse" : "Details"}
                          </Button>
                        )}
                        <Button
                          variant={decryptState === "done" ? "ghost" : "outline"}
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          disabled={decryptState === "decrypting"}
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
                            ? "Re-decrypt"
                            : decryptState === "error"
                            ? "Retry"
                            : "Decrypt"}
                        </Button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded details panel */}
                  {isExpanded && decrypted && (
                    <tr className="bg-muted/10">
                      <td colSpan={7} className="px-6 py-5">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs">
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              Amount
                            </p>
                            <p className="font-mono text-emerald-600 font-semibold text-sm">
                              {decrypted.amount}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              GL Category
                            </p>
                            <p className="font-medium">{decrypted.category}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              Auth Level Required
                            </p>
                            <p className="font-medium">{decrypted.authLevel}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              Approver
                            </p>
                            <p className="font-mono">
                              {row.approver && row.approver !== "0x" + "0".repeat(40)
                                ? formatAddress(row.approver)
                                : "—"}
                            </p>
                          </div>
                        </div>

                        {/* Evidence hashes expanded */}
                        <div className="mt-4 grid grid-cols-2 gap-4 text-xs border-t border-border pt-4">
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              Invoice Hash
                            </p>
                            <p className="font-mono text-muted-foreground break-all">
                              {truncateHash(row.invoiceHash)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              PO Hash
                            </p>
                            <p className="font-mono text-muted-foreground break-all">
                              {truncateHash(row.poHash)}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
