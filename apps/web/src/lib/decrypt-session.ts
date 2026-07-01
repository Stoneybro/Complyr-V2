/**
 * Decrypt session manager — client-side only.
 *
 * Handles the one-time EIP-712 signing flow required to authorise
 * the Zama KMS gateway to re-encrypt fhEVM ciphertexts back to the user's
 * local keypair. The resulting session material (keypair + signature)
 * is persisted in sessionStorage so the wallet prompt fires once per
 * browser tab/session, not on every balance refresh.
 *
 * Key design decisions:
 *  - Scoped by chainId + walletAddress + contractAddress so switching
 *    wallets or networks never serves a stale session.
 *  - generateKeypair() returns KeypairType<BytesHexNo0x> — both keys are
 *    plain no-0x hex strings, safe to JSON.stringify directly.
 *  - EIP-712 timestamp window: 24 hours, starting now. The session is
 *    purged on logout so the window is effectively bounded by the session.
 *  - clearDecryptSession() is called from onBeforeDisconnect so logout
 *    always purges the cached session before wagmi disconnects.
 *
 * SDK reference (FhevmInstance):
 *   generateKeypair(): KeypairType<BytesHexNo0x>
 *   createEIP712(publicKey: string, contractAddresses: string[], startTimestamp: number, durationDays: number): KmsUserDecryptEIP712Type
 */

import { getFhevmInstance } from "./fhe";

/** The EIP-712 validity window. Keep short — session is wiped on logout anyway. */
const SESSION_DURATION_DAYS = 1;

export interface DecryptSession {
  /** No-0x hex string */
  publicKey: string;
  /** No-0x hex string */
  privateKey: string;
  /** Full 0x-prefixed hex signature from the wallet */
  signature: string;
  /** Unix seconds — when the EIP-712 window opens */
  startTimestamp: number;
  /** Same duration used for both EIP-712 creation and userDecrypt call */
  durationDays: number;
}

function sessionKey(
  chainId: number,
  address: string,
  contractAddress: string
): string {
  return `complyr:decrypt-session:${chainId}:${address.toLowerCase()}:${contractAddress.toLowerCase()}`;
}

/**
 * Returns the cached decrypt session if one exists for the given scope,
 * otherwise initiates the EIP-712 signing flow and caches the result.
 *
 * @param chainId          - Active chain ID (e.g. 11155111 for Sepolia)
 * @param address          - Connected wallet address
 * @param contractAddress  - The fhEVM contract whose ciphertexts we'll decrypt
 * @param signTypedData    - Async fn that calls walletClient.signTypedData
 */
export async function getDecryptSession(
  chainId: number,
  address: string,
  contractAddress: string,
  signTypedData: (typedData: Record<string, unknown>) => Promise<string>
): Promise<DecryptSession> {
  if (typeof window === "undefined") {
    throw new Error("getDecryptSession() must only be called in browser context");
  }

  const key = sessionKey(chainId, address, contractAddress);

  // Return cached session if available
  const cached = sessionStorage.getItem(key);
  if (cached) {
    try {
      return JSON.parse(cached) as DecryptSession;
    } catch {
      // Corrupted cache — fall through to re-create
      sessionStorage.removeItem(key);
    }
  }

  // Generate a fresh ephemeral keypair.
  // generateKeypair() returns KeypairType<BytesHexNo0x>: both fields are
  // plain hex strings (no 0x prefix), safe to store directly in JSON.
  const fhevm = await getFhevmInstance();
  const { publicKey, privateKey } = fhevm.generateKeypair();

  const startTimestamp = Math.floor(Date.now() / 1000);
  const durationDays = SESSION_DURATION_DAYS;

  // createEIP712 takes: publicKey (no-0x hex), contractAddresses[], startTimestamp, durationDays
  const eip712 = fhevm.createEIP712(
    publicKey,
    [contractAddress],
    startTimestamp,
    durationDays
  );

  const rawSignature = await signTypedData(eip712 as unknown as Record<string, unknown>);

  const session: DecryptSession = {
    publicKey,
    privateKey,
    signature: rawSignature, // keep the 0x prefix — userDecrypt receives it as-is
    startTimestamp,
    durationDays,
  };

  // Persist for the lifetime of this browser tab
  sessionStorage.setItem(key, JSON.stringify(session));

  return session;
}

/**
 * Clears the decrypt session for the given scope.
 * Call this from onBeforeDisconnect so logout always wipes the cached session.
 */
export function clearDecryptSession(
  chainId: number,
  address: string,
  contractAddress: string
): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(sessionKey(chainId, address, contractAddress));
}
