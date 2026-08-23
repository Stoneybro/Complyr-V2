/**
 * check-tests.ts
 * Queries the ComplyrFactory on Sepolia, collects all 9 ReviewTestRegistry
 * addresses, then fetches TestCreated events in one multi-address batch
 * per 10k-block chunk (dRPC free-tier limit).
 *
 * Run: npx hardhat run scripts/check-tests.ts --network sepolia
 */

import { ethers } from "hardhat";

// ── Config ────────────────────────────────────────────────────────────────────

// dRPC — keyless public Sepolia archive RPC (10k block limit per eth_getLogs call)
const RPC_URL      = "https://sepolia.drpc.org";
const FACTORY_ADDR = "0x4508f247D0eBE3311e4dA32404cb75f308b20EBf";
const DEPLOY_BLOCK = 8_500_000; // approx factory deploy block (2026-07-07)
const CHUNK_SIZE   = 10_000;    // dRPC free-tier log range limit

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

const TEST_TYPE: Record<number, string> = {
  0: "MATERIALITY",
  1: "AUTHORIZATION_BREACH",
  2: "SEGREGATION_OF_DUTIES",
  3: "MISSING_EVIDENCE",
  4: "CATEGORY_CONCENTRATION",
  5: "RECIPIENT_CONCENTRATION",
  6: "STRUCTURING",
};

const PRIORITY: Record<number, string> = {
  0: "NONE", 1: "MONITORING", 2: "STANDARD", 3: "CRITICAL",
};

// TestCreated(address,uint8,uint8,uint8) topic0
const TEST_CREATED_TOPIC = ethers.id("TestCreated(address,uint8,uint8,uint8)");

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const factory  = new ethers.Contract(FACTORY_ADDR, FACTORY_ABI, provider);

  const currentBlock = await provider.getBlockNumber();
  const count        = Number(await factory.businessCount());

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  ComplyrFactory — Sepolia`);
  console.log(`  Factory:                     ${FACTORY_ADDR}`);
  console.log(`  Total businesses registered: ${count}`);
  console.log(`  Scanning blocks ${DEPLOY_BLOCK} → ${currentBlock}`);
  console.log(`  Strategy: multi-address batch, ${CHUNK_SIZE}-block chunks`);
  console.log(`══════════════════════════════════════════════════\n`);

  // ── Step 1: collect all business registries ───────────────────────────────

  interface BizInfo {
    wallet:      string;
    arAddr:      string;
    rtrAddr:     string;
    isActive:    boolean;
    deployBlock: number;
  }

  const businesses: BizInfo[] = [];

  for (let i = 0; i < count; i++) {
    const wallet = await factory.businesses(i) as string;
    const reg    = await factory.getRegistry(wallet);
    businesses.push({
      wallet,
      arAddr:      reg.auditRegistry  as string,
      rtrAddr:     reg.reviewTestRegistry as string,
      isActive:    reg.active as boolean,
      deployBlock: Number(reg.deployedAtBlock),
    });
  }

  const rtrAddresses = businesses.map(b => b.rtrAddr.toLowerCase());

  // ── Step 2: fetch TestCreated logs across all RTR addresses in chunks ─────

  // Map rtrAddr (lowercase) → raw log array
  const logsByRtr: Record<string, ethers.Log[]> = {};
  rtrAddresses.forEach(a => { logsByRtr[a] = []; });

  const totalChunks = Math.ceil((currentBlock - DEPLOY_BLOCK + 1) / CHUNK_SIZE);
  console.log(`  Fetching logs in ${totalChunks} chunks across all 9 registries...\n`);

  for (let from = DEPLOY_BLOCK; from <= currentBlock; from += CHUNK_SIZE) {
    const to   = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    const logs = await provider.getLogs({
      address: rtrAddresses,       // all 9 at once
      topics:  [TEST_CREATED_TOPIC],
      fromBlock: from,
      toBlock:   to,
    });

    for (const log of logs) {
      const key = log.address.toLowerCase();
      if (logsByRtr[key]) logsByRtr[key].push(log);
    }

    process.stdout.write(`  chunk ${from}–${to}: ${logs.length} events\r`);
  }

  process.stdout.write("\n");

  // ── Step 3: decode and print results ─────────────────────────────────────

  const iface = new ethers.Interface(RTR_ABI);
  let totalTests = 0;

  for (const biz of businesses) {
    const rtr          = new ethers.Contract(biz.rtrAddr, RTR_ABI, provider);
    const auditorCount = await rtr.activeAuditorCount();
    const logs         = logsByRtr[biz.rtrAddr.toLowerCase()] ?? [];

    const idx = businesses.indexOf(biz) + 1;
    console.log(`─── Business ${idx} ────────────────────────────────────`);
    console.log(`  Wallet:             ${biz.wallet}`);
    console.log(`  AuditRegistry:      ${biz.arAddr}`);
    console.log(`  ReviewTestRegistry: ${biz.rtrAddr}`);
    console.log(`  Status:             ${biz.isActive ? "active" : "deactivated"}`);
    console.log(`  Deployed at block:  ${biz.deployBlock}`);
    console.log(`  Active auditors:    ${auditorCount}`);

    if (logs.length === 0) {
      console.log(`  TestCreated events: none\n`);
    } else {
      console.log(`  TestCreated events: ${logs.length}`);

      for (const log of logs) {
        const decoded  = iface.parseLog({ topics: [...log.topics], data: log.data })!;
        const auditor  = decoded.args[0] as string;
        const testType = Number(decoded.args[1]);
        const scope    = Number(decoded.args[2]);
        const priority = Number(decoded.args[3]);

        const blockData = await provider.getBlock(log.blockNumber);
        const ts = blockData
          ? new Date(Number(blockData.timestamp) * 1000).toISOString()
          : "unknown";

        console.log(`    ┌ auditor:  ${auditor}`);
        console.log(`    │ testType: ${TEST_TYPE[testType] ?? testType}`);
        console.log(`    │ priority: ${PRIORITY[priority] ?? priority}`);
        if (testType === 4) console.log(`    │ scope (GL bucket): ${scope}`);
        console.log(`    │ block:    ${log.blockNumber}`);
        console.log(`    └ time:     ${ts}`);
      }

      console.log();
      totalTests += logs.length;
    }
  }

  console.log(`══════════════════════════════════════════════════`);
  console.log(`  Total TestCreated events across all businesses: ${totalTests}`);
  console.log(`══════════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
