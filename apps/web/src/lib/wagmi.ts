import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Complyr',
  projectId: '8e0d03d30151bb8e3bd1eea68f51120c',
  chains: [sepolia],
  ssr: true,
});
