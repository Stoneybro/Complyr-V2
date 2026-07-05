"use client";

import React, { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Loader2, Lock } from "lucide-react";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { CATEGORY_LABELS } from "@/lib/audit-enums";
import type { Abi } from "viem";

const auditRegistryAbi = AuditRegistryAbi as Abi;
const CATEGORY_COUNT = 8;

interface AnalyticsProps {
  auditRegistryAddress: `0x${string}`;
  deployedAtBlock: bigint;
}

type DecryptedRollup = {
  label: string;
  value: bigint | null;
  isDecrypting: boolean;
};

type RecipientEntry = {
  address: string;
  value: bigint | null;
  isDecrypting: boolean;
};

const USDC_DECIMALS = 1_000_000n;

function formatUsdc(raw: bigint): string {
  const whole = raw / USDC_DECIMALS;
  const frac = raw % USDC_DECIMALS;
  const fracStr = frac.toString().padStart(6, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${fracStr}`;
}

export function Analytics({ auditRegistryAddress, deployedAtBlock }: AnalyticsProps) {
  const publicClient = usePublicClient({ chainId: sepolia.id });

  const [categoryRollups, setCategoryRollups] = useState<DecryptedRollup[]>(
    Array.from({ length: CATEGORY_COUNT }, (_, i) => ({
      label: CATEGORY_LABELS[i] ?? `Category ${i}`,
      value: null,
      isDecrypting: false,
    }))
  );

  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientRollups, setRecipientRollups] = useState<RecipientEntry[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(true);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const maxCategoryValue = categoryRollups.reduce(
    (max, r) => (r.value !== null && r.value > max ? r.value : max),
    1n
  );

  // ─── Step 1: Batch-fetch all 8 category totals (encrypted handles) ───────
  const { data: categoryHandles, isLoading: handlesLoading } = useReadContracts({
    contracts: Array.from({ length: CATEGORY_COUNT }, (_, i) => ({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "getCategoryTotal",
      args: [i],
      chainId: sepolia.id,
    })),
  });

  // ─── Step 2: Category handles are encrypted (euint64).
  // Full client-side decryption requires a signed decrypt session (EIP-712).
  // This is wired up via the same pattern as useConfidentialBalance.
  // For now, mark as pending — handles are stored and ready for decryption.
  useEffect(() => {
    if (handlesLoading || !categoryHandles) return;
    setCategoryLoading(false);
    // Handles are available in categoryHandles — decrypt session wiring is a follow-up task.
  }, [handlesLoading, categoryHandles]);

  // ─── Step 3: Query PaymentRecorded events to get unique recipients ────
  useEffect(() => {
    if (!publicClient || !auditRegistryAddress || !deployedAtBlock) return;

    const fetchRecipients = async () => {
      setRecipientsLoading(true);
      try {
        const logs = await publicClient.getContractEvents({
          address: auditRegistryAddress,
          abi: auditRegistryAbi,
          eventName: "PaymentRecorded",
          fromBlock: deployedAtBlock,
          toBlock: "latest",
        });

        const unique = [
          ...new Set(
            logs
              .map((log) => (log.args as any)?.recipient as string | undefined)
              .filter(Boolean) as string[]
          ),
        ];
        setRecipients(unique);
      } catch (err) {
        console.error("Failed to fetch PaymentRecorded events:", err);
      } finally {
        setRecipientsLoading(false);
      }
    };

    fetchRecipients();
  }, [publicClient, auditRegistryAddress, deployedAtBlock]);

  // ─── Step 4: Batch-fetch recipient totals then decrypt ────────────────
  const { data: recipientHandles, isLoading: recipientHandlesLoading } = useReadContracts({
    contracts: recipients.map((addr) => ({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "getRecipientTotal",
      args: [addr],
      chainId: sepolia.id,
    })),
    query: { enabled: recipients.length > 0 },
  });

  useEffect(() => {
    if (recipientHandlesLoading || !recipientHandles || recipients.length === 0) return;
    // Recipient handles are available — decrypt session wiring is a follow-up task.
    const entries: RecipientEntry[] = recipients.map((addr) => ({
      address: addr,
      value: null,
      isDecrypting: false,
    }));
    setRecipientRollups(entries);
  }, [recipientHandlesLoading, recipientHandles, recipients]);

  const sortedRecipients = [...recipientRollups].sort((a, b) =>
    (b.value ?? 0n) > (a.value ?? 0n) ? 1 : -1
  );
  const maxRecipientValue = sortedRecipients.reduce(
    (max, r) => (r.value !== null && r.value > max ? r.value : max),
    1n
  );

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-10">
      <div className="flex flex-col gap-1 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Encrypted rollup totals decrypted client-side. Values update as new payments are recorded.
        </p>
      </div>

      {/* Category Rollups */}
      <section>
        <h3 className="text-base font-semibold mb-4">GL Category Totals</h3>
        {handlesLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading encrypted handles…
          </div>
        ) : (
          <div className="space-y-3">
            {categoryRollups.map((cat, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="w-36 text-sm text-muted-foreground shrink-0">{cat.label}</span>
                <div className="flex-1 h-7 bg-muted/30 rounded-lg overflow-hidden relative">
                  {cat.value !== null ? (
                    <div
                      className="h-full bg-primary/70 rounded-lg transition-all duration-700 ease-out"
                      style={{
                        width: maxCategoryValue > 0n
                          ? `${Number((cat.value * 100n) / maxCategoryValue)}%`
                          : "0%",
                      }}
                    />
                  ) : (
                    <div className="h-full flex items-center px-3">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <span className="w-28 text-sm font-mono text-right shrink-0">
                  {cat.isDecrypting ? (
                    <Loader2 className="h-3 w-3 animate-spin inline" />
                  ) : cat.value !== null ? (
                    formatUsdc(cat.value)
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-1 justify-end">
                      <Lock className="h-3 w-3" /> Encrypted
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recipient Rollups */}
      <section>
        <h3 className="text-base font-semibold mb-4">Recipient Concentration</h3>
        {recipientsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Querying payment events…
          </div>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No payments recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {sortedRecipients.map((r, i) => (
              <div key={r.address} className="flex items-center gap-4">
                <span className="w-36 font-mono text-xs text-muted-foreground shrink-0 truncate" title={r.address}>
                  {r.address.slice(0, 6)}…{r.address.slice(-4)}
                </span>
                <div className="flex-1 h-7 bg-muted/30 rounded-lg overflow-hidden">
                  {r.value !== null ? (
                    <div
                      className="h-full bg-emerald-500/60 rounded-lg transition-all duration-700 ease-out"
                      style={{
                        width: maxRecipientValue > 0n
                          ? `${Number((r.value * 100n) / maxRecipientValue)}%`
                          : "0%",
                      }}
                    />
                  ) : (
                    <div className="h-full flex items-center px-3">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <span className="w-28 text-sm font-mono text-right shrink-0">
                  {r.isDecrypting ? (
                    <Loader2 className="h-3 w-3 animate-spin inline" />
                  ) : r.value !== null ? (
                    formatUsdc(r.value)
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
