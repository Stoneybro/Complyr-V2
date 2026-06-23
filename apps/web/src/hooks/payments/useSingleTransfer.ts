import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
// import { useWriteContract } from "wagmi";
// import ConfidentialUSDCAbi from "@/lib/abis/ConfidentialUSDC.json";

export function useSingleTransfer(activeBalance: any) {
  return useMutation({
    mutationFn: async (data: any) => {
      data.onStatusUpdate?.("Encrypting...");
      
      // 1. Call our backend to encrypt the input using FHE
      const encRes = await fetch("/api/fhe/encrypt-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: data.amount, audit: data.audit }),
      });
      
      if (!encRes.ok) throw new Error("Encryption failed");
      const { encryptedAmount, inputProof } = await encRes.json();
      
      data.onStatusUpdate?.("Signing...");
      
      // 2. Submit transaction via wagmi to the blockchain
      // In a real app, you'd use useWriteContract here to call confidentialTransferAndCall
      // Example:
      // await writeContractAsync({
      //   address: data.tokenAddress,
      //   abi: ConfidentialUSDCAbi,
      //   functionName: 'confidentialTransferAndCall',
      //   args: [data.to, encryptedAmount, inputProof, "0x"], // 0x = empty callback data for now
      // });
      
      // Simulate tx confirmation delay
      await new Promise((r) => setTimeout(r, 2000));
      
      data.onStatusUpdate?.("Complete");
      toast.success("Payment sent!");
      return { ...data, encryptedAmount };
    },
  });
}
