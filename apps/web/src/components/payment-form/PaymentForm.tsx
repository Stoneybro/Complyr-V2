"use client";

import React, { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Info, FileText } from "lucide-react";
import { useSingleTransfer } from "@/hooks/payments/useSingleTransfer";
import { useBatchTransfer } from "@/hooks/payments/useBatchTransfer";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { z } from "zod";
import { getCategoryOptions, stringToCategory } from "@/lib/audit-enums";
import { useQuery } from "@tanstack/react-query";
import { fetchWalletBalance } from "@/utils/helper";
import { formatUnits } from "viem";

// GL category options from V2 contract
const CATEGORY_OPTIONS = getCategoryOptions();

// Per-recipient data matching ExternalAuditFields in AuditRegistry.sol
type RecipientData = {
    address: string;
    amount: string;
    category: string;        // GL Category (OPEX, CAPEX, etc.)
    invoiceFile?: File;      // Optional — hashed to bytes32 invoiceHash onchain
    poFile?: File;           // Optional — hashed to bytes32 poHash onchain
};

const recipientSchema = z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
    amount: z.string().refine(
        (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
        "Amount must be greater than 0"
    ),
    category: z
        .string()
        .min(1, "GL Category is required")
        .refine((v) => v !== "none" && v !== "", "GL Category is required"),
});

// ─── Recipient Row (Batch) ───────────────────────────────────────────────────

const RecipientRow = React.memo(
    ({
        recipient,
        index,
        showRemove,
        onUpdate,
        onRemove,
    }: {
        recipient: RecipientData;
        index: number;
        showRemove: boolean;
        onUpdate: (index: number, field: keyof RecipientData, value: any) => void;
        onRemove: (index: number) => void;
    }) => (
        <div className="space-y-4 p-5 rounded-xl border border-border bg-background shadow-sm">
            {/* Address + Amount */}
            <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="flex-1 space-y-2 w-full">
                    <Label className="text-muted-foreground">Recipient Address</Label>
                    <Input
                        placeholder="0x..."
                        value={recipient.address}
                        onChange={(e) => onUpdate(index, "address", e.target.value)}
                        className="font-mono"
                    />
                </div>
                <div className="w-full sm:w-32 space-y-2">
                    <Label className="text-muted-foreground">Amount</Label>
                    <div className="relative">
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={recipient.amount}
                            onChange={(e) => onUpdate(index, "amount", e.target.value)}
                            className="pr-12"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                            USDC
                        </span>
                    </div>
                </div>
                {showRemove && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemove(index)}
                        className="mt-8 text-muted-foreground hover:text-destructive"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* GL Category & Files */}
            <div className="grid sm:grid-cols-[200px_1fr] gap-4 pt-4 border-t border-border">
                <div className="space-y-2">
                    <Label className="text-muted-foreground">GL Category</Label>
                    <Select
                        value={recipient.category || ""}
                        onValueChange={(v) => onUpdate(index, "category", v ?? "")}
                    >
                        <SelectTrigger className="w-full bg-muted/20">
                            <SelectValue placeholder="Select category..." />
                        </SelectTrigger>
                        <SelectContent>
                            {CATEGORY_OPTIONS.map((c) => (
                                <SelectItem key={c.value} value={c.value}>
                                    {c.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1.5 text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" /> Invoice
                        </Label>
                        <Input
                            type="file"
                            onChange={(e) => onUpdate(index, "invoiceFile", e.target.files?.[0])}
                            className="text-xs bg-muted/20 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1.5 text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" /> PO
                        </Label>
                        <Input
                            type="file"
                            onChange={(e) => onUpdate(index, "poFile", e.target.files?.[0])}
                            className="text-xs bg-muted/20 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
);
RecipientRow.displayName = "RecipientRow";

// ─── Main Form ───────────────────────────────────────────────────────────────

interface PaymentFormProps {
    walletAddress?: `0x${string}`;
    auditRegistryAddress?: `0x${string}`;
}

const emptyRecipient = (): RecipientData => ({ address: "", amount: "", category: "" });

export function PaymentForm({ walletAddress, auditRegistryAddress }: PaymentFormProps) {
    const [tab, setTab] = useState<"single" | "batch">("single");

    // Fetch wallet balance
    const { data: wallet } = useQuery({
        queryKey: ["walletBalance", walletAddress],
        queryFn: () => fetchWalletBalance(walletAddress as `0x${string}`),
        enabled: !!walletAddress,
    });
    const activeBalance = wallet?.availableUsdcBalance;

    // Single payment state — fields matching ExternalAuditFields
    const [single, setSingle] = useState<RecipientData>(emptyRecipient());
    const [singleInvoice, setSingleInvoice] = useState<File | null>(null);
    const [singlePO, setSinglePO] = useState<File | null>(null);

    // Batch state
    const [batch, setBatch] = useState<RecipientData[]>([emptyRecipient()]);

    // Approval flag (maps to AuditRegistry.approvePayment segregation-of-duties workflow)
    const [requiresApproval, setRequiresApproval] = useState(false);

    const [isProcessing, setIsProcessing] = useState(false);
    const [transactionStatus, setTransactionStatus] = useState("");

    const singleMutation = useSingleTransfer();
    const batchMutation = useBatchTransfer();

    React.useEffect(() => {
        const processing = singleMutation.isPending || batchMutation.isPending;
        setIsProcessing(processing);
        if (!processing) {
            const t = setTimeout(() => setTransactionStatus(""), 2000);
            return () => clearTimeout(t);
        }
    }, [singleMutation.isPending, batchMutation.isPending]);

    const updateBatch = (index: number, field: keyof RecipientData, value: any) => {
        setBatch((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const addBatchRow = () => setBatch((prev) => [...prev, emptyRecipient()]);
    const removeBatchRow = (index: number) => {
        setBatch((prev) =>
            prev.length > 1 ? prev.filter((_, i) => i !== index) : [emptyRecipient()]
        );
    };

    const validate = (recipients: RecipientData[]) => {
        try {
            z.array(recipientSchema).parse(recipients);
            return true;
        } catch (err) {
            if (err instanceof z.ZodError) {
                toast.error(err.issues[0].message);
            } else {
                toast.error("Validation failed");
            }
            setTransactionStatus("");
            return false;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTransactionStatus("Initializing...");

        try {
            if (tab === "single") {
                if (!single.address || !single.amount) {
                    toast.error("Please fill in recipient address and amount");
                    setTransactionStatus("");
                    return;
                }
                if (!validate([single])) return;

                await singleMutation.mutateAsync({
                    to: single.address as `0x${string}`,
                    amount: single.amount,
                    category: single.category,
                    auditRegistryAddress: auditRegistryAddress!,
                    walletAddress: walletAddress!,
                    onStatusUpdate: setTransactionStatus,
                });

                setSingle(emptyRecipient());
                setSingleInvoice(null);
                setSinglePO(null);
            } else {
                const valid = batch.filter((r) => r.address && r.amount);
                if (valid.length < 2) {
                    toast.error("Batch payments require at least 2 recipients");
                    setTransactionStatus("");
                    return;
                }
                if (!validate(valid)) return;

                await batchMutation.mutateAsync({
                    recipients: valid.map((r) => ({
                        address: r.address as `0x${string}`,
                        amount: r.amount,
                        category: r.category,
                    })),
                    auditRegistryAddress: auditRegistryAddress!,
                    walletAddress: walletAddress!,
                    onStatusUpdate: setTransactionStatus,
                });

                setBatch([emptyRecipient()]);
            }
        } catch (error) {
            console.error("Payment error:", error);
            setTransactionStatus("Failed");
        }
    };

    return (
        <div className="max-w-3xl mx-auto w-full pb-12">
            <form onSubmit={handleSubmit} className="space-y-10">
                <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as "single" | "batch")}
                    className="w-full"
                >
                    <div className="flex justify-end mb-8">
                        <TabsList className="grid w-full sm:w-[400px] grid-cols-2">
                            <TabsTrigger value="single">Single Payment</TabsTrigger>
                            <TabsTrigger value="batch">Batch Payment</TabsTrigger>
                        </TabsList>
                    </div>

                    {/* ── Single Payment ── */}
                    <TabsContent value="single" className="space-y-10 outline-none focus-visible:ring-0 mt-0">
                        {/* Section 1: Transfer Details */}
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-lg font-medium">Transfer Details</h3>
                                <p className="text-sm text-muted-foreground">Enter the recipient address and amount to transfer.</p>
                            </div>
                            <Card className="overflow-hidden">
                                <CardContent className="space-y-6 p-6">
                                    <div className="grid sm:grid-cols-[1fr_160px] gap-4 items-start">
                                        <div className="space-y-2">
                                            <Label htmlFor="single-recipient">Recipient Address</Label>
                                            <Input
                                                id="single-recipient"
                                                placeholder="0x..."
                                                value={single.address}
                                                onChange={(e) =>
                                                    setSingle((p) => ({ ...p, address: e.target.value }))
                                                }
                                                className="font-mono"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="single-amount">Amount</Label>
                                            <div className="relative">
                                                <Input
                                                    id="single-amount"
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={single.amount}
                                                    onChange={(e) =>
                                                        setSingle((p) => ({ ...p, amount: e.target.value }))
                                                    }
                                                    className="pr-12"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                                    USDC
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                                <div className="flex items-center justify-between p-4 bg-muted/40 border-t border-border">
                                    <span className="text-sm text-muted-foreground">Available Balance</span>
                                    <span className="text-sm font-medium">{activeBalance ? Number(activeBalance).toFixed(4) : "0.00"} USDC</span>
                                </div>
                            </Card>
                        </div>

                        {/* Section 2: Audit Configuration */}
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-lg font-medium">Audit Configuration</h3>
                                <p className="text-sm text-muted-foreground">Securely attach GL categories and evidence to the transaction onchain.</p>
                            </div>
                            <Card className="overflow-hidden">
                                <CardContent className="space-y-6 p-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="single-category">
                                            GL Category <span className="text-muted-foreground font-normal ml-1">(Encrypted)</span>
                                        </Label>
                                        <Select
                                            value={single.category || ""}
                                            onValueChange={(v) =>
                                                setSingle((p) => ({ ...p, category: v ?? "" }))
                                            }
                                        >
                                            <SelectTrigger id="single-category" className="w-full sm:w-[300px]">
                                                <SelectValue placeholder="Select a category..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CATEGORY_OPTIONS.map((c) => (
                                                    <SelectItem key={c.value} value={c.value}>
                                                        {c.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-4 pt-2">
                                        <div className="space-y-2">
                                            <Label className="flex items-center gap-1.5 text-muted-foreground">
                                                <FileText className="h-3.5 w-3.5" /> Invoice (Optional)
                                            </Label>
                                            <Input
                                                type="file"
                                                onChange={(e) =>
                                                    setSingleInvoice(e.target.files?.[0] || null)
                                                }
                                                className="text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer h-10"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="flex items-center gap-1.5 text-muted-foreground">
                                                <FileText className="h-3.5 w-3.5" /> Purchase Order (Optional)
                                            </Label>
                                            <Input
                                                type="file"
                                                onChange={(e) => setSinglePO(e.target.files?.[0] || null)}
                                                className="text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer h-10"
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                                <div className="flex items-start gap-3 p-4 bg-muted/40 border-t border-border text-sm text-muted-foreground">
                                    <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary/70" />
                                    <p>GL categories are <strong className="font-medium text-foreground">FHE-encrypted</strong> before leaving your browser. Files are hashed locally (keccak256) — the raw file is never uploaded.</p>
                                </div>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* ── Batch Payment ── */}
                    <TabsContent value="batch" className="space-y-10 outline-none focus-visible:ring-0 mt-0">
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-lg font-medium">Batch Transfer</h3>
                                <p className="text-sm text-muted-foreground">Send multiple transactions efficiently in a single batch.</p>
                            </div>
                            <Card className="overflow-hidden">
                                <CardContent className="space-y-6 p-6">
                                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={addBatchRow}
                                            className="shrink-0 w-full sm:w-auto"
                                        >
                                            <Plus className="h-4 w-4 mr-2" /> Add Empty Row
                                        </Button>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t border-border">
                                        {batch.map((recipient, index) => (
                                            <RecipientRow
                                                key={index}
                                                recipient={recipient}
                                                index={index}
                                                showRemove={
                                                    batch.length > 1 ||
                                                    !!recipient.address ||
                                                    !!recipient.amount
                                                }
                                                onUpdate={updateBatch}
                                                onRemove={removeBatchRow}
                                            />
                                        ))}
                                    </div>
                                </CardContent>
                                <div className="flex items-center justify-between p-4 bg-muted/40 border-t border-border">
                                    <span className="text-sm text-muted-foreground">Available Balance</span>
                                    <span className="text-sm font-medium">{activeBalance ? Number(activeBalance).toFixed(4) : "0.00"} USDC</span>
                                </div>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* ── Workflow & Submit ── */}
                    <div className="space-y-3 pt-6 border-t border-border mt-8">
                        <div>
                            <h3 className="text-lg font-medium">Workflow Settings</h3>
                            <p className="text-sm text-muted-foreground">Configure approval rules for this transaction.</p>
                        </div>
                        <Card className="overflow-hidden">
                            <CardContent className="p-6">
                                <div className="flex items-center space-x-3 p-4 rounded-lg border border-border bg-muted/20">
                                    <Checkbox
                                        id="requires-approval"
                                        checked={requiresApproval}
                                        onCheckedChange={(c) => setRequiresApproval(c === true)}
                                        className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                    />
                                    <div className="space-y-1 leading-none">
                                        <Label htmlFor="requires-approval" className="text-sm font-medium cursor-pointer">
                                            Require Second Approver
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            Flags this payment for Segregation of Duties. The approver must be a different address.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-muted/40 border-t border-border">
                                <div className="flex-1 text-sm text-muted-foreground">
                                    {(transactionStatus === "Encrypting..." || transactionStatus === "Signing...") ? (
                                        <span className="animate-pulse">Encrypting data locally...</span>
                                    ) : (
                                        <span>Please review all details before confirming.</span>
                                    )}
                                </div>
                                <Button type="submit" size="lg" className="w-full sm:w-auto min-w-[200px]" disabled={isProcessing}>
                                    {isProcessing ? (
                                        <>
                                            {transactionStatus !== "Encrypting..." && (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            )}
                                            {transactionStatus === "Encrypting..."
                                                ? "Encrypting Category..."
                                                : transactionStatus || "Processing..."}
                                        </>
                                    ) : transactionStatus === "Complete" ? (
                                        "Payment Successful ✓"
                                    ) : (
                                        "Confirm Payment"
                                    )}
                                </Button>
                            </div>
                        </Card>
                    </div>
                </Tabs>
            </form>
        </div>
    );
}
