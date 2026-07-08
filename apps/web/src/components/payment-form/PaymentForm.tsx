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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { InputGroup, InputGroupInput, InputGroupText, InputGroupAddon } from "@/components/ui/input-group";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Info, ArrowRight, X } from "lucide-react";
import { useSingleTransfer } from "@/hooks/payments/useSingleTransfer";
import { useConfidentialBalance } from "@/hooks/useConfidentialBalance";
import { toast } from "sonner";
import { z } from "zod";
import { getCategoryOptions } from "@/lib/audit-enums";
import { keccak256, toHex } from "viem";

const CATEGORY_OPTIONS = getCategoryOptions();

type RecipientData = {
    address: string;
    amount: string;
    category: string;
    invoiceHash?: `0x${string}`;
    poHash?: `0x${string}`;
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

interface PaymentFormProps {
    walletAddress?: `0x${string}`;
    auditRegistryAddress?: `0x${string}`;
    hasAuditor?: boolean;
    onNavigateToAudits?: () => void;
}

const emptyRecipient = (): RecipientData => ({ address: "", amount: "", category: "" });

export function PaymentForm({ 
    walletAddress, 
    auditRegistryAddress, 
    hasAuditor = true, 
    onNavigateToAudits 
}: PaymentFormProps) {
    const [single, setSingle] = useState<RecipientData>(emptyRecipient());
    const [transactionStatus, setTransactionStatus] = useState("");
    const [dismissedAlert, setDismissedAlert] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<keyof RecipientData, string>>>({});

    const singleMutation = useSingleTransfer();
    const isProcessing = singleMutation.isPending;
    
    const { raw, formatted } = useConfidentialBalance();
    const amountVal = parseFloat(single.amount);
    let amountRaw = 0n;
    if (!isNaN(amountVal) && amountVal > 0) {
        amountRaw = BigInt(Math.round(amountVal * 1_000_000));
    }
    const isInsufficient = raw !== null && amountRaw > raw;

    React.useEffect(() => {
        if (!isProcessing && transactionStatus) {
            const t = setTimeout(() => setTransactionStatus(""), 3000);
            return () => clearTimeout(t);
        }
    }, [isProcessing, transactionStatus]);

    const validate = (data: RecipientData) => {
        const result = recipientSchema.safeParse(data);
        if (result.success) {
            setErrors({});
            return true;
        } else {
            const newErrors: Record<string, string> = {};
            const issues = result.error.issues || [];
            issues.forEach((e: any) => {
                if (e.path && e.path[0]) newErrors[e.path[0].toString()] = e.message;
            });
            setErrors(newErrors);
            setTransactionStatus("");
            return false;
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: "invoice" | "po") => {
        const file = e.target.files?.[0];
        if (!file) {
            setSingle((prev) => ({ ...prev, [type === "invoice" ? "invoiceHash" : "poHash"]: undefined }));
            return;
        }
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const hash = keccak256(toHex(bytes));
            
            setSingle((prev) => ({ 
                ...prev, 
                [type === "invoice" ? "invoiceHash" : "poHash"]: hash 
            }));
            
            toast.success(`${type === "invoice" ? "Invoice" : "Purchase Order"} hashed successfully`);
        } catch (err) {
            console.error("Hashing error", err);
            toast.error(`Failed to process ${type}`);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTransactionStatus("Initializing...");

        if (!validate(single)) return;
        if (isInsufficient) return;

        try {
            await singleMutation.mutateAsync({
                to: single.address as `0x${string}`,
                amount: single.amount,
                category: single.category,
                invoiceHash: single.invoiceHash,
                poHash: single.poHash,
                auditRegistryAddress: auditRegistryAddress!,
                walletAddress: walletAddress!,
                onStatusUpdate: setTransactionStatus,
            });

            setTransactionStatus("Complete");
            setSingle(emptyRecipient());
            setErrors({});
            toast.success("Payment submitted successfully");
            
            // Reset file inputs visually
            const form = e.target as HTMLFormElement;
            form.reset();
        } catch (error) {
            console.error("Payment error:", error);
            setTransactionStatus("Failed");
            toast.error("Payment failed. Please try again.");
        }
    };

    return (
        <div className="max-w-2xl mx-auto w-full pb-12 space-y-4">
            {!hasAuditor && !dismissedAlert && (
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>No auditor assigned</AlertTitle>
                    <AlertDescription className="text-wrap">
                        You haven't authorized an external auditor yet. Check out the Audits page to add an auditor and configure tests, otherwise your payments will not be audited.
                    </AlertDescription>
                    <AlertAction>
                        <Button 
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDismissedAlert(true)}
                            className="size-6 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-0"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </AlertAction>
                </Alert>
            )}

            <form onSubmit={handleSubmit}>
                <Card className="shadow-sm">
                    <CardHeader className="px-6 pt-4 pb-4">
                        <CardTitle className="text-xl">Create Payment</CardTitle>
                        <CardDescription>
                            Send a secure, FHE-encrypted payment with an immutable audit record.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-6 py-6 space-y-6">
                        <FieldGroup>
                            {/* Recipient */}
                            <Field data-invalid={!!errors.address ? "" : undefined}>
                                <FieldLabel htmlFor="single-recipient">Recipient Address</FieldLabel>
                                <Input
                                    id="single-recipient"
                                    placeholder="0x..."
                                    value={single.address}
                                    onChange={(e) => {
                                        setSingle((p) => ({ ...p, address: e.target.value }));
                                        if (errors.address) setErrors((p) => ({ ...p, address: undefined }));
                                    }}
                                    className="font-mono"
                                    aria-invalid={!!errors.address ? "true" : undefined}
                                />
                                {errors.address && <FieldDescription className="text-destructive">{errors.address}</FieldDescription>}
                            </Field>

                            {/* Amount & Category */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Field data-invalid={!!errors.amount ? "" : undefined}>
                                    <FieldLabel htmlFor="single-amount">Amount</FieldLabel>
                                    <InputGroup>
                                        <InputGroupInput
                                            id="single-amount"
                                            type="number"
                                            step="0.000001"
                                            min="0"
                                            placeholder="0.00"
                                            value={single.amount}
                                            onChange={(e) => {
                                                setSingle((p) => ({ ...p, amount: e.target.value }));
                                                if (errors.amount) setErrors((p) => ({ ...p, amount: undefined }));
                                            }}
                                            aria-invalid={!!errors.amount ? "true" : undefined}
                                        />
                                        <InputGroupAddon align="inline-end">
                                            <InputGroupText>USDC</InputGroupText>
                                        </InputGroupAddon>
                                    </InputGroup>
                                    {errors.amount ? (
                                        <FieldDescription className="text-destructive">{errors.amount}</FieldDescription>
                                    ) : isInsufficient ? (
                                        <FieldDescription className="text-destructive">
                                            Insufficient balance (Current: {formatted} USDC)
                                        </FieldDescription>
                                    ) : null}
                                </Field>

                                <Field data-invalid={!!errors.category ? "" : undefined}>
                                    <FieldLabel htmlFor="single-category">Category (GL)</FieldLabel>
                                    <Select
                                        value={single.category || ""}
                                        onValueChange={(v) => {
                                            setSingle((p) => ({ ...p, category: v ?? "" }));
                                            if (errors.category) setErrors((p) => ({ ...p, category: undefined }));
                                        }}
                                    >
                                        <SelectTrigger 
                                            id="single-category" 
                                            className="w-full"
                                            aria-invalid={!!errors.category ? "true" : undefined}
                                        >
                                            <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CATEGORY_OPTIONS.map((c) => (
                                                <SelectItem key={c.value} value={c.value}>
                                                    {c.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.category && <FieldDescription className="text-destructive">{errors.category}</FieldDescription>}
                                </Field>
                            </div>

                            {/* Documents */}
                            <div className="pt-2">
                                <h3 className="text-sm font-medium mb-4">Supporting Documents <span className="text-muted-foreground font-normal">(Optional)</span></h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Field>
                                        <FieldLabel className="text-xs text-muted-foreground">Invoice</FieldLabel>
                                        <Input
                                            type="file"
                                            onChange={(e) => handleFileChange(e, "invoice")}
                                            className="h-9 text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer"
                                        />
                                        {single.invoiceHash && (
                                            <p className="text-[10px] text-muted-foreground font-mono truncate mt-1">
                                                Hash: {single.invoiceHash}
                                            </p>
                                        )}
                                    </Field>
                                    <Field>
                                        <FieldLabel className="text-xs text-muted-foreground">Purchase Order</FieldLabel>
                                        <Input
                                            type="file"
                                            onChange={(e) => handleFileChange(e, "po")}
                                            className="h-9 text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer"
                                        />
                                        {single.poHash && (
                                            <p className="text-[10px] text-muted-foreground font-mono truncate mt-1">
                                                Hash: {single.poHash}
                                            </p>
                                        )}
                                    </Field>
                                </div>
                            </div>
                        </FieldGroup>
                    </CardContent>
                    
                    <CardFooter className="border-t bg-muted/20 px-6 py-4 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-4">
                        <p className="text-sm text-muted-foreground">
                            Values are <strong className="font-medium text-foreground">encrypted locally</strong> via FHE before being sent onchain.
                        </p>
                        
                        <Button 
                            type="submit" 
                            disabled={isProcessing || isInsufficient}
                            className="w-full sm:w-auto"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {transactionStatus || "Processing"}
                                </>
                            ) : transactionStatus === "Complete" ? (
                                "Success ✓"
                            ) : (
                                "Send Payment"
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}
