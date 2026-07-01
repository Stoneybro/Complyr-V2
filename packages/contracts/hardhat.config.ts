import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@fhevm/hardhat-plugin";

import { vars } from "hardhat/config";

// ─── Environment vars (set via: pnpm hardhat vars set KEY VALUE) ───────────────
const DEPLOYER_PRIVATE_KEY: string  = vars.has("DEPLOYER_PRIVATE_KEY") ? vars.get("DEPLOYER_PRIVATE_KEY") : process.env.DEPLOYER_PRIVATE_KEY ?? "";
const INFURA_API_KEY: string        = vars.has("INFURA_API_KEY") ? vars.get("INFURA_API_KEY") : process.env.INFURA_API_KEY ?? "";
const ETHERSCAN_API_KEY: string     = vars.has("ETHERSCAN_API_KEY") ? vars.get("ETHERSCAN_API_KEY") : process.env.ETHERSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      // fhEVM mock coprocessor — used for all local tests
    },
    sepolia: {
      url: INFURA_API_KEY
        ? `https://sepolia.infura.io/v3/${INFURA_API_KEY}`
        : "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
