/**
 * check-tests.mjs
 * Queries the ComplyrFactory on Sepolia, reads all registered businesses,
 * then checks each business's ReviewTestRegistry clone for TestCreated events.
 *
 * Run: node packages/contracts/scripts/check-tests.mjs
 */

import { ethers } from "ethers";

// ── Config ────────────────────────────────────────────────────────────────────

const ALCHEMY_KEY    = "HgJGTDMXxJmscfyz5xW2q";
const RPC_URL        = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const FACTORY_ADDR   = "0x4508f247D0eBE3311e4dA32404cb75f308b20EBf";
const DEPLOY_BLOCK   = 8_500_000; // approx block when factory was deployed (2026-07-07)

// ── Minimal ABIs ──────────────────────────────────────────────────────────────

const FACTORY_ABI = [
  "function businessCount() external view returns (uint256)",
  "function businesses(uint256 index) external view returns (address)",
  "function getRegistry(address business) external view returns (address auditRegistry, address reviewTestRegistry, bool active, uint256 deployedAtBlock)",
];

const RTR_ABI = [
  "event TestCreated(address indexed auditor, uint8 indexed testType, uint8 scope, uint8 priority)",
  "function activeAuditorCount() external view returns (uint256)",
];

// Test type names matching the enum in ReviewTestRegistry.sol
const TEST_TYPE_NAMES = [
  "MATERIALITY",
  "AUTHORIZATION_BREACH",
  "SEGREGATION_OF_DUTIES",
  "MISSING_EVIDENCE",
  "CATEGORY_CONCENTRATION",
  "RECIPIENT_CONCENTRATION",
  "STRUCTURING",
];

const PRIORITY_NAMES = ["NONE", "MONITORING", "STANDARD", "CRITICAL"];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const factory  = new ethers.Contract(FACTORY_ADDR, FACTORY_ABI, provider);

  const currentBlock = await provider.getBlockNumber();
  const count = await factory.businessCount();

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  ComplyrFactory — Sepolia`);
  console.log(`  Factory:       ${FACTORY_ADDR}`);
  console.log(`  Total businesses registered: ${count}`);
  console.log(`  Scanning blocks ${DEPLOY_BLOCK} → ${currentBlock}`);
  console.log(`══════════════════════════════════════════════════\n`);

  let totalTestsFound = 0;

  for (let i = 0; i < Number(count); i++) {
    const businessAddr = await factory.businesses(i);
    const reg = await factory.getRegistry(businessAddr);

    const rtrAddr      = reg.reviewTestRegistry;
    const arAddr       = reg.auditRegistry;
    const isActive     = reg.active;
    const deployBlock  = Number(reg.deployedAtBlock);

    const rtr = new ethers.Contract(rtrAddr, RTR_ABI, provider);

    // Fetch TestCreated events from the block this clone was deployed
    const filter = rtr.filters.TestCreated();
    const events = await rtr.queryFilter(filter, deployBlock, currentBlock);

    const auditorCount = await rtr.activeAuditorCount();

    console.log(`─── Business ${i + 1} ────────────────────────────────────`);
    console.log(`  Wallet:             ${businessAddr}`);
    console.log(`  AuditRegistry:      ${arAddr}`);
    console.log(`  ReviewTestRegistry: ${rtrAddr}`);
    console.log(`  Status:             ${isActive ? "active" : "deactivated"}`);
    console.log(`  Deployed at block:  ${deployBlock}`);
    console.log(`  Active auditors:    ${auditorCount}`);

    if (events.length === 0) {
      console.log(`  TestCreated events: none\n`);
    } else {
      console.log(`  TestCreated events: ${events.length}`);
      for (const ev of events) {
        const auditor  = ev.args[0];
        const testType = Number(ev.args[1]);
        const scope    = Number(ev.args[2]);
        const priority = Number(ev.args[3]);
        const block    = ev.blockNumber;

        // Get block timestamp for context
        const blockData = await provider.getBlock(block);
        const ts = blockData ? new Date(Number(blockData.timestamp) * 1000).toISOString() : "unknown";

        console.log(`    ┌ auditor:  ${auditor}`);
        console.log(`    │ testType: ${TEST_TYPE_NAMES[testType] ?? testType}`);
        console.log(`    │ priority: ${PRIORITY_NAMES[priority] ?? priority}`);
        if (testType === 4) console.log(`    │ scope (GL bucket): ${scope}`);
        console.log(`    │ block:    ${block}`);
        console.log(`    └ time:     ${ts}`);
      }
      console.log();
      totalTestsFound += events.length;
    }
  }

  console.log(`══════════════════════════════════════════════════`);
  console.log(`  Total TestCreated events across all businesses: ${totalTestsFound}`);
  console.log(`══════════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
