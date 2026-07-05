"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { getAddress, isAddress, type Abi } from "viem";
import { Loader2, Trash2, Info, ExternalLink, History } from "lucide-react";
import { toast } from "sonner";

import AuditRegistryAbi from "@/lib/abis/AuditRegistry.json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export enum AuditorAccess {
  NONE = 0,
  SIGNAL = 1,
  ANALYTICS = 2,
  FULL = 3,
}

type AuditorRecord = {
  address: `0x${string}`;
  access: AuditorAccess;
};

type PendingAction =
  | { type: "grant"; address: `0x${string}` }
  | { type: "revoke"; address: `0x${string}` }
  | { type: "history"; address: `0x${string}` }
  | null;

interface AuditorManagementProps {
  auditRegistryAddress?: `0x${string}`;
}

const MAX_AUDITORS = 5;
const auditRegistryAbi = AuditRegistryAbi as Abi;

function mapAccessStringToEnum(value: string): AuditorAccess {
  switch (value) {
    case "signal":
      return AuditorAccess.SIGNAL;
    case "analytics":
      return AuditorAccess.ANALYTICS;
    case "full":
      return AuditorAccess.FULL;
    default:
      return AuditorAccess.SIGNAL;
  }
}

function normalizeAccess(value: unknown): AuditorAccess {
  if (Array.isArray(value) && value.length > 0) {
    const access = Number(value[0]);
    return access in AuditorAccess ? access : AuditorAccess.NONE;
  }
  return AuditorAccess.NONE;
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AuditorManagement({ auditRegistryAddress }: AuditorManagementProps) {
  const { address: walletAddress } = useAccount();
  const [newAddress, setNewAddress] = useState("");
  const [newAccess, setNewAccess] = useState("signal");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [auditorToRevoke, setAuditorToRevoke] = useState<string | null>(null);
  
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [auditorForHistory, setAuditorForHistory] = useState<string | null>(null);
  const [historyType, setHistoryType] = useState<"all" | "recent">("all");
  const [recentCount, setRecentCount] = useState("50");

  const hasRegistry = Boolean(auditRegistryAddress);

  const {
    data: ownerAddress,
    refetch: refetchOwner,
  } = useReadContract({
    address: auditRegistryAddress,
    abi: auditRegistryAbi,
    functionName: "owner",
    chainId: sepolia.id,
    query: {
      enabled: hasRegistry,
    },
  });

  const {
    data: auditorAddresses,
    isLoading: isLoadingAuditors,
    refetch: refetchAuditors,
  } = useReadContract({
    address: auditRegistryAddress,
    abi: auditRegistryAbi,
    functionName: "getAuditors",
    chainId: sepolia.id,
    query: {
      enabled: hasRegistry,
    },
  });

  const {
    data: paymentCountData,
  } = useReadContract({
    address: auditRegistryAddress,
    abi: auditRegistryAbi,
    functionName: "paymentCount",
    chainId: sepolia.id,
    query: {
      enabled: hasRegistry,
    },
  });

  const paymentCount = Number(paymentCountData ?? 0);

  const addresses = useMemo(
    () => ((auditorAddresses as `0x${string}`[] | undefined) ?? []),
    [auditorAddresses],
  );

  const {
    data: accessResults,
    refetch: refetchAccess,
  } = useReadContracts({
    contracts: addresses.map((auditor) => ({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "auditorProfile",
      args: [auditor],
      chainId: sepolia.id,
    })),
    query: {
      enabled: hasRegistry && addresses.length > 0,
    },
  });

  const accessByAddress = useMemo<Record<string, AuditorAccess>>(() => {
    return Object.fromEntries(
      addresses.map((auditor, index) => {
        const result = accessResults?.[index];
        const access = result?.status === "success" ? normalizeAccess(result.result) : AuditorAccess.NONE;
        return [auditor.toLowerCase(), access] as const;
      }),
    );
  }, [accessResults, addresses]);

  const auditors = useMemo<AuditorRecord[]>(
    () =>
      addresses
        .map((address) => ({
          address,
          access: accessByAddress[address.toLowerCase()] ?? AuditorAccess.NONE,
        }))
        .filter((auditor) => auditor.access !== AuditorAccess.NONE),
    [accessByAddress, addresses],
  );

  const {
    writeContract,
    data: txHash,
    isPending: isWaitingForSignature,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: sepolia.id,
  });

  useEffect(() => {
    if (!isConfirmed || !pendingAction) return;

    toast.success(
      pendingAction.type === "grant"
        ? "Auditor access granted"
        : pendingAction.type === "revoke" 
        ? "Auditor access revoked"
        : "Historical access granted"
    );

    refetchAuditors();
    refetchOwner();
    refetchAccess();

    const timer = setTimeout(() => {
      if (pendingAction.type === "grant") {
        setNewAddress("");
        setNewAccess("signal");
      }

      setPendingAction(null);
    }, 0);

    return () => clearTimeout(timer);
  }, [isConfirmed, pendingAction, refetchAccess, refetchAuditors, refetchOwner]);

  const isOwner =
    typeof ownerAddress === "string" &&
    typeof walletAddress === "string" &&
    ownerAddress.toLowerCase() === walletAddress.toLowerCase();

  const isSubmitting = isWaitingForSignature || isConfirming;
  const activeSlots = auditors.length;
  const isAtCapacity = activeSlots >= MAX_AUDITORS;
  const formDisabled = !hasRegistry || !isOwner || isSubmitting || isAtCapacity;
  const error = writeError || receiptError;

  const handleAddAuditor = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!auditRegistryAddress) {
      toast.error("Audit registry address is not available");
      return;
    }

    if (!isOwner) {
      toast.error("Only the registry owner can grant auditor access");
      return;
    }

    if (!isAddress(newAddress)) {
      toast.error("Invalid Ethereum address");
      return;
    }

    const checksumAddress = getAddress(newAddress) as `0x${string}`;

    if (auditors.some((auditor) => auditor.address.toLowerCase() === checksumAddress.toLowerCase())) {
      toast.error("Auditor already exists in roster");
      return;
    }

    if (isAtCapacity) {
      toast.error(`Maximum of ${MAX_AUDITORS} auditors allowed`);
      return;
    }

    setGrantDialogOpen(true);
  };

  const confirmGrantAccess = () => {
    if (!auditRegistryAddress) return;
    const checksumAddress = getAddress(newAddress) as `0x${string}`;
    reset();
    setPendingAction({ type: "grant", address: checksumAddress });
    // Generate a random 32-bit integer for the engagement ID (1 to 4,294,967,295)
    const generatedEngagementId = Math.floor(Math.random() * 4294967295) + 1;

    writeContract({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "setAuditorAccess",
      args: [checksumAddress, mapAccessStringToEnum(newAccess), generatedEngagementId],
      chainId: sepolia.id,
    });
    setGrantDialogOpen(false);
  };

  const handleRevokeClick = (address: `0x${string}`) => {
    if (!auditRegistryAddress) {
      toast.error("Audit registry address is not available");
      return;
    }

    if (!isOwner) {
      toast.error("Only the registry owner can revoke auditor access");
      return;
    }
    
    setAuditorToRevoke(address);
    setRevokeDialogOpen(true);
  };

  const confirmRevokeAccess = () => {
    if (!auditorToRevoke || !auditRegistryAddress) return;
    
    reset();
    setPendingAction({ type: "revoke", address: auditorToRevoke as `0x${string}` });
    writeContract({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "setAuditorAccess",
      args: [auditorToRevoke, AuditorAccess.NONE, 0], // 0 engagement ID for revoked
      chainId: sepolia.id,
    });
    setRevokeDialogOpen(false);
    setAuditorToRevoke(null);
  };

  const handleHistoryClick = (address: `0x${string}`) => {
    if (!auditRegistryAddress) {
      toast.error("Audit registry address is not available");
      return;
    }

    if (!isOwner) {
      toast.error("Only the registry owner can grant historical access");
      return;
    }

    if (paymentCount === 0) {
      toast.error("No historical payments exist yet");
      return;
    }
    
    setAuditorForHistory(address);
    setHistoryDialogOpen(true);
  };

  const confirmHistoryAccess = () => {
    if (!auditorForHistory || !auditRegistryAddress) return;
    
    let paymentIds: bigint[] = [];
    
    if (historyType === "all") {
      paymentIds = Array.from({ length: paymentCount }, (_, i) => BigInt(i));
    } else {
      const count = Math.min(Number(recentCount) || 0, paymentCount);
      if (count <= 0) {
        toast.error("Please enter a valid number of recent payments");
        return;
      }
      const startIdx = paymentCount - count;
      paymentIds = Array.from({ length: count }, (_, i) => BigInt(startIdx + i));
    }
    
    reset();
    setPendingAction({ type: "history", address: auditorForHistory as `0x${string}` });
    writeContract({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "grantHistoricalAccess",
      args: [auditorForHistory, paymentIds],
      chainId: sepolia.id,
    });
    setHistoryDialogOpen(false);
    setAuditorForHistory(null);
  };

  const getAccessBadge = (access: AuditorAccess) => {
    switch (access) {
      case AuditorAccess.SIGNAL:
        return <Badge variant="secondary">Signal</Badge>;
      case AuditorAccess.ANALYTICS:
        return <Badge variant="secondary">Analytics</Badge>;
      case AuditorAccess.FULL:
        return <Badge variant="secondary">Full Access</Badge>;
      default:
        return <Badge variant="outline">Revoked</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Grant Access</CardTitle>
          <CardDescription>Authorize a new auditor to review your encrypted records.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddAuditor} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <div className="space-y-2">
                <Label htmlFor="auditor-address">Ethereum Address</Label>
                <Input
                  id="auditor-address"
                  placeholder="0x..."
                  value={newAddress}
                  onChange={(event) => setNewAddress(event.target.value)}
                  className="font-mono"
                  disabled={formDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="access-tier">Access Tier</Label>
                <Select
                  value={newAccess}
                  onValueChange={(value) => value && setNewAccess(value)}
                  disabled={formDisabled}
                >
                  <SelectTrigger id="access-tier">
                    <SelectValue placeholder="Select tier..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="analytics">Analytics</SelectItem>
                    <SelectItem value="full">Full Access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {txHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-primary hover:underline font-mono"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {(error as Error).message?.slice(0, 180) ?? "Transaction failed. Please retry."}
              </p>
            )}

            {!hasRegistry && (
              <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Deploy and configure your AuditRegistry before managing auditors.
              </p>
            )}

            {hasRegistry && !isOwner && (
              <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Connected wallet is not the registry owner, so auditor permissions are read-only.
              </p>
            )}

            <div className="pt-2">
              <Button type="submit" disabled={formDisabled}>
                {isSubmitting && pendingAction?.type === "grant" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isWaitingForSignature ? "Waiting for Signature..." : "Confirming Access..."}
                  </>
                ) : (
                  "Grant Access"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="mt-4 border-t border-border bg-muted/30">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
            <div className="space-y-1">
              <p><strong>Analytics:</strong> Can view encrypted GL category rollups, recipient totals, and audit findings.</p>
              <p><strong>Full Access:</strong> Can read individual payment handles, run decryptions, and access evidence metadata.</p>
            </div>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Auditor Roster</CardTitle>
              <CardDescription>Manage external audit firms and their data access levels.</CardDescription>
            </div>
            <div className="rounded-full border border-border bg-muted/30 px-3 py-1 text-sm text-muted-foreground">
              {activeSlots} / {MAX_AUDITORS} Slots Used
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingAuditors ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading auditors...
            </div>
          ) : auditors.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
              No auditors have been granted access yet.
            </div>
          ) : (
            <div className="space-y-4">
              {auditors.map((auditor) => {
                const isRevoking =
                  isSubmitting &&
                  pendingAction?.type === "revoke" &&
                  pendingAction.address.toLowerCase() === auditor.address.toLowerCase();

                return (
                  <div
                    key={auditor.address}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="truncate font-mono text-sm font-medium" title={auditor.address}>
                        <span className="sm:hidden">{formatAddress(auditor.address)}</span>
                        <span className="hidden sm:inline">{auditor.address}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Active Auditor</div>
                    </div>
                    <div className="flex items-center gap-4">
                      {getAccessBadge(auditor.access)}
                      <div className="flex items-center justify-end gap-2">
                        {auditor.access === AuditorAccess.FULL && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => handleHistoryClick(auditor.address)}
                          >
                            <History className="mr-2 h-3.5 w-3.5" />
                            History
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8"
                          onClick={() => handleRevokeClick(auditor.address)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Revoke
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will grant {newAccess} access to {newAddress}. They will be able to see the data permitted under this tier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmGrantAccess}>Grant Access</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokeDialogOpen} onOpenChange={(open) => {
        setRevokeDialogOpen(open);
        if (!open) setAuditorToRevoke(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will revoke all access for {auditorToRevoke}. They will no longer be able to read any encrypted data or access analytics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevokeAccess} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* History Dialog */}
      <AlertDialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grant Historical Access</AlertDialogTitle>
            <AlertDialogDescription>
              Grant {auditorForHistory ? formatAddress(auditorForHistory) : ""} access to past payments. 
              The registry currently has {paymentCount} recorded payments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center space-x-2">
                <input 
                  type="radio" 
                  id="history-all" 
                  checked={historyType === "all"} 
                  onChange={() => setHistoryType("all")} 
                  className="mt-1"
                />
                <Label htmlFor="history-all" className="font-normal cursor-pointer">
                  All {paymentCount} payments
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input 
                  type="radio" 
                  id="history-recent" 
                  checked={historyType === "recent"} 
                  onChange={() => setHistoryType("recent")} 
                  className="mt-1"
                />
                <Label htmlFor="history-recent" className="font-normal cursor-pointer flex items-center gap-2">
                  Last 
                  <Input 
                    type="number" 
                    value={recentCount} 
                    onChange={(e) => setRecentCount(e.target.value)} 
                    disabled={historyType !== "recent"}
                    className="w-20 h-8"
                    min="1"
                    max={paymentCount.toString()}
                  /> 
                  payments
                </Label>
              </div>
            </div>
            
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground mt-4 flex gap-3">
              <Info className="h-5 w-5 shrink-0" />
              <p>
                Granting access to large numbers of payments at once will consume more gas. 
                Consider granting access in batches if the transaction fails.
              </p>
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setHistoryDialogOpen(false);
              setAuditorForHistory(null);
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmHistoryAccess}>
              Grant Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
