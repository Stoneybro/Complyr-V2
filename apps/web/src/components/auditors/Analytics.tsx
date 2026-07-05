"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useWalletClient, useChainId } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Loader2, Lock, Unlock, BarChart3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { CATEGORY_LABELS } from "@/lib/audit-enums";
import { fheHandleToHex, type FheHandle } from "@/lib/fhe-handle";
import { getFhevmInstance } from "@/lib/fhe";
import { getDecryptSession } from "@/lib/decrypt-session";
import type { Abi } from "viem";

const auditRegistryAbi = AuditRegistryAbi as Abi;
const CATEGORY_COUNT = 8;
const USDC_DECIMALS = 1_000_000n;

function formatUsdc(raw: bigint): string {
  const whole = raw / USDC_DECIMALS;
  const frac = (raw % USDC_DECIMALS).toString().padStart(6, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${frac}`;
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface AnalyticsProps {
  auditRegistryAddress: `0x${string}`;
  deployedAtBlock: bigint;
  walletAddress: `0x${string}`;
}

type HandleMap = Record<number | string, FheHandle>;
type ValueMap = Record<number | string, bigint>;
type PaymentRecordedLog = { args?: { recipient?: unknown } };

export function Analytics({ auditRegistryAddress, deployedAtBlock, walletAddress }: AnalyticsProps) {
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const [categoryValues, setCategoryValues] = useState<ValueMap>({});
  const [recipientValues, setRecipientValues] = useState<ValueMap>({});
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptDone, setDecryptDone] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // ── Category handles: direct eth_call with account= ───────────────────────
  // getCategoryTotal checks _canReadAnalytics(msg.sender). Multicall3 sets
  // msg.sender = 0x0 which fails the check. Direct readContract passes
  // account= in the eth_call so msg.sender = walletAddress inside the contract.
  const { data: categoryHandles, isLoading: categoryLoading } = useQuery({
    queryKey: ["analytics-category-handles", auditRegistryAddress, walletAddress],
    queryFn: async () => {
      if (!publicClient) return {} as HandleMap;
      const results = await Promise.all(
        Array.from({ length: CATEGORY_COUNT }, (_, i) =>
          publicClient.readContract({
            address: auditRegistryAddress,
            abi: auditRegistryAbi,
            functionName: "getCategoryTotal",
            args: [i],
            account: walletAddress,
          })
        )
      );
      const map: HandleMap = {};
      results.forEach((r, i) => {
        if (r !== undefined && r !== null) map[i] = r as bigint;
      });
      return map;
    },
    enabled: !!publicClient,
    refetchInterval: 15_000,
  });

  // ── Recipients: query PaymentRecorded events ──────────────────────────────
  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ["analytics-recipients", auditRegistryAddress, deployedAtBlock.toString()],
    queryFn: async () => {
      if (!publicClient || !deployedAtBlock) return [];
      const logs = await publicClient.getContractEvents({
        address: auditRegistryAddress,
        abi: auditRegistryAbi,
        eventName: "PaymentRecorded",
        fromBlock: deployedAtBlock,
        toBlock: "latest",
      });
      return [
        ...new Set(
          (logs as readonly PaymentRecordedLog[])
            .map((log) => log.args?.recipient)
            .filter((recipient): recipient is string => typeof recipient === "string")
        ),
      ];
    },
    enabled: !!publicClient && !!deployedAtBlock,
    staleTime: 30_000,
  });

  // ── Recipient handles: direct eth_call with account= ─────────────────────
  // getRecipientTotal also checks _canReadAnalytics() — same Multicall3 issue.
  const { data: recipientHandles, isLoading: recipientHandlesLoading } = useQuery({
    queryKey: ["analytics-recipient-handles", auditRegistryAddress, walletAddress, recipients.join(",")],
    queryFn: async () => {
      if (!publicClient || recipients.length === 0) return {} as HandleMap;
      const results = await Promise.all(
        recipients.map((addr) =>
          publicClient.readContract({
            address: auditRegistryAddress,
            abi: auditRegistryAbi,
            functionName: "getRecipientTotal",
            args: [addr],
            account: walletAddress,
          })
        )
      );
      const map: HandleMap = {};
      results.forEach((r, i) => {
        if (r !== undefined && r !== null) map[recipients[i]] = r as bigint;
      });
      return map;
    },
    enabled: !!publicClient && recipients.length > 0,
    refetchInterval: 15_000,
  });

  const isLoading = categoryLoading || recipientsLoading || recipientHandlesLoading;

  // ── Decrypt All ───────────────────────────────────────────────────────────
  const handleDecryptAll = async () => {
    if (!walletClient || !publicClient) return;
    if (!categoryHandles && !recipientHandles) return;

    setIsDecrypting(true);
    setDecryptError(null);
    try {
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

      // Collect all handles (categories + recipients) into one batch
      const handlePairs: { handle: `0x${string}`; contractAddress: `0x${string}` }[] = [];
      const catKeys: { key: number; hex: `0x${string}` }[] = [];
      const recKeys: { key: string; hex: `0x${string}` }[] = [];

      // Category handles
      if (categoryHandles) {
        Object.entries(categoryHandles).forEach(([idx, handle]) => {
          const hex = fheHandleToHex(handle);
          catKeys.push({ key: Number(idx), hex });
          handlePairs.push({ handle: hex, contractAddress: auditRegistryAddress });
        });
      }

      // Recipient handles
      if (recipientHandles) {
        Object.entries(recipientHandles).forEach(([addr, handle]) => {
          const hex = fheHandleToHex(handle);
          recKeys.push({ key: addr, hex });
          handlePairs.push({ handle: hex, contractAddress: auditRegistryAddress });
        });
      }

      if (handlePairs.length === 0) {
        setIsDecrypting(false);
        return;
      }

      const results = await fhevm.userDecrypt(
        handlePairs,
        session.privateKey,
        session.publicKey,
        session.signature,
        [auditRegistryAddress],
        walletAddress,
        session.startTimestamp,
        session.durationDays
      );

      // Map results back by hex handle
      const newCatValues: ValueMap = {};
      catKeys.forEach(({ key, hex }) => {
        const v = results[hex];
        if (v !== undefined && v !== null) newCatValues[key] = BigInt(v as bigint | string);
      });
      setCategoryValues(newCatValues);

      const newRecValues: ValueMap = {};
      recKeys.forEach(({ key, hex }) => {
        const v = results[hex];
        if (v !== undefined && v !== null) newRecValues[key] = BigInt(v as bigint | string);
      });
      setRecipientValues(newRecValues);

      setDecryptDone(true);
    } catch (err: unknown) {
      console.error("Analytics decryption failed:", err);
      setDecryptError(err instanceof Error ? err.message : "Decryption failed");
    } finally {
      setIsDecrypting(false);
    }
  };

  // ── Derived display values ────────────────────────────────────────────────
  const categoryRows = useMemo(() => {
    return Array.from({ length: CATEGORY_COUNT }, (_, i) => ({
      index: i,
      label: CATEGORY_LABELS[i] ?? `Category ${i}`,
      value: categoryValues[i] ?? null,
      hasHandle: categoryHandles != null && categoryHandles[i] != null,
    }));
  }, [categoryHandles, categoryValues]);

  const maxCategoryValue = useMemo(
    () => categoryRows.reduce((max, r) => (r.value !== null && r.value > max ? r.value : max), 1n),
    [categoryRows]
  );

  const recipientRows = useMemo(() => {
    return recipients.map((addr) => ({
      address: addr,
      value: recipientValues[addr] ?? null,
      hasHandle: recipientHandles != null && recipientHandles[addr] != null,
    })).sort((a, b) => (b.value ?? 0n) > (a.value ?? 0n) ? 1 : -1);
  }, [recipients, recipientValues, recipientHandles]);

  const maxRecipientValue = useMemo(
    () => recipientRows.reduce((max, r) => (r.value !== null && r.value > max ? r.value : max), 1n),
    [recipientRows]
  );

  const handlesReady =
    (categoryHandles && Object.keys(categoryHandles).length > 0) ||
    (recipientHandles && Object.keys(recipientHandles).length > 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Encrypted rollup totals across GL categories and recipients. Decrypt to reveal values.
          </p>
        </div>
        <Button
          onClick={handleDecryptAll}
          disabled={isDecrypting || isLoading || !handlesReady || !walletClient}
          className="gap-2 shrink-0"
          variant={decryptDone ? "outline" : "default"}
        >
          {isDecrypting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : decryptDone ? (
            <Unlock className="h-4 w-4" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {isDecrypting ? "Decrypting…" : decryptDone ? "Decrypted" : "Decrypt All"}
        </Button>
      </div>

      {decryptError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          {decryptError}
        </div>
      )}

      {/* Category Rollups */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">GL Category Totals</h3>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            {categoryRows.map((cat) => (
              <div key={cat.index} className="flex items-center gap-3">
                <span className="w-40 text-sm text-muted-foreground shrink-0 truncate">
                  {cat.label}
                </span>
                <div className="flex-1 h-8 bg-muted/30 rounded-lg overflow-hidden relative">
                  {cat.value !== null ? (
                    <div
                      className="h-full bg-primary/60 rounded-lg transition-all duration-700 ease-out"
                      style={{
                        width: maxCategoryValue > 0n
                          ? `${Number((cat.value * 100n) / maxCategoryValue)}%`
                          : "0%",
                      }}
                    />
                  ) : (
                    // Indeterminate pattern while encrypted
                    <div className="h-full bg-muted/50 rounded-lg" />
                  )}
                </div>
                <span className="w-32 text-sm font-mono text-right shrink-0">
                  {cat.value !== null ? (
                    <span className="text-emerald-600">{formatUsdc(cat.value)}</span>
                  ) : cat.hasHandle ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                      <Lock className="h-3 w-3" /> Encrypted
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">No data</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recipient Concentration */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Recipient Concentration</h3>
          <span className="text-xs text-muted-foreground">
            — cumulative spend per recipient
          </span>
        </div>

        {recipientsLoading || recipientHandlesLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Querying payment events…
          </div>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No payments recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {recipientRows.map((r) => (
              <div key={r.address} className="flex items-center gap-3">
                <span
                  className="w-40 font-mono text-xs text-muted-foreground shrink-0 truncate"
                  title={r.address}
                >
                  {formatAddress(r.address)}
                </span>
                <div className="flex-1 h-8 bg-muted/30 rounded-lg overflow-hidden">
                  {r.value !== null ? (
                    <div
                      className="h-full bg-emerald-500/50 rounded-lg transition-all duration-700 ease-out"
                      style={{
                        width: maxRecipientValue > 0n
                          ? `${Number((r.value * 100n) / maxRecipientValue)}%`
                          : "0%",
                      }}
                    />
                  ) : (
                    <div className="h-full bg-muted/50 rounded-lg" />
                  )}
                </div>
                <span className="w-32 text-sm font-mono text-right shrink-0">
                  {r.value !== null ? (
                    <span className="text-emerald-600">{formatUsdc(r.value)}</span>
                  ) : r.hasHandle ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                      <Lock className="h-3 w-3" /> Encrypted
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
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
