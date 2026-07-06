"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { toHex, type Abi } from "viem";
import { sepolia } from "wagmi/chains";
import ReviewTestRegistryAbi from "@/lib/abis/ReviewTestRegistry.json";
import { getFhevmInstance } from "@/lib/fhe";
import { getCategoryOptions } from "@/lib/audit-enums";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TestConfiguratorProps {
  testId: number;
  testDefinition: {
    name: string;
    requiresScope?: boolean;
  };
  reviewRegistryAddress: `0x${string}`;
  onClose: () => void;
  onConfigured: () => void;
}

const USDC_DECIMALS = 6n;

function toTokenUnits(usdcAmount: string): bigint {
  const parsed = parseFloat(usdcAmount);
  if (isNaN(parsed) || parsed <= 0) throw new Error("Invalid amount");
  return BigInt(Math.round(parsed)) * 10n ** USDC_DECIMALS;
}

export function TestConfigurator({
  testId,
  testDefinition,
  reviewRegistryAddress,
  onClose,
  onConfigured,
}: TestConfiguratorProps) {
  const { address } = useAccount();
  const [threshold, setThreshold] = useState("");
  const [priority, setPriority] = useState<string>("2"); // 2 = Standard
  const [monitoringFrequency, setMonitoringFrequency] = useState("10");
  const [scope, setScope] = useState<string>("0"); // Default category 0
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [validationError, setValidationError] = useState("");

  const CATEGORY_OPTIONS = getCategoryOptions();

  const {
    writeContract,
    data: txHash,
    isPending: isWaitingForSignature,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
      chainId: sepolia.id,
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");
    reset();

    if (!address) {
      setValidationError("Wallet not connected.");
      return;
    }

    if (priority === "1" && parseInt(monitoringFrequency) <= 0) {
      setValidationError("Frequency must be greater than 0 for Monitoring priority.");
      return;
    }

    setIsEncrypting(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      const fhevm = await getFhevmInstance();
      const input = fhevm.createEncryptedInput(reviewRegistryAddress, address);
      input.add64(toTokenUnits(threshold));
      const encrypted = await input.encrypt();

      const encThreshold = toHex(encrypted.handles[0]) as `0x${string}`;
      const inputProof = toHex(encrypted.inputProof) as `0x${string}`;

      const finalScope = testDefinition.requiresScope ? parseInt(scope) : 0;
      const finalFrequency = priority === "1" ? parseInt(monitoringFrequency) : 0;

      writeContract({
        address: reviewRegistryAddress,
        abi: ReviewTestRegistryAbi as Abi,
        functionName: "createTest",
        args: [
          testId,
          finalScope,
          encThreshold,
          inputProof,
          parseInt(priority),
          finalFrequency,
        ],
        chainId: sepolia.id,
      });
    } catch (err) {
      console.error("FHE encryption error:", err);
      setValidationError(
        err instanceof Error ? err.message : "Encryption failed. Please retry."
      );
    } finally {
      setIsEncrypting(false);
    }
  };

  // Close when confirmed
  React.useEffect(() => {
    if (isConfirmed) {
      onConfigured();
    }
  }, [isConfirmed, onConfigured]);

  const isSubmitting = isEncrypting || isWaitingForSignature || isConfirming;
  const error = validationError || (writeError ? (writeError as Error).message?.slice(0, 160) : "");

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Configure {testDefinition.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <Label>Priority Level</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue placeholder="Select priority">
                  {priority === "1" ? "Monitoring (Periodic)" : priority === "2" ? "Standard (Every Payment)" : priority === "3" ? "Critical (High Severity)" : ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Monitoring (Periodic)</SelectItem>
                <SelectItem value="2">Standard (Every Payment)</SelectItem>
                <SelectItem value="3">Critical (High Severity)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {priority === "1" && (
            <div className="space-y-1.5">
              <Label>Monitoring Frequency</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Every</span>
                <Input
                  type="number"
                  required
                  min="1"
                  value={monitoringFrequency}
                  onChange={(e) => setMonitoringFrequency(e.target.value)}
                  className="pl-14 pr-20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">payments</span>
              </div>
            </div>
          )}

          {testDefinition.requiresScope && (
            <div className="space-y-1.5">
              <Label>GL Category Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category">
                    {CATEGORY_OPTIONS[parseInt(scope)]?.label || "Select category"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt, i) => (
                    <SelectItem key={opt.value} value={i.toString()}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[13px] text-muted-foreground">Only payments in this category will be tested.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Threshold (cUSDC)</Label>
            <div className="relative">
              <Input
                type="number"
                required
                min="1"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder=""
                className="pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">cUSDC</span>
            </div>
            <p className="text-[13px] text-muted-foreground">This value will be FHE encrypted before leaving your browser.</p>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="pt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isEncrypting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Encrypting…</>
              ) : isWaitingForSignature ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming…</>
              ) : isConfirming ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              ) : (
                "Save Configuration"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
