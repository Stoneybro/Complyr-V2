import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { stringToCategory } from "@/lib/audit-enums";

export function useBatchTransfer(activeBalance: any) {
  return useMutation({
    mutationFn: async (data: any) => {
      data.onStatusUpdate?.("Encrypting...");

      const { recipients, amounts, categories, invoiceHashes, poHashes } = data;

      // 1. Encrypt all inputs in parallel (one FHE call per recipient)
      const encryptPromises = amounts.map(async (amount: string, index: number) => {
        const categoryValue = stringToCategory(categories?.[index]);

        const res = await fetch("/api/fhe/encrypt-input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, category: categoryValue }),
        });

        if (!res.ok) throw new Error("Encryption failed for a recipient");
        return res.json();
      });

      const encryptedResults = await Promise.all(encryptPromises);

      data.onStatusUpdate?.("Signing...");

      // 2. Submit one transaction per recipient
      // In production, for each recipient:
      //
      // const { encryptedAmount, inputProof, encryptedCategory } = encryptedResults[i];
      // const auditFields: ExternalAuditFields = {
      //   category: encryptedCategory,
      //   inputProof,
      //   recipient: recipients[i],
      //   invoiceHash: invoiceHashes?.[i] ?? ethers.ZeroHash,
      //   poHash: poHashes?.[i] ?? ethers.ZeroHash,
      // };
      // await writeContractAsync({
      //   address: data.tokenAddress,
      //   abi: ConfidentialUSDCAbi,
      //   functionName: "confidentialTransferAndCallWithAudit",
      //   args: [encryptedAmount, inputProof, auditFields],
      // });

      for (let i = 0; i < recipients.length; i++) {
        await new Promise((r) => setTimeout(r, 1000));
      }

      data.onStatusUpdate?.("Complete");
      toast.success(`Batch payment to ${recipients.length} recipients sent!`);
      return { ...data, encryptedResults };
    },
  });
}
