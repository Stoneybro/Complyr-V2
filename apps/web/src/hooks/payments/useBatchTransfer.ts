import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export function useBatchTransfer(activeBalance: any) {
  return useMutation({
    mutationFn: async (data: any) => {
      data.onStatusUpdate?.("Encrypting...");
      
      const { recipients, amounts, audit } = data;
      
      // 1. Encrypt all inputs in parallel
      const encryptPromises = amounts.map(async (amount: string, index: number) => {
        // Here we pass the specific recipient's audit data if it exists, or undefined
        const recipientAudit = audit ? {
          jurisdictionCode: audit.jurisdictionCodes?.[index],
          purposeCode: audit.purposeCodes?.[index],
          referenceId: audit.referenceIds?.[index],
          riskTier: audit.riskTiers?.[index],
          counterpartyType: audit.counterpartyTypes?.[index],
        } : undefined;

        const res = await fetch("/api/fhe/encrypt-input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, audit: recipientAudit }),
        });
        
        if (!res.ok) throw new Error("Encryption failed for a recipient");
        return res.json();
      });
      
      const encryptedResults = await Promise.all(encryptPromises);
      
      data.onStatusUpdate?.("Signing...");
      
      // 2. Submit transactions sequentially
      // In a real app, you would loop over the array and call `writeContractAsync`
      for (let i = 0; i < recipients.length; i++) {
        // const { encryptedAmount, inputProof } = encryptedResults[i];
        // await writeContractAsync({ ... });
        
        // Simulate delay per transaction
        await new Promise((r) => setTimeout(r, 1000));
      }
      
      data.onStatusUpdate?.("Complete");
      toast.success(`Batch payment to ${recipients.length} recipients sent!`);
      return { ...data, encryptedResults };
    },
  });
}
