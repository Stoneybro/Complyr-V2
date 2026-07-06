import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { http } from 'wagmi';

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY;
const sepoliaRpc = alchemyKey
  ? `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`
  : 'https://ethereum-sepolia-rpc.publicnode.com'; // public fallback

export const config = getDefaultConfig({
  appName: 'Complyr',
  projectId: '8e0d03d30151bb8e3bd1eea68f51120c',
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(sepoliaRpc),
  },
  ssr: true,
});
