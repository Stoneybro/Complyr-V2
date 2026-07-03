"use client";

import React from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { FileSearchCorner } from "lucide-react";

interface FindingsProps {
  reviewRegistryAddress: `0x${string}`;
  accessLevel: number;
}

export function Findings({ reviewRegistryAddress, accessLevel }: FindingsProps) {
  return (
    <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
        <div className="flex flex-col gap-1 mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">Findings Queue</h2>
            <p className="text-sm text-muted-foreground">Review flagged payment records and investigate potential violations.</p>
        </div>
        
        <EmptyState
            icon={<FileSearchCorner className="h-5 w-5" />}
            title="No findings yet"
            description="When a payment triggers one of your tests, it will appear here."
        />
    </div>
  );
}
