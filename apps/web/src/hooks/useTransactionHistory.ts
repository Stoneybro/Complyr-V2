"use client";

/**
 * useTransactionHistory — proven readContract pattern (copied from auditor Payments.tsx)
 *
 * KEY INSIGHT: getPaymentMeta has an access gate (_canReadPayment).
 * Multicall3 sets msg.sender = address(0), which FAILS the check.
 * Must use publicClient.readContract with account: walletAddress so that
 * the business owner's address is used as msg.sender (owner always passes).
 *
 * Pattern:
 *   1. readContract("paymentCount") → N
 *   2. readContract("findingCount") → M
 *   3. Promise.all readContract("getPaymentMeta", id, account: walletAddress) for 0..N-1
 *   4. Promise.all readContract("getFinding", id) for 0..M-1 → finding map
 *   5. Dedupe blockNumbers → Promise.all getBlock for timestamps
 */

import { useEffect, useState, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getAddress, type Abi } from "viem";
import AuditRegistryAbiRaw from "@/lib/abis/AuditRegistry.json";

const AuditRegistryAbi = AuditRegistryAbiRaw as Abi;

// ── Types ────────────────────────────────────────────────────────────────────

export interface TransactionRow {
  paymentId:   number;
  blockNumber: number;
  timestamp:   Date | null;

  sender:      `0x${string}`;
  recipient:   `0x${string}`;
  approver:    `0x${string}`;
  invoiceHash: `0x${string}`;
  poHash:      `0x${string}`;
  approved:    boolean;

  findingCount:  number;
  maxSeverity:   number | null;
}

export type TransactionHistoryStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

// ── Constants ─────────────────────────────────────────────────────────────────

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const ZERO_BYTES32 = ("0x" + "00".repeat(32)) as `0x${string}`;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTransactionHistory(
  auditRegistryAddress?: `0x${string}`,
  walletAddress?: `0x${string}`
) {
  // Scope to Sepolia — same as auditor Payments.tsx
  const publicClient = usePublicClient({ chainId: sepolia.id });

  const [rows, setRows]     = useState<TransactionRow[]>([]);
  const [status, setStatus] = useState<TransactionHistoryStatus>("idle");
  const [error, setError]   = useState<string | null>(null);

  const fetch = useCallback(async () => {
    console.debug("[txHistory] fetch called", {
      hasClient: !!publicClient,
      auditRegistryAddress,
      walletAddress,
    });

    if (!publicClient || !auditRegistryAddress || !walletAddress) return;

    setStatus("loading");
    setError(null);

    try {
      // ── 1. Payment count ──────────────────────────────────────────────────
      const countRaw = await publicClient.readContract({
        address:      auditRegistryAddress,
        abi:          AuditRegistryAbi,
        functionName: "paymentCount",
      });
      const paymentCount = Number(countRaw ?? 0);

      // ── 2. Finding count ──────────────────────────────────────────────────
      const findingCountRaw = await publicClient.readContract({
        address:      auditRegistryAddress,
        abi:          AuditRegistryAbi,
        functionName: "findingCount",
      });
      const findingCount = Number(findingCountRaw ?? 0);

      console.debug("[txHistory] counts", { paymentCount, findingCount });

      if (paymentCount === 0) {
        setRows([]);
        setStatus("success");
        return;
      }

      // ── 3. getPaymentMeta — MUST use account: walletAddress ───────────────
      // getPaymentMeta has _canReadPayment(msg.sender). Multicall3 sets
      // msg.sender = address(0) which fails. Direct readContract with
      // account= passes the owner check.
      const metaResults = await Promise.all(
        Array.from({ length: paymentCount }, (_, i) =>
          publicClient.readContract({
            address:      auditRegistryAddress,
            abi:          AuditRegistryAbi,
            functionName: "getPaymentMeta",
            args:         [BigInt(i)],
            account:      walletAddress,
          }).catch((e) => {
            console.warn(`[txHistory] getPaymentMeta(${i}) failed:`, e.shortMessage ?? e.message);
            return null;
          })
        )
      );

      // ── 4. getFinding for all findings → build finding map ────────────────
      const findingResults = await Promise.all(
        Array.from({ length: findingCount }, (_, i) =>
          publicClient.readContract({
            address:      auditRegistryAddress,
            abi:          AuditRegistryAbi,
            functionName: "getFinding",
            args:         [BigInt(i)],
          }).catch(() => null)
        )
      );

      // paymentId → { count, maxSeverity }
      const findingMap = new Map<string, { count: number; maxSeverity: number }>();
      for (const raw of findingResults) {
        if (!raw) continue;
        const t = raw as readonly [bigint, number, number, ...unknown[]];
        const paymentId = t[0].toString();
        const severity  = Number(t[2]);
        const prev = findingMap.get(paymentId) ?? { count: 0, maxSeverity: -1 };
        findingMap.set(paymentId, {
          count:       prev.count + 1,
          maxSeverity: Math.max(prev.maxSeverity, severity),
        });
      }

      // ── 5. Batch-fetch block timestamps (deduped) ─────────────────────────
      const blockNumbers = new Set<number>();
      for (const raw of metaResults) {
        if (!raw) continue;
        const t = raw as readonly [string, string, string, string, string, number, boolean];
        const bn = Number(t[5]);
        if (bn) blockNumbers.add(bn);
      }

      const blockTimestamps = new Map<number, Date>();
      await Promise.all(
        [...blockNumbers].map(async (bn) => {
          try {
            const block = await publicClient.getBlock({ blockNumber: BigInt(bn) });
            blockTimestamps.set(bn, new Date(Number(block.timestamp) * 1000));
          } catch {
            // timestamp stays absent
          }
        })
      );

      // ── 6. Assemble rows ──────────────────────────────────────────────────
      const assembled: TransactionRow[] = [];

      for (let i = 0; i < paymentCount; i++) {
        const raw = metaResults[i];
        if (!raw) continue;

        // getPaymentMeta returns: sender, recipient, approver, invoiceHash, poHash, blockNumber, approved
        const t = raw as readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, number, boolean];

        const blockNumber   = Number(t[5]) ?? 0;
        const findingInfo   = findingMap.get(i.toString());

        assembled.push({
          paymentId:    i,
          blockNumber,
          timestamp:    blockTimestamps.get(blockNumber) ?? null,
          sender:       t[0] ? getAddress(t[0]) : ZERO_ADDRESS,
          recipient:    t[1] ? getAddress(t[1]) : ZERO_ADDRESS,
          approver:     t[2] ? getAddress(t[2]) : ZERO_ADDRESS,
          invoiceHash:  t[3] ?? ZERO_BYTES32,
          poHash:       t[4] ?? ZERO_BYTES32,
          approved:     t[6] ?? false,
          findingCount: findingInfo?.count       ?? 0,
          maxSeverity:  findingInfo ? findingInfo.maxSeverity : null,
        });
      }

      // Most-recent first
      assembled.sort((a, b) => b.blockNumber - a.blockNumber);

      console.debug("[txHistory] assembled", assembled.length, "rows");
      setRows(assembled);
      setStatus("success");
    } catch (err) {
      console.error("[useTransactionHistory]", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }, [publicClient, auditRegistryAddress, walletAddress]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { rows, status, error, refetch: fetch };
}
