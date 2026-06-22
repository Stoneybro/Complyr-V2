// Dummy implementation to avoid compiler errors without the V1 backend
export async function fetchWalletBalance(smartAccountAddress: `0x${string}`) {
  return {
    availableEthBalance: "1.5",
    committedEthBalance: "0.0",
    totalEthBalance: "1.5",
    
    availableUsdcBalance: "1000.0",
    committedUsdcBalance: "0.0",
    totalUsdcBalance: "1000.0",
  };
}

export function safeJsonStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v);
}
