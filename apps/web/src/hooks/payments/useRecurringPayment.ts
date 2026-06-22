import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export function useRecurringPayment() {
  return useMutation({
    mutationFn: async (data: any) => {
      data.onStatusUpdate?.("Encrypting...");
      await new Promise((r) => setTimeout(r, 2000));
      
      data.onStatusUpdate?.("Signing...");
      await new Promise((r) => setTimeout(r, 2000));
      
      data.onStatusUpdate?.("Complete");
      toast.success("Recurring payment scheduled!");
      return data;
    },
  });
}
