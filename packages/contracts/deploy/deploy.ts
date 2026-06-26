/**
 * Complyr V2 — Sepolia Deployment Script
 *
 * Deploys the full system in the correct order:
 *   1. ConfidentialUSDC
 *   2. AuditRegistry (implementation — used as EIP-1167 clone target)
 *   3. ReviewTestRegistry (implementation — used as EIP-1167 clone target)
 *   4. ComplyrFactory
 *   5. deployRegistry(testBusiness) — wires a full clone pair for smoke-testing
 *
 * Usage:
 *   pnpm hardhat run deploy/deploy.ts --network sepolia
 *
 * Required env vars (set via `npx hardhat vars set`):
 *   MNEMONIC or DEPLOYER_PRIVATE_KEY
 *   INFURA_API_KEY  (or another RPC endpoint)
 *   ETHERSCAN_API_KEY  (for verification)
 *
 * After deployment, addresses are printed to stdout and written to
 * deploy/deployments.json for frontend consumption.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Configuration ────────────────────────────────────────────────────────────

// The address that will receive the test business registry clone.
// Change this to your actual test business wallet before deploying.
const TEST_BUSINESS_ADDRESS = process.env.TEST_BUSINESS_ADDRESS ?? "";

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Complyr V2 — Deployment");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Network  : ${network.name} (chainId ${network.chainId})`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(
    `  Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`,
  );
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Step 1: ConfidentialUSDC ──────────────────────────────────────────────
  console.log("[1/5] Deploying ConfidentialUSDC...");
  const tokenFactory = await ethers.getContractFactory("ConfidentialUSDC");
  const token = await tokenFactory.connect(deployer).deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`      ✅ ConfidentialUSDC    : ${tokenAddress}\n`);

  // ── Step 2: AuditRegistry implementation ─────────────────────────────────
  console.log("[2/5] Deploying AuditRegistry implementation...");
  const arFactory = await ethers.getContractFactory("AuditRegistry");
  const auditRegistryImpl = await arFactory.connect(deployer).deploy();
  await auditRegistryImpl.waitForDeployment();
  const auditRegistryImplAddress = await auditRegistryImpl.getAddress();
  console.log(`      ✅ AuditRegistry (impl): ${auditRegistryImplAddress}\n`);

  // ── Step 3: ReviewTestRegistry implementation ─────────────────────────────
  console.log("[3/5] Deploying ReviewTestRegistry implementation...");
  const rtrFactory = await ethers.getContractFactory("ReviewTestRegistry");
  const reviewTestRegistryImpl = await rtrFactory.connect(deployer).deploy();
  await reviewTestRegistryImpl.waitForDeployment();
  const reviewTestRegistryImplAddress = await reviewTestRegistryImpl.getAddress();
  console.log(`      ✅ ReviewTestRegistry (impl): ${reviewTestRegistryImplAddress}\n`);

  // ── Step 4: ComplyrFactory ────────────────────────────────────────────────
  console.log("[4/5] Deploying ComplyrFactory...");
  const cfFactory = await ethers.getContractFactory("ComplyrFactory");
  const complyrFactory = await cfFactory
    .connect(deployer)
    .deploy(tokenAddress, auditRegistryImplAddress, reviewTestRegistryImplAddress);
  await complyrFactory.waitForDeployment();
  const factoryAddress = await complyrFactory.getAddress();
  console.log(`      ✅ ComplyrFactory        : ${factoryAddress}\n`);

  // ── Step 5: Deploy a test business registry pair ──────────────────────────
  let testAuditRegistryAddress = "";
  let testReviewTestRegistryAddress = "";

  const businessAddress = TEST_BUSINESS_ADDRESS !== "" ? TEST_BUSINESS_ADDRESS : deployer.address;

  console.log(`[5/5] Deploying test business registry pair for: ${businessAddress}`);
  const deployTx = await complyrFactory.connect(deployer).deployRegistry(businessAddress);
  const receipt = await deployTx.wait();

  const reg = await complyrFactory.getRegistry(businessAddress);
  testAuditRegistryAddress = reg.auditRegistry;
  testReviewTestRegistryAddress = reg.reviewTestRegistry;

  console.log(`      ✅ AuditRegistry (proxy): ${testAuditRegistryAddress}`);
  console.log(`      ✅ ReviewTestRegistry (proxy): ${testReviewTestRegistryAddress}`);
  console.log(`      📦 Deployed at block: ${receipt?.blockNumber}\n`);

  // ── Verification: wiring sanity checks ───────────────────────────────────
  console.log("── Verifying wiring ─────────────────────────────────────────");
  const auditRegistryProxy = await ethers.getContractAt(
    "AuditRegistry",
    testAuditRegistryAddress,
  );
  const reviewRegistryProxy = await ethers.getContractAt(
    "ReviewTestRegistry",
    testReviewTestRegistryAddress,
  );

  const arOwner = await auditRegistryProxy.owner();
  const rtrOwner = await reviewRegistryProxy.owner();
  const arToken = await auditRegistryProxy.confidentialToken();
  const arRTR = await auditRegistryProxy.reviewTestRegistry();

  console.log(`  AuditRegistry owner      : ${arOwner} ${arOwner === businessAddress ? "✅" : "❌ WRONG"}`);
  console.log(`  ReviewTestRegistry owner : ${rtrOwner} ${rtrOwner === businessAddress ? "✅" : "❌ WRONG"}`);
  console.log(`  AuditRegistry token      : ${arToken} ${arToken === tokenAddress ? "✅" : "❌ WRONG"}`);
  console.log(`  AuditRegistry → RTR      : ${arRTR} ${arRTR === testReviewTestRegistryAddress ? "✅" : "❌ WRONG"}`);

  const businessCount = await complyrFactory.businessCount();
  console.log(`  Factory businessCount    : ${businessCount} ✅`);
  console.log("─────────────────────────────────────────────────────────────\n");

  // ── Write deployments.json ────────────────────────────────────────────────
  const deployments = {
    network: network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      ConfidentialUSDC: {
        address: tokenAddress,
        description: "ERC-7984 confidential USDC wrapper",
      },
      AuditRegistryImpl: {
        address: auditRegistryImplAddress,
        description: "AuditRegistry EIP-1167 clone target (not used directly)",
      },
      ReviewTestRegistryImpl: {
        address: reviewTestRegistryImplAddress,
        description: "ReviewTestRegistry EIP-1167 clone target (not used directly)",
      },
      ComplyrFactory: {
        address: factoryAddress,
        description: "Clone deployer — call deployRegistry(businessAddress) per business",
      },
    },
    testBusiness: {
      address: businessAddress,
      AuditRegistry: {
        address: testAuditRegistryAddress,
        description: "Per-business AuditRegistry clone (configured for demo)",
      },
      ReviewTestRegistry: {
        address: testReviewTestRegistryAddress,
        description: "Per-business ReviewTestRegistry clone (configured for demo)",
      },
    },
  };

  const deploymentsPath = path.join(__dirname, "deployments.json");
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log(`📄 Deployments written to: ${deploymentsPath}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Deployment Complete");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ConfidentialUSDC    : ${tokenAddress}`);
  console.log(`  ComplyrFactory      : ${factoryAddress}`);
  console.log(`  Test AuditRegistry  : ${testAuditRegistryAddress}`);
  console.log(`  Test ReviewRegistry : ${testReviewTestRegistryAddress}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\nNext steps:");
  console.log("  1. Verify contracts on Etherscan:");
  console.log(`     pnpm hardhat verify --network sepolia ${tokenAddress}`);
  console.log(`     pnpm hardhat verify --network sepolia ${auditRegistryImplAddress}`);
  console.log(`     pnpm hardhat verify --network sepolia ${reviewTestRegistryImplAddress}`);
  console.log(
    `     pnpm hardhat verify --network sepolia ${factoryAddress} ${tokenAddress} ${auditRegistryImplAddress} ${reviewTestRegistryImplAddress}`,
  );
  console.log("  2. Copy addresses to apps/web/.env.local");
  console.log("  3. Call setAuthTierThresholds from the business wallet to enable payments\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
