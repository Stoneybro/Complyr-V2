"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useReadContracts, usePublicClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileSearchCorner } from "lucide-react";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { getFhevmInstance } from "@/lib/fhe";
import type { Abi } from "viem";

const auditRegistryAbi = AuditRegistryAbi as Abi;

const TEST_TYPE_LABELS: Record<number, string> = {
  0: "Materiality",
  1: "Auth Breach",
  2: "Segregation of Duties",
  3: "Missing Evidence",
  4: "Category Concentration",
  5: "Recipient Concentration",
  6: "Structuring",
};

const SEVERITY_CONFIG: Record<number, { label: string; className: string }> = {
  0: { label: "None",     className: "bg-muted text-muted-foreground" },
  1: { label: "Low",      className: "bg-sky-500/10 text-sky-600 border-0" },
  2: { label: "Medium",   className: "bg-amber-500/10 text-amber-600 border-0" },
  3: { label: "Critical", className: "bg-red-500/10 text-red-600 border-0" },
};

interface FindingsProps {
  auditRegistryAddress: `0x${string}`;
  accessLevel: number;
  walletAddress: `0x${string}`;
}

type FindingSignal = {
  findingId: number;
  testType: number;
  severity: number;
  triggeredAtBlock: number;
  paymentId: number;
  triggeredBy: string;
  isShared: boolean;
};

type DecryptState = "idle" | "decrypting" | "done" | "error" | "no-access";

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function Findings({ auditRegistryAddress, accessLevel, walletAddress }: FindingsProps) {
  const [filterTest, setFilterTest] = useState<number | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<number | null>(null);
  const [decryptStates, setDecryptStates] = useState<Record<number, DecryptState>>({});
  const [decryptedValues, setDecryptedValues] = useState<Record<number, string>>({});

  // Step 3 state — populated via direct eth_call (not multicall) so msg.sender = walletAddress
  const [signalResults, setSignalResults] = useState<FindingSignal[]>([]);
  const [signalLoading, setSignalLoading] = useState(false);

  const publicClient = usePublicClient({ chainId: sepolia.id });

  // Step 1: get per-auditor finding count
  const { data: countData, isLoading: countLoading, refetch: refetchCount } = useReadContracts({
    contracts: [
      {
        address: auditRegistryAddress,
        abi: auditRegistryAbi,
        functionName: "auditorFindingCount",
        args: [walletAddress],
        chainId: sepolia.id,
      },
    ],
    query: { refetchInterval: 10_000 },
  });

  const findingCount = Number(countData?.[0]?.result ?? 0);

  // Step 2: fetch all finding index references
  const { data: indexData, isLoading: indexLoading } = useReadContracts({
    contracts: Array.from({ length: findingCount }, (_, i) => ({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "auditorFindingAt",
      args: [walletAddress, BigInt(i)],
      chainId: sepolia.id,
    })),
    query: { enabled: findingCount > 0, refetchInterval: 10_000 },
  });

  const findingIds = useMemo(
    () => (indexData ?? []).map((r) => Number(r.result ?? 0)),
    [indexData]
  );

  // Step 3: fetch signal data via direct eth_call (bypasses Multicall3 so msg.sender = walletAddress).
  // useReadContracts batches through Multicall3 — inside multicall, msg.sender becomes the
  // multicall contract address (NONE access), causing getFindingSignal to revert Unauthorized().
  // publicClient.readContract sends a raw eth_call with account= so msg.sender is the auditor wallet.
  const fetchSignals = useCallback(async () => {
    if (!publicClient || findingIds.length === 0) {
      setSignalResults([]);
      return;
    }
    setSignalLoading(true);
    try {
      const results = await Promise.all(
        findingIds.map((id) =>
          publicClient.readContract({
            address: auditRegistryAddress,
            abi: auditRegistryAbi,
            functionName: "getFindingSignal",
            args: [BigInt(id)],
            account: walletAddress, // sets from= in eth_call → msg.sender inside contract
          })
        )
      );

      const parsed: FindingSignal[] = results
        .map((r, i) => {
          const tuple = r as readonly [number, number, number, bigint, string, boolean] | undefined;
          if (!tuple) return null;
          return {
            findingId:        findingIds[i],
            testType:         Number(tuple[0]),
            severity:         Number(tuple[1]),
            triggeredAtBlock: Number(tuple[2]),
            paymentId:        Number(tuple[3]),
            triggeredBy:      tuple[4] as string,
            isShared:         tuple[5] as boolean,
          };
        })
        .filter(Boolean) as FindingSignal[];

      parsed.sort((a, b) => b.triggeredAtBlock - a.triggeredAtBlock);
      setSignalResults(parsed);
    } catch (err) {
      console.error("getFindingSignal failed:", err);
      setSignalResults([]);
    } finally {
      setSignalLoading(false);
    }
  }, [publicClient, findingIds, auditRegistryAddress, walletAddress]);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 10_000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // Step 4 (FULL only): check payment access for decrypt eligibility
  const { data: accessCheckData } = useReadContracts({
    contracts: signalResults.map((f) => ({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "paymentAccessGranted",
      args: [walletAddress, BigInt(f.paymentId)],
      chainId: sepolia.id,
    })),
    query: { enabled: accessLevel >= 3 && signalResults.length > 0 },
  });

  const paymentAccessMap = useMemo(() => {
    const map: Record<number, boolean> = {};
    signalResults.forEach((f, i) => {
      map[f.findingId] = Boolean(accessCheckData?.[i]?.result ?? false);
    });
    return map;
  }, [signalResults, accessCheckData]);

  const filtered = useMemo(() => {
    return signalResults.filter((f) => {
      if (filterTest !== null && f.testType !== filterTest) return false;
      if (filterSeverity !== null && f.severity !== filterSeverity) return false;
      return true;
    });
  }, [signalResults, filterTest, filterSeverity]);

  const isLoading = countLoading || indexLoading || signalLoading;

  const handleDecrypt = async (findingId: number) => {
    setDecryptStates((s) => ({ ...s, [findingId]: "decrypting" }));
    try {
      await getFhevmInstance();
      setDecryptedValues((v) => ({ ...v, [findingId]: "Decrypted (placeholder)" }));
      setDecryptStates((s) => ({ ...s, [findingId]: "done" }));
    } catch {
      setDecryptStates((s) => ({ ...s, [findingId]: "error" }));
    }
  };



  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading findings…
      </div>
    );
  }

  if (signalResults.length === 0) {
    return (
      <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
        <div className="flex flex-col gap-1 mb-6 border-b border-border pb-6">
          <h2 className="text-2xl font-semibold tracking-tight">Findings</h2>
          <p className="text-sm text-muted-foreground">
            Payment records that triggered one of your configured audit tests.
          </p>
        </div>
        <EmptyState
          icon={<FileSearchCorner className="h-5 w-5" />}
          title="No findings yet"
          description="When a payment triggers one of your tests, it will appear here."
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
      <div className="flex flex-col gap-1 mb-6 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Findings</h2>
        <p className="text-sm text-muted-foreground">
          {signalResults.length} finding{signalResults.length !== 1 ? "s" : ""} in your engagement.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
          value={filterTest ?? ""}
          onChange={(e) => setFilterTest(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">All Test Types</option>
          {Object.entries(TEST_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
          value={filterSeverity ?? ""}
          onChange={(e) => setFilterSeverity(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">All Severities</option>
          {Object.entries(SEVERITY_CONFIG).filter(([k]) => k !== "0").map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Payment ID</th>
              <th className="text-left px-4 py-3 font-medium">Test Type</th>
              <th className="text-left px-4 py-3 font-medium">Severity</th>
              <th className="text-left px-4 py-3 font-medium">Triggered By</th>
              <th className="text-left px-4 py-3 font-medium">Block</th>
              {accessLevel >= 3 && <th className="text-right px-4 py-3 font-medium">Decrypt</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((f) => {
              const severity = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG[0];
              const hasAccess = paymentAccessMap[f.findingId];
              const decryptState = decryptStates[f.findingId] ?? "idle";

              return (
                <tr key={f.findingId} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">#{f.paymentId}</td>
                  <td className="px-4 py-3">
                    {f.isShared && (
                      <span className="inline-flex items-center gap-1 mr-2 text-xs text-muted-foreground">[shared]</span>
                    )}
                    {TEST_TYPE_LABELS[f.testType] ?? `Test ${f.testType}`}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={severity.className}>{severity.label}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {formatAddress(f.triggeredBy)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {f.triggeredAtBlock}
                  </td>
                  {accessLevel >= 3 && (
                    <td className="px-4 py-3 text-right">
                      {decryptState === "done" ? (
                        <span className="text-xs font-mono text-emerald-600">{decryptedValues[f.findingId]}</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!hasAccess || decryptState === "decrypting"}
                          onClick={() => handleDecrypt(f.findingId)}
                          title={!hasAccess ? "Historical access not granted for this payment" : undefined}
                        >
                          {decryptState === "decrypting" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : !hasAccess ? (
                            "No Access"
                          ) : (
                            "Decrypt"
                          )}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
