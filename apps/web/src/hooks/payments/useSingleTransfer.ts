import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { stringToCategory } from "@/lib/audit-enums";
// import { useWriteContract } from "wagmi";
// import ConfidentialUSDCAbi from "@/lib/abis/ConfidentialUSDC.json";

export function useSingleTransfer(activeBalance: any) {
  return useMutation({
    mutationFn: async (data: any) => {
      data.onStatusUpdate?.("Encrypting...");

      // Convert the GL category string to its enum uint8 value
      const categoryValue = stringToCategory(data.category);

      // 1. Call backend to FHE-encrypt amount + category
      const encRes = await fetch("/api/fhe/encrypt-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: data.amount,
          category: categoryValue,
        }),
      });

      if (!encRes.ok) throw new Error("Encryption failed");
      const { encryptedAmount, inputProof, encryptedCategory } = await encRes.json();

      data.onStatusUpdate?.("Signing...");

      // 2. Submit transaction via wagmi
      // In production, call confidentialTransferAndCallWithAudit on ConfidentialUSDC:
      //
      // const auditFields: ExternalAuditFields = {
      //   category: encryptedCategory,
      //   inputProof,
      //   recipient: data.to,
      //   invoiceHash: data.invoiceHash ?? ethers.ZeroHash,
      //   poHash: data.poHash ?? ethers.ZeroHash,
      // };
      //
      // await writeContractAsync({
      //   address: data.tokenAddress,
      //   abi: ConfidentialUSDCAbi,
      //   functionName: "confidentialTransferAndCallWithAudit",
      //   args: [encryptedAmount, inputProof, auditFields],
      // });

      // Simulate tx confirmation delay
      await new Promise((r) => setTimeout(r, 2000));

      data.onStatusUpdate?.("Complete");
      toast.success("Payment sent!");
      return { ...data, encryptedAmount, encryptedCategory };
    },
  });
}
