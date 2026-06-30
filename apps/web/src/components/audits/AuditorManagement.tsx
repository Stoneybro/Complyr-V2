"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Enum matching the smart contract AuditorAccess
export enum AuditorAccess {
    NONE = 0,
    SIGNAL = 1,
    ANALYTICS = 2,
    FULL = 3
}

type AuditorRecord = {
    address: string;
    access: AuditorAccess;
};

// Mock initial data
const MOCK_AUDITORS: AuditorRecord[] = [
    { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", access: AuditorAccess.FULL },
    { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", access: AuditorAccess.SIGNAL },
];

export function AuditorManagement() {
    const [auditors, setAuditors] = useState<AuditorRecord[]>(MOCK_AUDITORS);
    const [newAddress, setNewAddress] = useState("");
    const [newAccess, setNewAccess] = useState<string>("signal");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const maxAuditors = 5;

    const mapAccessStringToEnum = (val: string): AuditorAccess => {
        switch (val) {
            case "signal": return AuditorAccess.SIGNAL;
            case "analytics": return AuditorAccess.ANALYTICS;
            case "full": return AuditorAccess.FULL;
            default: return AuditorAccess.SIGNAL;
        }
    };

    const handleAddAuditor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!/^0x[a-fA-F0-9]{40}$/.test(newAddress)) {
            toast.error("Invalid Ethereum address");
            return;
        }
        if (auditors.some(a => a.address.toLowerCase() === newAddress.toLowerCase())) {
            toast.error("Auditor already exists in roster");
            return;
        }
        if (auditors.length >= maxAuditors) {
            toast.error(`Maximum of ${maxAuditors} auditors allowed`);
            return;
        }

        setIsSubmitting(true);
        // Simulate wagmi writeContract
        setTimeout(() => {
            setAuditors([...auditors, { address: newAddress, access: mapAccessStringToEnum(newAccess) }]);
            setNewAddress("");
            setNewAccess("signal");
            setIsSubmitting(false);
            toast.success("Auditor added successfully");
        }, 1000);
    };

    const handleRevoke = async (address: string) => {
        // Simulate wagmi writeContract for AuditorAccess.NONE
        setAuditors(auditors.filter(a => a.address !== address));
        toast.success("Auditor access revoked");
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
                return null;
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
                        <div className="grid sm:grid-cols-[1fr_200px] gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="auditor-address">Ethereum Address</Label>
                                <Input
                                    id="auditor-address"
                                    placeholder="0x..."
                                    value={newAddress}
                                    onChange={(e) => setNewAddress(e.target.value)}
                                    className="font-mono"
                                    disabled={auditors.length >= maxAuditors}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="access-tier">Access Tier</Label>
                                <Select value={newAccess} onValueChange={(v) => v && setNewAccess(v)} disabled={auditors.length >= maxAuditors}>
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
                        
                        <div className="pt-2">
                            <Button type="submit" disabled={isSubmitting || auditors.length >= maxAuditors}>
                                {isSubmitting ? "Granting Access..." : "Grant Access"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
                <CardFooter className="bg-muted/30 border-t border-border mt-4">
                    <div className="flex items-start gap-3 text-sm text-muted-foreground">
                        <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary/70" />
                        <div className="space-y-1">
                            <p><strong>Signal:</strong> Receives notifications of findings (severity + test type), but cannot view raw payment handles.</p>
                            <p><strong>Analytics:</strong> Can view encrypted GL category rollups and run anomaly detection across aggregated data.</p>
                            <p><strong>Full Access:</strong> Can decrypt and view all payment handles and invoice evidence.</p>
                        </div>
                    </div>
                </CardFooter>
            </Card>
            
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Auditor Roster</CardTitle>
                            <CardDescription>Manage external audit firms and their data access levels.</CardDescription>
                        </div>
                        <div className="text-sm text-muted-foreground bg-muted/30 px-3 py-1 rounded-full border border-border">
                            {auditors.length} / {maxAuditors} Slots Used
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {auditors.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                            No auditors have been granted access yet.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {auditors.map((auditor) => (
                                <div key={auditor.address} className="flex items-center justify-between p-4 rounded-xl border border-border bg-background shadow-sm">
                                    <div className="space-y-1">
                                        <div className="font-mono text-sm font-medium">{auditor.address}</div>
                                        <div className="text-xs text-muted-foreground">Active Auditor</div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {getAccessBadge(auditor.access)}
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleRevoke(auditor.address)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
