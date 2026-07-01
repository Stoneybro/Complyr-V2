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
import { Loader2, Trash2, Info, ExternalLink } from "lucide-react";
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
  const access = Number(value);
  return access in AuditorAccess ? access : AuditorAccess.NONE;
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AuditorManagement({ auditRegistryAddress }: AuditorManagementProps) {
  const { address: walletAddress } = useAccount();
  const [newAddress, setNewAddress] = useState("");
  const [newAccess, setNewAccess] = useState("signal");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

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
      functionName: "auditorAccess",
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
        : "Auditor access revoked",
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

    reset();
    setPendingAction({ type: "grant", address: checksumAddress });
    writeContract({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "setAuditorAccess",
      args: [checksumAddress, mapAccessStringToEnum(newAccess)],
      chainId: sepolia.id,
    });
  };

  const handleRevoke = (address: `0x${string}`) => {
    if (!auditRegistryAddress) {
      toast.error("Audit registry address is not available");
      return;
    }

    if (!isOwner) {
      toast.error("Only the registry owner can revoke auditor access");
      return;
    }

    reset();
    setPendingAction({ type: "revoke", address });
    writeContract({
      address: auditRegistryAddress,
      abi: auditRegistryAbi,
      functionName: "setAuditorAccess",
      args: [address, AuditorAccess.NONE],
      chainId: sepolia.id,
    });
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
                    <SelectItem value="signal">Signal</SelectItem>
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
              <p><strong>Signal:</strong> Receives findings metadata, but cannot view raw payment handles.</p>
              <p><strong>Analytics:</strong> Can view encrypted GL category rollups and aggregated data.</p>
              <p><strong>Full Access:</strong> Can read payment handles, analytics, and evidence metadata.</p>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRevoke(auditor.address)}
                        disabled={!isOwner || isSubmitting}
                        aria-label={`Revoke ${auditor.address}`}
                      >
                        {isRevoking ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
