"use client";

/**
 * Findings pull engine — replaces the relay.py push service.
 *
 * Instead of a long-lived relay watching `TestEvaluated` events and pushing
 * decrypted results on-chain from a hardcoded wallet, the auditor's own
 * browser pulls pending test evaluations while the workspace is open:
 *
 *   1. Fetches `TestEvaluated` logs emitted by this business's
 *      ReviewTestRegistry clone (scoped to the connected auditor).
 *   2. Skips SoD (2) — plaintext findings created directly by approvePayment —
 *      and AUTHORIZATION_BREACH (1) — payment-scoped, not auditor-scoped.
 *   3. Deduplicates against findings already recorded in AuditRegistry and
 *      against a localStorage cache of already-processed events (so passing
 *      tests are not re-decrypted on every cycle).
 *   4. For each pending result: reads the encrypted `ebool` handle via
 *      getTestResult(), decrypts it client-side with the Zama SDK
 *      (userDecrypt — the contract granted the auditor ACL access at
 *      evaluation time), and if the test fired, submits
 *      recordFindingIfTriggered() from the auditor's own wallet.
 *
 * No trusted relay wallet, no always-on service. The first cycle in a browser
 * session triggers one EIP-712 signature prompt (the KMS decrypt session);
 * finding transactions are signed and paid by the connected auditor wallet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient, useWalletClient, useChainId } from "wagmi";
import { sepolia } from "wagmi/chains";
import { parseAbiItem, createPublicClient, http, type Abi } from "viem";
import ReviewTestRegistryAbi from "@/lib/abis/ReviewTestRegistry.json";
import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { fheHandleToHex } from "@/lib/fhe-handle";
import { getFhevmInstance } from "@/lib/fhe";
import { getDecryptSession } from "@/lib/decrypt-session";

const reviewAbi = ReviewTestRegistryAbi as Abi;
const auditAbi = AuditRegistryAbi as Abi;

const TEST_EVALUATED_EVENT = parseAbiItem(
  "event TestEvaluated(address indexed auditor, uint256 indexed paymentId, uint8 indexed testType, bytes32 result)"
);

/** How often the workspace re-checks for new test evaluations. */
const PULL_INTERVAL_MS = 15_000;

// Public Sepolia RPCs without Alchemy's 10-block eth_getLogs cap — used to
// scan registry history during catch-up. publicnode allows 50k-block ranges,
// so a full history sweep costs ~7 requests instead of hundreds.
const FULL_SCAN_RPC_URLS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
];
const FULL_SCAN_WINDOW = 50_000;

export type PullStatus =
  | "idle"
  | "syncing"
  | "awaiting-signature"
  | "error";

/** Result of a pull cycle — null means the cycle was skipped or stayed silent. */
export interface PullOutcome {
  ok: boolean;
  /** True when no test results remain pending after the cycle. */
  upToDate: boolean;
}

interface UseFindingsPullerArgs {
  auditRegistryAddress: `0x${string}`;
  reviewRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  deployedAtBlock: bigint;
}

function processedCacheKey(
  chainId: number,
  reviewRegistryAddress: string,
  walletAddress: string
) {
  return `complyr:pulled-results:${chainId}:${reviewRegistryAddress.toLowerCase()}:${walletAddress.toLowerCase()}`;
}

  // v2: earlier versions could persist a cursor at chain head before
  // deployedAtBlock resolved, permanently skipping historical evaluations.
  function cursorCacheKey(
    chainId: number,
    reviewRegistryAddress: string,
    walletAddress: string
  ) {
    return `complyr:pulled-cursor:v2:${chainId}:${reviewRegistryAddress.toLowerCase()}:${walletAddress.toLowerCase()}`;
  }

// Alchemy free tier caps eth_getLogs at a 10-block range — never ask for more.
const LOG_WINDOW = 10n;
// Safety cap so one catch-up cycle can't fire unlimited RPC calls.
const MAX_WINDOWS_PER_CYCLE = 200;
// Windows are fetched in small parallel batches — higher concurrency trips
// free-tier rate limiting and gets requests dropped outright.
const WINDOW_CONCURRENCY = 3;
// Transient RPC failures (throttling, dropped connections) are retried with
// exponential backoff instead of failing the whole cycle.
const WINDOW_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryableRpcError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|network|timeout|rate limit|429|5\d\d/i.test(msg);
}

/** Flattened TestEvaluated event — avoids viem's generic Log typing headaches. */
interface PulledEvaluation {
  transactionHash: `0x${string}` | null;
  logIndex: number;
  paymentId: bigint | undefined;
  testType: number | undefined;
}

/**
 * Scans the registry's full history in one request via a public RPC without
 * a block-range cap. Returns null when every fallback fails, in which case
 * the caller falls back to chunked scanning through the primary RPC.
 */
async function fetchEvaluatedLogsFullRange(
  reviewRegistryAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  deployedAtBlock: bigint
): Promise<PulledEvaluation[] | null> {
  // All window math is done in plain numbers — mixing BigInt literals with
  // runtime values in these expressions crashes Next's build-time static
  // analyzer ("Cannot mix BigInt and other types").
  const fromNum = Number(deployedAtBlock);
  const start = fromNum > 0 ? fromNum : 0;
  for (const url of FULL_SCAN_RPC_URLS) {
    try {
      const client = createPublicClient({
        chain: sepolia,
        transport: http(url, { timeout: 60_000 }),
      });
      const latest = Number(await client.getBlockNumber());
      const events: PulledEvaluation[] = [];

      let f = start;
      while (f <= latest) {
        const t = Math.min(f + FULL_SCAN_WINDOW - 1, latest);
        const logs = await client.getLogs({
          address: reviewRegistryAddress,
          event: TEST_EVALUATED_EVENT,
          args: { auditor: walletAddress },
          fromBlock: BigInt(f),
          toBlock: BigInt(t),
        });
        for (const log of logs) {
          events.push({
            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
            paymentId: log.args.paymentId,
            testType: log.args.testType,
          });
        }
        f = t + 1;
      }
      return events;
    } catch {
      // Try the next fallback; null signals the chunked path below.
    }
  }
  return null;
}

/**
 * Fetches TestEvaluated logs in Alchemy-free-tier-sized windows, starting from
 * a persisted per-wallet block cursor instead of re-scanning from
 * deployedAtBlock every cycle (a full-range getLogs gets rejected with
 * "up to a 10 block range" errors on free plans).
 */
async function fetchEvaluatedLogsChunked(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  reviewRegistryAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  deployedAtBlock: bigint,
  chainId: number
): Promise<PulledEvaluation[]> {
  const latest = await publicClient.getBlockNumber();

  // All window/cursor math runs in plain numbers (see note in
  // fetchEvaluatedLogsFullRange); BigInt is only used at the RPC boundary.
  let from: number | null = null;
  try {
    const stored = localStorage.getItem(
      cursorCacheKey(chainId, reviewRegistryAddress, walletAddress)
    );
    if (stored !== null && /^\d+$/.test(stored)) {
      from = Number(stored) + 1;
    }
  } catch {
    // localStorage unavailable — fall through to deployedAtBlock
  }
  if (from === null) {
    const deployed = Number(deployedAtBlock);
    from = deployed > 0 ? deployed : Number(latest);
  }

  const events: PulledEvaluation[] = [];

  // Plan the windows for this cycle up front
  const windows: Array<{ from: bigint; to: bigint }> = [];
  const latestNum = Number(latest);
  let f = from;
  while (f <= latestNum && windows.length < MAX_WINDOWS_PER_CYCLE) {
    const t = Math.min(f + Number(LOG_WINDOW) - 1, latestNum);
    windows.push({ from: BigInt(f), to: BigInt(t) });
    f = t + 1;
  }

  let lastCompletedBlock = from - 1;
  for (let i = 0; i < windows.length; i += WINDOW_CONCURRENCY) {
    const batch = windows.slice(i, i + WINDOW_CONCURRENCY);
    const chunks = await Promise.all(
      batch.map(({ from: winFrom, to: winTo }) =>
        publicClient.getLogs({
          address: reviewRegistryAddress,
          event: TEST_EVALUATED_EVENT,
          args: { auditor: walletAddress },
          fromBlock: winFrom,
          toBlock: winTo,
        }).catch(async (err) => {
          if (!isRetryableRpcError(err)) throw err;
          for (let attempt = 1; attempt <= WINDOW_RETRIES; attempt++) {
            await sleep(500 * 2 ** (attempt - 1));
            try {
              return await publicClient.getLogs({
                address: reviewRegistryAddress,
                event: TEST_EVALUATED_EVENT,
                args: { auditor: walletAddress },
                fromBlock: winFrom,
                toBlock: winTo,
              });
            } catch (retryErr) {
              if (!isRetryableRpcError(retryErr) || attempt === WINDOW_RETRIES) {
                throw retryErr;
              }
            }
          }
          throw err;
        })
      )
    );
    for (const chunk of chunks) {
      for (const log of chunk) {
        events.push({
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          paymentId: log.args.paymentId,
          testType: log.args.testType,
        });
      }
    }
    lastCompletedBlock = Number(batch[batch.length - 1].to);

    // Save progress after every batch so a failed cycle doesn't redo work
    try {
      localStorage.setItem(
        cursorCacheKey(chainId, reviewRegistryAddress, walletAddress),
        lastCompletedBlock.toString()
      );
    } catch {
      // Worst case the same windows are re-scanned next cycle
    }
  }

  return events;
}

export function useFindingsPuller({
  auditRegistryAddress,
  reviewRegistryAddress,
  walletAddress,
  deployedAtBlock,
}: UseFindingsPullerArgs) {
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const [status, setStatus] = useState<PullStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const busyRef = useRef(false);

  // ── Scan phase (read-only — never touches the wallet) ──────────────────────
  // Fetches TestEvaluated events and computes which results are still
  // pending. Safe to run on a timer.
  const scanPending = useCallback(async (): Promise<PulledEvaluation[] | null> => {
    if (
      !publicClient ||
      chainId !== sepolia.id ||
      !reviewRegistryAddress ||
      !auditRegistryAddress ||
      !walletAddress ||
      // Wait until the registry's deployment block is known — starting from
      // an unknown point would persist a head cursor and skip past events.
      Number(deployedAtBlock) <= 0
    ) {
      return null;
    }

    try {
      // ── Step 1: fetch this auditor's TestEvaluated events ──────────────
      // Prefer a single full-range scan via a public RPC (no block-range cap);
      // fall back to chunked windows through the primary RPC.
      const fullRangeLogs = await fetchEvaluatedLogsFullRange(
        reviewRegistryAddress,
        walletAddress,
        deployedAtBlock
      );
      const logs =
        fullRangeLogs ??
        (await fetchEvaluatedLogsChunked(
          publicClient,
          reviewRegistryAddress,
          walletAddress,
          deployedAtBlock,
          chainId
        ));

      // Same skips as the old relay:
      //  2 SEGREGATION_OF_DUTIES — plaintext finding written directly by
      //    approvePayment() via createSodFinding(); no decryption needed.
      //  1 AUTHORIZATION_BREACH — stored per-payment (not per-auditor); the
      //    auditor reads/decrypts it on demand instead.
      const candidates = logs.filter((log) => {
        const testType = log.testType;
        return testType !== undefined && testType !== 1 && testType !== 2;
      });

      if (candidates.length === 0) {
        setPendingCount(0);
        setLastError(null);
        return [];
      }

      // ── Step 2: build the set of (paymentId, testType) already recorded ─
      const findingCount = Number(
        await publicClient.readContract({
          address: auditRegistryAddress,
          abi: auditAbi,
          functionName: "auditorFindingCount",
          args: [walletAddress],
          account: walletAddress,
        })
      );

      const recorded = new Set<string>();
      if (findingCount > 0) {
        const findingIds: bigint[] = [];
        for (let i = 0; i < findingCount; i++) {
          const id = await publicClient.readContract({
            address: auditRegistryAddress,
            abi: auditAbi,
            functionName: "auditorFindingAt",
            args: [walletAddress, BigInt(i)],
            account: walletAddress,
          });
          findingIds.push(id as bigint);
        }

        const signals = await Promise.all(
          findingIds.map((id) =>
            publicClient.readContract({
              address: auditRegistryAddress,
              abi: auditAbi,
              functionName: "getFindingSignal",
              args: [id],
              account: walletAddress,
            })
          )
        );

        for (const signal of signals) {
          const tuple = signal as readonly [
            number,
            number,
            number,
            bigint,
            string,
            boolean
          ];
          if (!tuple) continue;
          // tuple[3] = paymentId, tuple[0] = testType
          recorded.add(`${tuple[3].toString()}:${Number(tuple[0])}`);
        }
      }

      // ── Step 3: local cache of fully-processed events (incl. false ones) ─
      const cacheKey = processedCacheKey(
        chainId,
        reviewRegistryAddress,
        walletAddress
      );
      let processed: string[] = [];
      try {
        processed = JSON.parse(localStorage.getItem(cacheKey) ?? "[]");
      } catch {
        processed = [];
      }
      const processedSet = new Set(processed);

      const pending = candidates.filter((log) => {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (processedSet.has(key)) return false;
        const paymentId = log.paymentId;
        const testType = log.testType;
        if (paymentId === undefined || testType === undefined) return false;
        return !recorded.has(`${paymentId.toString()}:${testType}`);
      });

      setPendingCount(pending.length);
      return pending;
    } catch (err) {
      // Scans stay quiet — a failed read shouldn't alarm the user
      console.error("Findings scan failed:", err);
      return null;
    }
  }, [
    publicClient,
    chainId,
    reviewRegistryAddress,
    auditRegistryAddress,
    walletAddress,
    deployedAtBlock,
  ]);

  // ── Pull phase (signs — runs ONLY on explicit user action) ────────────────
  // One EIP-712 decrypt-session prompt plus one transaction per triggered
  // test, so the UI must make clear these are coming before they start.
  const runPullCycle = useCallback(async (): Promise<PullOutcome | null> => {
    if (
      busyRef.current ||
      !publicClient ||
      !walletClient ||
      chainId !== sepolia.id ||
      !reviewRegistryAddress ||
      !auditRegistryAddress ||
      !walletAddress ||
      Number(deployedAtBlock) <= 0
    ) {
      return null;
    }

    busyRef.current = true;
    try {
      const pending = await scanPending();

      if (pending === null || pending.length === 0) {
        setStatus("idle");
        setLastError(null);
        return { ok: true, upToDate: true };
      }

      // Local cache of fully-processed events (incl. tests that passed)
      const cacheKey = processedCacheKey(
        chainId,
        reviewRegistryAddress,
        walletAddress
      );
      let stored: string[] = [];
      try {
        stored = JSON.parse(localStorage.getItem(cacheKey) ?? "[]");
      } catch {
        stored = [];
      }
      const processedSet = new Set(stored);

      // ── Step 4: establish the KMS decrypt session (one EIP-712 prompt) ──
      setStatus("awaiting-signature");
      const fhevm = await getFhevmInstance();
      const session = await getDecryptSession(
        chainId,
        walletAddress,
        reviewRegistryAddress,
        (typedData) =>
          walletClient.signTypedData(
            typedData as Parameters<typeof walletClient.signTypedData>[0]
          )
      );

      setStatus("syncing");

      let processedAny = false;
      for (const log of pending) {
        const eventKey = `${log.transactionHash}:${log.logIndex}`;
        const paymentId = log.paymentId!;
        const testType = log.testType!;

        // Read the encrypted pass/fail result. getTestResult requires
        // msg.sender == auditor — account= sets from= on the eth_call.
        const handle = await publicClient.readContract({
          address: reviewRegistryAddress,
          abi: reviewAbi,
          functionName: "getTestResult",
          args: [walletAddress, paymentId, BigInt(testType)],
          account: walletAddress,
        });

        const handleHex = fheHandleToHex(handle as bigint);

        const results = await fhevm.userDecrypt(
          [{ handle: handleHex, contractAddress: reviewRegistryAddress }],
          session.privateKey,
          session.publicKey,
          session.signature,
          [reviewRegistryAddress],
          walletAddress,
          session.startTimestamp,
          session.durationDays
        );

        const value = results[handleHex];
        const triggered = value === true || Number(value) === 1;

        if (!triggered) {
          // Test passed — no finding, no on-chain trace (same as the relay).
          processedSet.add(eventKey);
          processedAny = true;
          continue;
        }

        // Submit the finding from the auditor's own wallet. The contract's
        // recordFindingIfTriggered() permits any approved auditor to record
        // results evaluated for their own configuration.
        const txHash = await walletClient.writeContract({
          address: reviewRegistryAddress,
          abi: reviewAbi,
          functionName: "recordFindingIfTriggered",
          args: [paymentId, BigInt(testType), true],
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });

        if (receipt.status === "success") {
          processedSet.add(eventKey);
          processedAny = true;
          setPendingCount((c) => Math.max(0, c - 1));
        }
      }

      if (processedAny) {
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify([...processedSet].slice(-5000))
          );
        } catch {
          // Storage full/unavailable — worst case events are re-decrypted next cycle
        }
      }
      setStatus("idle");
      setLastError(null);
      return { ok: true, upToDate: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // User rejected the signature prompt — stay quiet until next cycle
      if (/user rejected|user denied/i.test(msg)) {
        setStatus("idle");
        return null;
      } else {
        console.error("Findings pull failed:", err);
        setStatus("error");
        setLastError(msg);
        return { ok: false, upToDate: false };
      }
    } finally {
      busyRef.current = false;
    }
  }, [
    scanPending,
    publicClient,
    walletClient,
    chainId,
    reviewRegistryAddress,
    auditRegistryAddress,
    walletAddress,
    deployedAtBlock,
  ]);

  useEffect(() => {
    // Defer the first scan so state updates never fire synchronously in the effect body
    const initial = setTimeout(() => void scanPending(), 0);
    const timer = setInterval(() => {
      // Skip background scans while a signing pull is in progress — the pull
      // refreshes pendingCount itself as it records findings.
      if (!busyRef.current) void scanPending();
    }, PULL_INTERVAL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [scanPending]);

  return {
    status,
    pendingCount,
    lastError,
    /** Manual pull — signs and records pending findings; no-ops while running */
    pullNow: runPullCycle,
  };
}
