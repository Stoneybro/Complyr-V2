"use client";

import { ThresholdEditor } from "./ThresholdEditor";
import { ApproverManagement } from "./ApproverManagement";

interface SettingsViewProps {
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}

export function SettingsView({ auditRegistryAddress, walletAddress }: SettingsViewProps) {
  return (
    <div className="max-w-3xl space-y-8 pb-10">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Authorization Thresholds</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define the USD amounts that trigger higher-level approval requirements.
        </p>
        <div className="mt-4">
          <ThresholdEditor
            auditRegistryAddress={auditRegistryAddress}
            walletAddress={walletAddress}
          />
        </div>
      </div>

      <div className="border-t border-border pt-8">
        <h2 className="text-xl font-semibold tracking-tight">Approver Management</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage authorized approvers and their designated tiers. Tiers are optional and only used for authorization breach checks.
        </p>
        <div className="mt-4">
          <ApproverManagement auditRegistryAddress={auditRegistryAddress} />
        </div>
      </div>
    </div>
  );
}
