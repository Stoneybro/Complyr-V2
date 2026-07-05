import { toHex, type Hex } from "viem";

export type FheHandle = bigint | Hex | Uint8Array;

const BYTES32_HEX = /^0x[0-9a-fA-F]{64}$/;

export function fheHandleToHex(handle: FheHandle): `0x${string}` {
  if (typeof handle === "string") {
    if (!BYTES32_HEX.test(handle)) {
      throw new Error(`Invalid FHE handle: expected bytes32 hex, received ${handle.length} characters`);
    }

    return handle as `0x${string}`;
  }

  return toHex(handle, { size: 32 });
}
