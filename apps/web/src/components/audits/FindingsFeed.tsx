"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ShieldCheck, AlertCircle, AlertTriangle, AlertOctagon, Link as LinkIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MockAuditRegistryAddress } from "@/lib/CA";

type FindingRecord = {
    id: string;
    paymentId: string;
    severity: number;
    testType: string;
    blockNumber: string;
};

// Mock data to demonstrate UI
const MOCK_FINDINGS: FindingRecord[] = [
    { id: "1", paymentId: "42", severity: 2, testType: "DUPLICATE_INVOICE", blockNumber: "18294021" },
    { id: "2", paymentId: "89", severity: 3, testType: "SEGREGATION_OF_DUTIES", blockNumber: "18301140" },
];

export function FindingsFeed() {
    const findings = MOCK_FINDINGS;

    const getSeverityIcon = (severity: number) => {
        switch (severity) {
            case 1:
                return <AlertCircle className="h-4 w-4 text-blue-500" />;
            case 2:
                return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            case 3:
                return <AlertOctagon className="h-4 w-4 text-destructive" />;
            default:
                return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const getSeverityText = (severity: number) => {
        switch (severity) {
            case 1: return "Low";
            case 2: return "Medium";
            case 3: return "High";
            default: return "Unknown";
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Registry Status</CardTitle>
                    <CardDescription>Onchain configuration and deployed contract addresses.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between p-4 rounded-xl border border-border bg-muted/20">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Audit Registry Contract</p>
                            <p className="text-xs text-muted-foreground font-mono">{MockAuditRegistryAddress}</p>
                        </div>
                        <div className="mt-2 sm:mt-0 flex items-center">
                            <a href={`https://explorer.example.com/address/${MockAuditRegistryAddress}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                                View on Explorer <LinkIcon className="h-3 w-3" />
                            </a>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl border border-border">
                            <p className="text-xs text-muted-foreground mb-1">Delegation of Authority</p>
                            <p className="text-sm font-medium text-emerald-500 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Configured</p>
                        </div>
                        <div className="p-4 rounded-xl border border-border">
                            <p className="text-xs text-muted-foreground mb-1">Total Payments</p>
                            <p className="text-sm font-medium">1,204</p>
                        </div>
                        <div className="p-4 rounded-xl border border-border">
                            <p className="text-xs text-muted-foreground mb-1">Total Findings</p>
                            <p className="text-sm font-medium">{findings.length}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Findings Feed</CardTitle>
                    <CardDescription>Anomalies and rules triggered by the Review Test Registry.</CardDescription>
                </CardHeader>
                <CardContent>
                    {findings.length === 0 ? (
                        <EmptyState 
                            icon={<ShieldCheck className="h-5 w-5" />}
                            title="No findings detected"
                            description="All your onchain payments conform to the internal control policies."
                        />
                    ) : (
                        <div className="border border-border rounded-xl overflow-hidden">
                            <div className="grid grid-cols-4 bg-muted/50 p-3 text-xs font-medium text-muted-foreground border-b border-border">
                                <div>Severity</div>
                                <div>Test Type</div>
                                <div>Payment ID</div>
                                <div>Block</div>
                            </div>
                            <div className="divide-y divide-border">
                                {findings.map(finding => (
                                    <div key={finding.id} className="grid grid-cols-4 p-4 text-sm items-center bg-background hover:bg-muted/10 transition-colors">
                                        <div className="flex items-center gap-2 font-medium">
                                            {getSeverityIcon(finding.severity)}
                                            {getSeverityText(finding.severity)}
                                        </div>
                                        <div className="font-mono text-xs">{finding.testType}</div>
                                        <div className="text-muted-foreground">#{finding.paymentId}</div>
                                        <div className="text-muted-foreground text-xs">{finding.blockNumber}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="bg-muted/30 border-t border-border mt-4">
                    <p className="text-xs text-muted-foreground">Findings are permanently recorded onchain. They cannot be deleted by the business.</p>
                </CardFooter>
            </Card>
        </div>
    );
}
