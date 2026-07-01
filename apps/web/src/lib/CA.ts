/** Deployed contract addresses — sourced from environment variables. */

export const ConfidentialUSDCAddress =
  process.env.NEXT_PUBLIC_CONFIDENTIAL_USDC ||
  "0x0000000000000000000000000000000000000000";

/** @deprecated use ConfidentialUSDCAddress */
export const USDCAddress = ConfidentialUSDCAddress;

export const ComplyrFactoryAddress =
  process.env.NEXT_PUBLIC_COMPLYR_FACTORY ||
  "0x0000000000000000000000000000000000000000";

/**
 * Smoke-test registry addresses (deployer's own clone).
 * In production, each business reads their own clone via getRegistry(address).
 */
export const AuditRegistryAddress =
  process.env.NEXT_PUBLIC_TEST_AUDIT_REGISTRY ||
  "0x0000000000000000000000000000000000000000";

export const ReviewRegistryAddress =
  process.env.NEXT_PUBLIC_TEST_REVIEW_REGISTRY ||
  "0x0000000000000000000000000000000000000000";
