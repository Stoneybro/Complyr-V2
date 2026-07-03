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
            <div className="flex flex-row items-start justify-between gap-4 mb-6">
                <div className="flex flex-col gap-1">
                    <h2 className="text-2xl font-semibold tracking-tight">Auditor Management</h2>
                    <p className="text-sm text-muted-foreground">Manage your external human auditors and configure their data access levels.</p>
                </div>
                {businessAddress && (
                    <Link href={`/auditors/${businessAddress}`} target="_blank" passHref>
                        <Button variant="outline">
                            Go to Auditor Portal
                            <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                )}
            </div>
            
            <AuditorManagement auditRegistryAddress={auditRegistryAddress} />
        </div>
    );
}
