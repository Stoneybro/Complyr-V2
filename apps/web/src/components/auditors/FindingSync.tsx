"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useFindingsPuller,
  type PullOutcome,
  type PullStatus,
} from "@/hooks/useFindingsPuller";

interface FindingSyncProps {
  auditRegistryAddress: `0x${string}`;
  reviewRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  deployedAtBlock: bigint;
}

const BUSY_STATUSES: PullStatus[] = ["syncing", "awaiting-signature"];

/**
 * Standalone pull control for the Findings header. Sync status is reported
 * via toasts (sonner) — only manual pulls notify, the background timer
 * stays silent.
 */
export function FindingSync({
  auditRegistryAddress,
  reviewRegistryAddress,
  walletAddress,
  deployedAtBlock,
}: FindingSyncProps) {
  const { status, pendingCount, lastError, pullNow } = useFindingsPuller({
    auditRegistryAddress,
    reviewRegistryAddress,
    walletAddress,
    deployedAtBlock,
  });

  const [isPulling, setIsPulling] = useState(false);

  const handlePull = async () => {
    // Spin immediately — the hook's status only flips to "syncing" after
    // the (potentially slow) log-fetch phase.
    setIsPulling(true);
    try {
      const outcome: PullOutcome | null = await pullNow();
      if (!outcome) return;
      if (!outcome.ok) {
        toast.error("Finding sync failed", {
          description: lastError ?? undefined,
        });
      } else if (outcome.upToDate) {
        toast("Findings up to date", {
          description:
            "If a payment was made recently, give it a few seconds to process, then try again.",
        });
      } else {
        toast("Some results are still processing", {
          description:
            "Pull again in a few seconds to record the remaining findings.",
        });
      }
    } finally {
      setIsPulling(false);
    }
  };

  const isBusy = BUSY_STATUSES.includes(status) || isPulling;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {pendingCount > 0 && (
        <Badge
          variant="outline"
          className="h-8 gap-1.5 rounded-md border-input px-3 text-xs font-normal text-muted-foreground"
        >
          <RefreshCw className="size-3 animate-spin" />
          {pendingCount} pending
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={isBusy}
        onClick={() => void handlePull()}
      >
        <RefreshCw
          data-icon="inline-start"
          className={isBusy ? "animate-spin" : undefined}
        />
        Get finding
      </Button>
    </div>
  );
}
