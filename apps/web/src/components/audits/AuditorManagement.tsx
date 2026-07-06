"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { getAddress, isAddress, type Abi } from "viem";
import { Loader2, Trash2, Info, ExternalLink, History, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { Field, FieldLabel, FieldGroup, FieldDescription } from "@/components/ui/field";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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
  businessAddress?: string;
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

export function AuditorManagement({ auditRegistryAddress, businessAddress }: AuditorManagementProps) {
  const { address: walletAddress } = useAccount();
  const [newAddress, setNewAddress] = useState("");
  const [newAccess, setNewAccess] = useState("analytics");
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

  const hasToasted = useRef(false);

  useEffect(() => {
    if (!isConfirmed) {
      hasToasted.current = false;
      return;
    }
    if (!pendingAction || hasToasted.current) return;

    hasToasted.current = true;

    toast.success(
      pendingAction.type === "grant"
        ? "Auditor access granted"
        : pendingAction.type === "revoke" 
        ? "Auditor access revoked"
        : "Historical access granted",
      {
        action: txHash ? {
          label: "View Tx",
          onClick: () => window.open(`https://sepolia.etherscan.io/tx/${txHash}`, "_blank"),
        } : undefined,
      }
    );

    refetchAuditors();
    refetchOwner();
    refetchAccess();

    const timer = setTimeout(() => {
      if (pendingAction.type === "grant") {
        setNewAddress("");
        setNewAccess("analytics");
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
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Grant Auditor Access</CardTitle>
            <CardDescription>Authorize a new external auditor to review your encrypted records.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddAuditor} className="space-y-6">
              <FieldGroup className="grid gap-6 sm:grid-cols-[1fr_200px]">
                <Field>
                  <FieldLabel htmlFor="auditor-address">Ethereum Address</FieldLabel>
                  <Input
                    id="auditor-address"
                    placeholder="0x..."
                    value={newAddress}
                    onChange={(event) => setNewAddress(event.target.value)}
                    className="font-mono"
                    disabled={formDisabled}
                  />
                  <FieldDescription>The auditor's wallet address.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="access-tier">Access Tier</FieldLabel>
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
                  <FieldDescription>Level of encrypted access.</FieldDescription>
                </Field>
              </FieldGroup>


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

                const Container = businessAddress ? Link : "div";
                const containerProps = businessAddress
                  ? { href: `/auditors/${businessAddress}?auditor=${auditor.address}`, target: "_blank", rel: "noopener noreferrer" }
                  : {};

                return (
                  <Container
                    key={auditor.address}
                    {...containerProps}
                    className="group flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 truncate font-mono text-sm font-medium" title={auditor.address}>
                          <span className="sm:hidden">{formatAddress(auditor.address)}</span>
                          <span className="hidden sm:inline">{auditor.address}</span>
                          {businessAddress && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </div>
                        <div className="text-xs text-muted-foreground">Active Auditor</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {getAccessBadge(auditor.access)}
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.preventDefault()}>
                        {auditor.access === AuditorAccess.FULL && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={(e) => { e.preventDefault(); handleHistoryClick(auditor.address); }}
                              >
                                <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                                Share Past Records
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Grant access to past encrypted payments</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => { e.preventDefault(); handleRevokeClick(auditor.address); }}
                              disabled={isRevoking}
                            >
                              {isRevoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Revoke auditor access</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </Container>
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
            <AlertDialogTitle>Share Historical Records</AlertDialogTitle>
            <AlertDialogDescription>
              This auditor currently only has access to future payments. You can selectively decrypt and share your past payment history with them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <label 
                className={`relative flex cursor-pointer flex-col rounded-lg border p-4 shadow-sm focus-within:ring-2 focus-within:ring-ring ${historyType === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">All Past Records</div>
                  <input 
                    type="radio" 
                    name="history-type"
                    value="all"
                    checked={historyType === "all"} 
                    onChange={() => setHistoryType("all")} 
                    className="sr-only"
                  />
                  {historyType === "all" && <div className="h-4 w-4 rounded-full border-4 border-primary" />}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Share all {paymentCount} existing payments.
                </div>
              </label>

              <label 
                className={`relative flex cursor-pointer flex-col rounded-lg border p-4 shadow-sm focus-within:ring-2 focus-within:ring-ring ${historyType === "recent" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Recent Records</div>
                  <input 
                    type="radio" 
                    name="history-type"
                    value="recent"
                    checked={historyType === "recent"} 
                    onChange={() => setHistoryType("recent")} 
                    className="sr-only"
                  />
                  {historyType === "recent" && <div className="h-4 w-4 rounded-full border-4 border-primary" />}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Share the last 
                  <Input 
                    type="number" 
                    value={recentCount} 
                    onChange={(e) => {
                      setRecentCount(e.target.value);
                      setHistoryType("recent");
                    }} 
                    onClick={() => setHistoryType("recent")}
                    className="w-20 h-8 bg-background"
                    min="1"
                    max={paymentCount.toString()}
                  /> 
                  payments.
                </div>
              </label>
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
    </TooltipProvider>
  );
}
