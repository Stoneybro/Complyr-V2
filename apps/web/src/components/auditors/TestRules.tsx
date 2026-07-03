"use client";

import React from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilter } from "lucide-react";

interface TestRulesProps {
  reviewRegistryAddress: `0x${string}`;
  accessLevel: number;
}

export function TestRules({ reviewRegistryAddress, accessLevel }: TestRulesProps) {
  return (
    <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
        <div className="flex flex-col gap-1 mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">Test Rules</h2>
            <p className="text-sm text-muted-foreground">Configure your encrypted audit thresholds and rules.</p>
        </div>
        
        <EmptyState
            icon={<ListFilter className="h-5 w-5" />}
            title="No tests configured"
            description="You have not configured any audit tests for this business yet."
        />
    </div>
  );
}
