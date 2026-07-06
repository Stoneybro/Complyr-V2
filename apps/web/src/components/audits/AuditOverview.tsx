"use client";

import React from "react";
import { AuditorManagement } from "./AuditorManagement";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface AuditOverviewProps {
  auditRegistryAddress?: `0x${string}`;
  businessAddress?: string;
}

export function AuditOverview({ auditRegistryAddress, businessAddress }: AuditOverviewProps) {
    return (
        <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
            <div className="flex flex-col gap-1 mb-6">
                <h2 className="text-2xl font-semibold tracking-tight">Auditor Management</h2>
                <p className="text-sm text-muted-foreground">Manage your external human auditors and configure their data access levels.</p>
            </div>
            
            <AuditorManagement auditRegistryAddress={auditRegistryAddress} businessAddress={businessAddress} />
        </div>
    );
}
