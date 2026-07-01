"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toHex } from "viem";
import { sepolia } from "wagmi/chains";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getFhevmInstance } from "@/lib/fhe";
import { ConfidentialUSDCAddress } from "@/lib/CA";
import ConfidentialUSDCAbi from "@/lib/abis/ConfidentialUSDC.json";

const USDC_DECIMALS = 6n;
const MINT_AMOUNT = 1000000n * 10n ** USDC_DECIMALS;

export default function MintPage() {
  const { address } = useAccount();
  const [status, setStatus] = useState<string>("");
  const { writeContractAsync } = useWriteContract();

  const handleMint = async () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    try {
      setStatus("Initializing Zama FHE...");
      const fhevm = await getFhevmInstance();

      setStatus(`Encrypting 10,000 cUSDC...`);
      const input = fhevm.createEncryptedInput(ConfidentialUSDCAddress, address);
      input.add64(MINT_AMOUNT);
      const encrypted = await input.encrypt();

      const encAmount = toHex(encrypted.handles[0]) as `0x${string}`;
      const amountProof = toHex(encrypted.inputProof) as `0x${string}`;

      setStatus("Confirm transaction in your wallet...");
      const txHash = await writeContractAsync({
        address: ConfidentialUSDCAddress as `0x${string}`,
        abi: ConfidentialUSDCAbi,
        functionName: "mint",
        args: [address, encAmount, amountProof],
        chainId: sepolia.id,
      });

      setStatus(`Transaction submitted! Hash: ${txHash}`);
      toast.success("Mint transaction submitted!");
      
    } catch (err: any) {
      console.error(err);
      toast.error("Minting failed", { description: err.message });
      setStatus("");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mint Dev Tokens</h1>
        <p className="text-muted-foreground">
          Mint 10,000 cUSDC to your connected wallet (Deployer Only).
        </p>
      </div>

      <Button onClick={handleMint} size="lg" className="w-64">
        Mint 10,000 cUSDC
      </Button>

      {status && (
        <div className="text-sm text-muted-foreground animate-pulse">
          {status}
        </div>
      )}
    </div>
  );
}
