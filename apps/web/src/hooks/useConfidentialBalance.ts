"use client";

/**
 * useConfidentialBalance — fetches and decrypts the user's cUSDC balance.
 *
 * Two-query cascade pattern:
 *
 *  Query 1 (encHandle): polls confidentialBalanceOf(address) on an interval.
 *    - Cheap read-only RPC call — no wallet interaction.
 *    - Returns a raw bytes32 ciphertext handle from the contract.
 *
 *  Query 2 (balance): re-encrypts and decrypts only when the handle changes.
 *    - Calls getDecryptSession() which prompts the wallet ONCE per session.
 *    - Uses staleTime: Infinity because the same handle always decrypts to
 *      the same plaintext; React Query will only re-run this when the handle
 *      in the query key changes (i.e. after a payment updates the on-chain state).
 *
 * After a payment completes, invalidate the handle query to trigger a fresh
 * poll, which in turn changes the key on Query 2 and forces re-decryption:
 *
 *   queryClient.invalidateQueries({ queryKey: ["cusdc-handle", chainId, address] })
 *
 * SDK reference (FhevmInstance.userDecrypt):
 *   userDecrypt(
 *     handles: HandleContractPair[],      // { handle: bytes32 hex, contractAddress }
 *     privateKey: string,                 // no-0x hex
 *     publicKey: string,                  // no-0x hex
 *     signature: string,                  // 0x-prefixed wallet signature
 *     contractAddresses: string[],
 *     userAddress: string,
 *     startTimestamp: number,
 *     durationDays: number,
 *   ): Promise<UserDecryptResults>        // Record<`0x${handle}`, bigint | boolean | `0x${string}`>
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useReadContract, useChainId, useWalletClient } from "wagmi";
import { formatUnits } from "viem";
import { fheHandleToHex, type FheHandle } from "@/lib/fhe-handle";
import { getFhevmInstance } from "@/lib/fhe";
import { getDecryptSession, clearDecryptSession } from "@/lib/decrypt-session";
import { ConfidentialUSDCAddress } from "@/lib/CA";
import ConfidentialUSDCAbi from "@/lib/abis/ConfidentialUSDC.json";

const USDC_DECIMALS = 6;

export interface ConfidentialBalanceResult {
  /** Human-readable formatted balance, e.g. "1,234.56" */
  formatted: string;
  /** Raw BigInt balance in token units, null until decrypted */
  raw: bigint | null;
  /** True while either query is fetching for the first time */
  isLoading: boolean;
  /** True when any query is actively refetching */
  isFetching: boolean;
  /** True specifically while the EIP-712 signing prompt is in flight */
  isUnlocking: boolean;
  /** Error from either query */
  error: Error | null;
  /** Call to explicitly refetch the handle (triggers re-decryption if balance changed) */
  invalidate: () => void;
}

export function useConfidentialBalance(): ConfidentialBalanceResult {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();

  // ── Query 1: fetch the encrypted ciphertext handle from the contract ───────
  // This polls cheaply on a 15s interval. No wallet interaction required.
  const {
    data: encHandle,
    isLoading: isHandleLoading,
    isFetching: isHandleFetching,
    error: handleError,
    refetch: refetchHandle,
  } = useReadContract({
    address: ConfidentialUSDCAddress as `0x${string}`,
    abi: ConfidentialUSDCAbi,
    functionName: "confidentialBalanceOf",
    args: [address],
    query: {
      enabled: !!address,
      refetchInterval: 15_000,
    },
  });

  // Derive a stable string key so React Query detects when the handle changes
  const handleKey = encHandle != null ? String(encHandle) : null;

  // ── Query 2: re-encrypt + decrypt only when the handle changes ─────────────
  // staleTime: Infinity — identical ciphertext handle → identical plaintext,
  // no point re-decrypting until the handle itself changes.
  const {
    data: decryptedBalance,
    isLoading: isDecryptLoading,
    isFetching: isDecryptFetching,
    error: decryptError,
  } = useQuery({
    queryKey: ["cusdc-balance", chainId, address, handleKey],
    queryFn: async (): Promise<bigint> => {
      if (!address || !walletClient || encHandle == null) {
        throw new Error("Missing prerequisites for decryption");
      }

      // If the contract returns 0n (uninitialized balance mapping), the balance is simply 0.
      if (encHandle === 0n) {
        return 0n;
      }

      const fhevm = await getFhevmInstance();

      // getDecryptSession prompts the wallet only on first call per tab/session
      const session = await getDecryptSession(
        chainId,
        address,
        ConfidentialUSDCAddress,
        (typedData) =>
          walletClient.signTypedData(
            typedData as Parameters<typeof walletClient.signTypedData>[0]
          )
      );

      // userDecrypt expects the handle as a 0x-prefixed bytes32 hex string.
      const handleHex = fheHandleToHex(encHandle as FheHandle);

      const results = await fhevm.userDecrypt(
        [{ handle: handleHex, contractAddress: ConfidentialUSDCAddress }],
        session.privateKey,    // no-0x hex
        session.publicKey,     // no-0x hex
        session.signature,     // 0x-prefixed
        [ConfidentialUSDCAddress],
        address,
        session.startTimestamp,
        session.durationDays
      );

      // results is Record<`0x${handle}`, bigint | boolean | `0x${string}`>
      const value = results[handleHex];
      if (value === undefined || value === null) {
        throw new Error("Decryption returned no value for handle");
      }

      return BigInt(value as bigint | string);
    },
    enabled: !!address && !!walletClient && encHandle != null && handleKey !== null,
    staleTime: Infinity,
    retry: 1,
  });

  const invalidate = () => {
    refetchHandle();
    queryClient.invalidateQueries({
      queryKey: ["cusdc-balance", chainId, address],
    });
  };

  const isLoading = isHandleLoading || isDecryptLoading;
  const isFetching = isHandleFetching || isDecryptFetching;
  // isUnlocking = decrypt query is actively fetching but we have no cached result yet
  const isUnlocking = isDecryptFetching && decryptedBalance === undefined;
  const error = (handleError || decryptError) as Error | null;

  const formatted =
    decryptedBalance !== undefined && decryptedBalance !== null
      ? Number(formatUnits(decryptedBalance, USDC_DECIMALS)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "···";

  return {
    formatted,
    raw: decryptedBalance ?? null,
    isLoading,
    isFetching,
    isUnlocking,
    error,
    invalidate,
  };
}

/**
 * Call this during logout (onBeforeDisconnect) to clear the cached
 * decrypt session for the current wallet + chain + contract scope.
 */
export function clearConfidentialBalanceSession(
  chainId: number,
  address: string
): void {
  clearDecryptSession(chainId, address, ConfidentialUSDCAddress);
}
