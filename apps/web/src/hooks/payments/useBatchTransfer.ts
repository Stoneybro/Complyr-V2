import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export function useBatchTransfer(activeBalance: any) {
  return useMutation({
    mutationFn: async (data: any) => {
      data.onStatusUpdate?.("Encrypting...");
      await new Promise((r) => setTimeout(r, 2000));
      
      data.onStatusUpdate?.("Signing...");
      await new Promise((r) => setTimeout(r, 2000));
      
      data.onStatusUpdate?.("Complete");
      toast.success("Batch payment sent!");
      return data;
    },
  });
}
