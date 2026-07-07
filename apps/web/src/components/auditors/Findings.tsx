"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts, usePublicClient, useWalletClient, useChainId } from "wagmi";
import { formatUnits } from "viem";
import { sepolia } from "wagmi/chains";
import { Loader2, FileSearchCorner, Lock, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { fheHandleToHex, type FheHandle } from "@/lib/fhe-handle";
import { getFhevmInstance } from "@/lib/fhe";
import { getDecryptSession } from "@/lib/decrypt-session";
import type { Abi } from "viem";

const auditRegistryAbi = AuditRegistryAbi as Abi;

const TEST_TYPE_LABELS: Record<number, string> = {
  0: "Materiality",
  1: "Auth Breach",
  2: "Segregation of Duties",
  3: "Missing Evidence",
  4: "Category Concentration",
  5: "Recipient Concentration",
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
  isShared: boolean;
};

type DecryptState = "idle" | "decrypting" | "done" | "error" | "not_authorized";

type DecryptedFinding = {
  /** Formatted USDC amount that triggered the test, e.g. "12,345.00 USDC" */
  flaggedAmount: string;
};

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function Findings({ auditRegistryAddress, accessLevel, walletAddress }: FindingsProps) {
  const [filterTest, setFilterTest] = useState<number | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<number | null>(null);
  const [decryptStates, setDecryptStates] = useState<Record<number, DecryptState>>({});
  const [decryptedFindings, setDecryptedFindings] = useState<Record<number, DecryptedFinding>>({});
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  // ── Step 1: per-auditor finding count ────────────────────────────────────
  const { data: countData, isLoading: countLoading } = useReadContracts({
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

  // ── Step 2: fetch finding ID references ──────────────────────────────────
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

  // ── Step 3: fetch signal data via direct eth_call (bypasses Multicall3) ──
  // getFindingSignal checks msg.sender — Multicall3 sets it to 0x0 which
  // fails the access control. publicClient.readContract with account= sets
  // the correct from= in the eth_call.
  const { data: signalResultsRaw, isLoading: signalLoading } = useQuery({
    queryKey: ["findings-signals", auditRegistryAddress, walletAddress, findingIds.join(",")],
    queryFn: async () => {
      if (!publicClient || findingIds.length === 0) return [];
      const results = await Promise.all(
        findingIds.map((id) =>
          publicClient.readContract({
            address: auditRegistryAddress,
            abi: auditRegistryAbi,
            functionName: "getFindingSignal",
            args: [BigInt(id)],
            account: walletAddress,
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
            // tuple[4] = triggeredBy — omitted from UI (one auditor per engagement)
            isShared:         tuple[5] as boolean,
          };
        })
        .filter(Boolean) as FindingSignal[];

      parsed.sort((a, b) => b.triggeredAtBlock - a.triggeredAtBlock);
      return parsed;
    },
    enabled: findingIds.length > 0 && !!publicClient,
    // Background refetch — does NOT show a full-page spinner on subsequent fetches
    refetchInterval: 10_000,
  });

  const signalResults = signalResultsRaw ?? [];

  // ── Step 4 (FULL only): per-payment access gate ───────────────────────────
  const { data: accessCheckData } = useReadContracts({
    contracts: signalResults.map((f) => ({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "paymentAccessGranted",
      args: [walletAddress, BigInt(f.paymentId)],
      chainId: sepolia.id,
    })),
    query: { enabled: accessLevel === 3 && signalResults.length > 0 },
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

  // Only full initial load shows spinner; background refetches are silent
  const isLoading = countLoading || indexLoading || signalLoading;

  // ── Decrypt: FULL auditors only ───────────────────────────────────────────
  // getFinding() calls _canReadPayment() which denies ANALYTICS access.
  const handleDecrypt = async (findingId: number) => {
    if (!walletClient || !publicClient) return;
    setDecryptStates((s) => ({ ...s, [findingId]: "decrypting" }));
    try {
      // 1. Fetch the full finding (includes encrypted flaggedHandle)
      //    Must use account= to pass msg.sender check in getFinding()
      const findingData = await publicClient.readContract({
        address: auditRegistryAddress,
        abi: auditRegistryAbi,
        functionName: "getFinding",
        args: [BigInt(findingId)],
        account: walletAddress,
      });

      const tuple = findingData as readonly [bigint, number, number, FheHandle, number, string, boolean, string, boolean];
      const flaggedHandle = tuple[3]; // euint64 handle — raw bytes32 bigint

      // 2. Establish FHE decrypt session (EIP-712 prompt, once per session)
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

      // 3. Encode handle as bytes32 hex — toHex preserves the full 32-byte
      //    FHEVM handle layout. padStart on a raw bigint can corrupt it.
      const handleHex = fheHandleToHex(flaggedHandle);

      const results = await fhevm.userDecrypt(
        [{ handle: handleHex, contractAddress: auditRegistryAddress }],
        session.privateKey,
        session.publicKey,
        session.signature,
        [auditRegistryAddress],
        walletAddress,
        session.startTimestamp,
        session.durationDays
      );

      const value = results[handleHex];
      if (value === undefined || value === null) {
        throw new Error("Decryption returned no value for handle");
      }

      const formatted = Number(formatUnits(BigInt(value as bigint | string), 6)).toLocaleString(
        undefined,
        { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      );

      setDecryptedFindings((v) => ({
        ...v,
        [findingId]: { flaggedAmount: `${formatted} USDC` },
      }));
      setDecryptStates((s) => ({ ...s, [findingId]: "done" }));
      // Auto-expand the row to show decrypted details
      setExpandedRows((prev) => new Set(prev).add(findingId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not authorized to user decrypt")) {
        setDecryptStates((s) => ({ ...s, [findingId]: "not_authorized" }));
      } else {
        console.error("Finding decryption failed:", err);
        setDecryptStates((s) => ({ ...s, [findingId]: "error" }));
      }
    }
  };

  const toggleExpand = (findingId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) {
        next.delete(findingId);
      } else {
        next.add(findingId);
      }
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

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
          <Alert className="mt-4 bg-muted/40 text-muted-foreground border-border/50">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Recently triggered findings may take 1-2 minutes to appear.
            </AlertDescription>
          </Alert>
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
          {accessLevel === 3 && (
            <span className="ml-2 text-xs text-muted-foreground">
              Full access — decrypt flagged values on demand.
            </span>
          )}
        </p>
        <Alert className="mt-4 bg-muted/40 text-muted-foreground border-border/50">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Recently triggered findings may take 1-2 minutes to appear.
          </AlertDescription>
        </Alert>
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
              <th className="text-left px-4 py-3 font-medium">Block</th>
              <th className="text-left px-4 py-3 font-medium">Flagged Value</th>
              {accessLevel === 3 && (
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((f) => {
              const severity = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG[0];
              const hasAccess = paymentAccessMap[f.findingId] ?? false;
              const decryptState = decryptStates[f.findingId] ?? "idle";
              const decrypted = decryptedFindings[f.findingId];
              const isExpanded = expandedRows.has(f.findingId);

              return (
                <React.Fragment key={f.findingId}>
                  <tr className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">
                      #{f.paymentId}
                      {f.isShared && (
                        <span className="ml-2 text-[10px] text-muted-foreground border border-border rounded px-1">
                          shared
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {TEST_TYPE_LABELS[f.testType] ?? `Test ${f.testType}`}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={severity.className}>{severity.label}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {f.triggeredAtBlock}
                    </td>
                    <td className="px-4 py-3">
                      {decryptState === "done" && decrypted ? (
                        <span className="font-mono text-xs text-emerald-600">
                          {decrypted.flaggedAmount}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          Encrypted
                        </span>
                      )}
                    </td>
                    {accessLevel === 3 && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {decryptState === "done" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => toggleExpand(f.findingId)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                              {isExpanded ? "Collapse" : "Details"}
                            </Button>
                          )}
                          {decryptState !== "done" && decryptState !== "not_authorized" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!hasAccess || decryptState === "decrypting"}
                              onClick={() => handleDecrypt(f.findingId)}
                              title={
                                !hasAccess
                                  ? "Historical access not granted for this payment"
                                  : decryptState === "error"
                                  ? "Decryption failed — try again"
                                  : undefined
                              }
                            >
                              {decryptState === "decrypting" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : !hasAccess ? (
                                "No Access"
                              ) : decryptState === "error" ? (
                                "Retry"
                              ) : (
                                "Decrypt"
                              )}
                            </Button>
                          )}
                          {decryptState === "not_authorized" && (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-md border border-border"
                              title="This payment predates your auditor assignment. The encrypted handle was not allowlisted for your address."
                            >
                              <Lock className="h-3 w-3" />
                              Pre-audit payment
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>

                  {/* Inline expanded detail panel — shown after decrypt */}
                  {isExpanded && decrypted && (
                    <tr className="bg-muted/10">
                      <td
                        colSpan={accessLevel === 3 ? 6 : 5}
                        className="px-6 py-4"
                      >
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              Test
                            </p>
                            <p className="font-medium">
                              {TEST_TYPE_LABELS[f.testType] ?? `Test ${f.testType}`}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              Flagged Amount
                            </p>
                            <p className="font-mono text-emerald-600 font-medium">
                              {decrypted.flaggedAmount}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              Severity
                            </p>
                            <Badge className={severity.className}>{severity.label}</Badge>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
                              Payment ID
                            </p>
                            <p className="font-mono">#{f.paymentId}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-[11px] text-muted-foreground">
                          This value exceeded the threshold you configured for the{" "}
                          <span className="font-medium text-foreground">
                            {TEST_TYPE_LABELS[f.testType]}
                          </span>{" "}
                          test. Navigate to the Payments tab to view full payment details.
                        </p>
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
