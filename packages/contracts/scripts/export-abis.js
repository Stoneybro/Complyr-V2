const fs = require("fs");
const path = require("path");

const contractsToExport = [
  "ConfidentialUSDC",
  "ComplyrFactory",
  "AuditRegistry",
  "ReviewTestRegistry"
];

const artifactsDir = path.join(__dirname, "../artifacts/contracts");
const outputDir = path.join(__dirname, "../../../apps/web/src/lib/abis");

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log("Extracting ABIs...");

for (const contractName of contractsToExport) {
  let found = false;
  
  // Hardhat places the artifact at artifacts/contracts/ContractName.sol/ContractName.json
  const possiblePaths = [
    path.join(artifactsDir, `${contractName}.sol`, `${contractName}.json`),
    // Sometimes it might be in a subfolder, so we do a naive search if needed, but this is standard:
  ];
  
  for (const artifactPath of possiblePaths) {
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      
      // Extract ONLY the ABI array
      const abi = artifact.abi;
      
      const outputPath = path.join(outputDir, `${contractName}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2));
      
      console.log(`✅ Exported ${contractName}.json to apps/web/src/lib/abis/`);
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.error(`❌ Could not find artifact for ${contractName}. Did you compile?`);
  }
}

console.log("Done!");



//node scripts/export-abis.js
