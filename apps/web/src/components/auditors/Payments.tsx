"use client";

import React, { useMemo, useState } from "react";
import { useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Loader2, Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { CATEGORY_LABELS } from "@/lib/audit-enums";
import { getFhevmInstance } from "@/lib/fhe";
import type { Abi } from "viem";

const auditRegistryAbi = AuditRegistryAbi as Abi;
const USDC_DECIMALS = 1_000_000n;

function formatUsdc(raw: bigint): string {
  const whole = raw / USDC_DECIMALS;
  const frac = (raw % USDC_DECIMALS).toString().padStart(6, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${frac}`;
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function truncateHash(hash: string) {
  return hash && hash !== "0x" + "0".repeat(64)
    ? `${hash.slice(0, 10)}…${hash.slice(-6)}`
    : "—";
}

interface PaymentsProps {
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}

type DecryptedField = string | null;
type DecryptState = "idle" | "decrypting" | "done" | "error";

type PaymentRow = {
  paymentId: number;
  hasAccess: boolean;
  // plaintext from getPaymentMeta
  sender?: string;
  recipient?: string;
  approver?: string;
  invoiceHash?: string;
  poHash?: string;
  blockNumber?: number;
  approved?: boolean;
  // decrypt state
  amountDecrypt: DecryptState;
  amountValue: DecryptedField;
};

export function Payments({ auditRegistryAddress, walletAddress }: PaymentsProps) {
  const [decryptingRow, setDecryptingRow] = useState<number | null>(null);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Step 1: get payment count
  const { data: countData, isLoading: countLoading } = useReadContracts({
    contracts: [
      {
        address: auditRegistryAddress,
        abi: auditRegistryAbi,
        functionName: "paymentCount",
        chainId: sepolia.id,
      },
    ],
  });

  const paymentCount = Number(countData?.[0]?.result ?? 0);

  // Step 2: batch-check access for all payments
  const { data: accessData, isLoading: accessLoading } = useReadContracts({
    contracts: Array.from({ length: paymentCount }, (_, i) => ({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "paymentAccessGranted",
      args: [walletAddress, BigInt(i)],
      chainId: sepolia.id,
    })),
    query: { enabled: paymentCount > 0 },
  });

  const inScopeIds = useMemo(
    () =>
      Array.from({ length: paymentCount }, (_, i) => i).filter(
        (i) => accessData?.[i]?.result === true
      ),
    [accessData, paymentCount]
  );

  // Step 3: batch-fetch getPaymentMeta for in-scope payments only
  const { data: metaData, isLoading: metaLoading } = useReadContracts({
    contracts: inScopeIds.map((id) => ({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "getPaymentMeta",
      args: [BigInt(id)],
      chainId: sepolia.id,
    })),
    query: { enabled: inScopeIds.length > 0 },
  });

  const paymentRows: PaymentRow[] = useMemo(() => {
    return inScopeIds.map((id, i) => {
      const meta = metaData?.[i]?.result as
        | readonly [string, string, string, string, string, number, boolean]
        | undefined;
      const existing = rows.find((r) => r.paymentId === id);
      return {
        paymentId: id,
        hasAccess: true,
        sender: meta?.[0],
        recipient: meta?.[1],
        approver: meta?.[2],
        invoiceHash: meta?.[3],
        poHash: meta?.[4],
        blockNumber: meta ? Number(meta[5]) : undefined,
        approved: meta?.[6],
        amountDecrypt: existing?.amountDecrypt ?? "idle",
        amountValue: existing?.amountValue ?? null,
      };
    });
  }, [inScopeIds, metaData, rows]);

  const isLoading = countLoading || accessLoading || metaLoading;

  const handleDecryptAmount = async (paymentId: number) => {
    setDecryptingRow(paymentId);
    setRows((prev) =>
      prev.map((r) =>
        r.paymentId === paymentId ? { ...r, amountDecrypt: "decrypting" } : r
      )
    );

    try {
      // Fetch the encrypted amount handle
      const fhevm = await getFhevmInstance();
      const handleResult = await (
        fetch  // placeholder — will use wagmi readContract in production
      );
      // Decrypt via FHE instance
      setRows((prev) =>
        prev.map((r) =>
          r.paymentId === paymentId
            ? { ...r, amountDecrypt: "done", amountValue: "Decrypted (placeholder)" }
            : r
        )
      );
    } catch {
      setRows((prev) =>
        prev.map((r) =>
          r.paymentId === paymentId ? { ...r, amountDecrypt: "error" } : r
        )
      );
    } finally {
      setDecryptingRow(null);
    }
  };

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
          {paymentRows.length} payment{paymentRows.length !== 1 ? "s" : ""} in scope. Encrypted amounts can be decrypted on demand.
        </p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">ID</th>
              <th className="text-left px-4 py-3 font-medium">Sender</th>
              <th className="text-left px-4 py-3 font-medium">Recipient</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Evidence</th>
              <th className="text-left px-4 py-3 font-medium">Block</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paymentRows.map((row) => (
              <tr key={row.paymentId} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-xs">#{row.paymentId}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {row.sender ? formatAddress(row.sender) : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {row.recipient ? formatAddress(row.recipient) : "—"}
                </td>
                <td className="px-4 py-3">
                  {row.amountDecrypt === "done" ? (
                    <span className="font-mono text-xs text-emerald-600">{row.amountValue}</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 px-2"
                      disabled={row.amountDecrypt === "decrypting"}
                      onClick={() => handleDecryptAmount(row.paymentId)}
                    >
                      {row.amountDecrypt === "decrypting" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Lock className="h-3 w-3" />
                          Decrypt
                        </>
                      )}
                    </Button>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.approved ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-0">Approved</Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground space-x-2">
                  {row.invoiceHash && row.invoiceHash !== ("0x" + "0".repeat(64)) ? (
                    <span title="Invoice hash present" className="text-emerald-600">INV ✓</span>
                  ) : (
                    <span className="text-muted-foreground/50">INV —</span>
                  )}
                  {row.poHash && row.poHash !== ("0x" + "0".repeat(64)) ? (
                    <span title="PO hash present" className="text-emerald-600">PO ✓</span>
                  ) : (
                    <span className="text-muted-foreground/50">PO —</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {row.blockNumber ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
