import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia, hardhat } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Complyr V2',
  projectId: 'YOUR_PROJECT_ID', // TODO: Add real WalletConnect Project ID
  chains: [mainnet, sepolia, hardhat],
  ssr: true, // If your dApp uses server side rendering (SSR)
});
