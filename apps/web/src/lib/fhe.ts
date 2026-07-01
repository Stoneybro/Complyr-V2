/**
 * Zama FHE SDK singleton — client-side only.
 *
 * The @zama-fhe/relayer-sdk/web bundle uses browser APIs (WebWorker, WASM, `self`).
 * This module must NEVER be imported on the server — it is dynamically imported
 * only within async functions that run in browser context.
 *
 * Pattern from winning Zama hackathon projects (SealPad, Confidential Derivatives):
 * initialise once, cache forever, reuse everywhere.
 *
 * SepoliaConfig is typed as Omit<FhevmInstanceConfig, 'network'> — the `network`
 * field (RPC URL or Eip1193Provider) must be supplied at call site.
 *
 * Usage:
 *   const fhevm = await getFhevmInstance();
 *   const input = fhevm.createEncryptedInput(contractAddress, userAddress);
 *   input.add64(BigInt(amount));
 *   const { handles, inputProof } = await input.encrypt();
 *   // Convert Uint8Array → 0x-hex with viem's toHex() before passing to wagmi
 */

// Public Sepolia RPC — no API key required for hackathon purposes
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// Module-level singleton — survives React re-renders, reused across components
let _instance: unknown = null;
let _initPromise: Promise<unknown> | null = null;

export async function getFhevmInstance() {
  if (typeof window === "undefined") {
    throw new Error("getFhevmInstance() must only be called in browser context");
  }

  if (_instance) return _instance as Awaited<ReturnType<typeof _create>>;

  // Deduplicate concurrent calls — only one init promise runs at a time
  if (_initPromise) return _initPromise as Promise<Awaited<ReturnType<typeof _create>>>;

  _initPromise = _create();
  return _initPromise as Promise<Awaited<ReturnType<typeof _create>>>;
}

async function _create() {
  // Dynamic import keeps the WASM bundle out of the initial page chunk
  const { createInstance, initSDK, SepoliaConfig } = await import("@zama-fhe/relayer-sdk/web");

  // MUST initialize WASM binaries before creating the instance!
  await initSDK();

  const inst = await createInstance({
    ...SepoliaConfig,
    network: SEPOLIA_RPC,
  });

  _instance = inst;
  _initPromise = null;
  return inst;
}

/** Resets the singleton — useful when switching networks (tests only). */
export function resetFhevmInstance() {
  _instance = null;
  _initPromise = null;
}
