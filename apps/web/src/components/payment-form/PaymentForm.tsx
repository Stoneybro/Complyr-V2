"use client";
/* eslint-disable */

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
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Plus, Trash2, Users, Info } from "lucide-react";
import { useSingleTransfer } from "@/hooks/payments/useSingleTransfer";
import { useBatchTransfer } from "@/hooks/payments/useBatchTransfer";
import { useContacts } from "@/hooks/useContacts";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { z } from "zod";
import { MockUSDCAddress } from "@/lib/CA";
import {
    stringsToJurisdictionCodes,
    stringsToPurposeCodes,
    stringsToRiskTiers,
    stringsToCounterpartyTypes,
    getJurisdictionCodeOptions,
    getPurposeCodeOptions,
    getRiskTierOptions,
    getCounterpartyTypeOptions
} from "@/lib/audit-enums";
import { useQuery } from "@tanstack/react-query";
import { fetchWalletBalance } from "@/utils/helper";

// Audit context options
const JURISDICTION_OPTIONS = getJurisdictionCodeOptions();
const PURPOSE_CODE_OPTIONS = getPurposeCodeOptions();

// Recipient with optional audit context from contact
type RecipientData = {
    address: string;
    amount: string;
    referenceId?: string;
    jurisdictionCode?: string;
    purposeCode?: string;
    riskTier?: string;
    counterpartyType?: string;
    contactName?: string;
};

// Zod schema for recipient validation
const recipientSchema = z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
    amount: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Amount must be greater than 0"),
    referenceId: z.string().max(7, "Reference ID max 7 chars").optional(),
    jurisdictionCode: z.string().min(1, "Jurisdiction is required").refine(val => val !== "none", "Jurisdiction is required"),
    purposeCode: z.string().min(1, "Purpose Code is required").refine(val => val !== "none", "Purpose Code is required"),
    riskTier: z.string().min(1, "Risk Tier is required"),
    counterpartyType: z.string().min(1, "Counterparty Type is required"),
});

// Extracted outside to prevent re-creation on every render (fixes focus loss)
const RecipientRow = React.memo(({
    recipient,
    index,
    type,
    showRemove,
    tokenSymbol,
    onUpdate,
    onRemove,
}: {
    recipient: RecipientData;
    index: number;
    type: "batch";
    showRemove: boolean;
    tokenSymbol: string;
    onUpdate: (type: "batch", index: number, field: keyof RecipientData, value: string) => void;
    onRemove: (type: "batch", index: number) => void;
}) => (
    <div className="space-y-4 p-4 border rounded-lg">
        <div className="flex gap-2 items-start">
            <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground">Recipient Address</Label>
                <Input
                    placeholder="0x..."
                    value={recipient.address}
                    onChange={(e) => onUpdate(type, index, "address", e.target.value)}
                    className="font-mono text-sm"
                />
            </div>
            <div className="relative w-32 space-y-2">
                <Label className="text-xs text-muted-foreground">Amount</Label>
                <div className="relative">
                    <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={recipient.amount}
                        onChange={(e) => onUpdate(type, index, "amount", e.target.value)}
                        className="pr-12"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">{tokenSymbol}</span>
                </div>
            </div>
            {showRemove && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(type, index)}
                    className="mt-8"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
        </div>
        <div className="pt-3 border-t border-dashed">
            <h4 className="text-sm font-medium mb-3">Audit Records (Encrypted)</h4>
            <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Reference ID</Label>
                    <Input
                        placeholder="Max 7 char"
                        value={recipient.referenceId || ''}
                        onChange={(e) => onUpdate(type, index, "referenceId", e.target.value.substring(0, 7))}
                        className="h-8 text-xs bg-muted/30"
                        maxLength={7}
                    />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Recipient Jurisdiction</Label>
                    <Select
                        value={recipient.jurisdictionCode || ''}
                        onValueChange={(value) => {
                            onUpdate(type, index, "jurisdictionCode", value || '');
                            // If jurisdiction changes, riskTier might need to be clamped
                            onUpdate(type, index, "riskTier", ""); 
                        }}
                    >
                        <SelectTrigger className="w-full h-8 text-xs bg-muted/30">
                            <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                            {JURISDICTION_OPTIONS.map((j) => (
                                <SelectItem key={j.value} value={j.value}>
                                    {j.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Payment Purpose</Label>
                    <Select
                        value={recipient.purposeCode || ''}
                        onValueChange={(value) => onUpdate(type, index, "purposeCode", value || '')}
                    >
                        <SelectTrigger className="w-full h-8 text-xs bg-muted/30">
                            <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                            {PURPOSE_CODE_OPTIONS.map((c) => (
                                <SelectItem key={c.value} value={c.value}>
                                    {c.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Risk Tier</Label>
                    <Select
                        value={recipient.riskTier || ''}
                        onValueChange={(value) => onUpdate(type, index, "riskTier", value || '')}
                    >
                        <SelectTrigger className="w-full h-8 text-xs bg-muted/30">
                            <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                            {getRiskTierOptions(recipient.jurisdictionCode).map((rt) => (
                                <SelectItem key={rt.value} value={rt.value}>
                                    {rt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Counterparty Type</Label>
                    <Select
                        value={recipient.counterpartyType || ''}
                        onValueChange={(value) => onUpdate(type, index, "counterpartyType", value || '')}
                    >
                        <SelectTrigger className="w-full h-8 text-xs bg-muted/30">
                            <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                            {getCounterpartyTypeOptions().map((ct) => (
                                <SelectItem key={ct.value} value={ct.value}>
                                    {ct.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
        {/* Show contact name if loaded from contact */}
        {(recipient.contactName) && (
            <div className="flex flex-wrap gap-1 text-xs mt-2">
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded">
                    Contact: {recipient.contactName}
                </span>
            </div>
        )}
    </div>
));
RecipientRow.displayName = "RecipientRow";

// Contact selector component
const ContactSelector = ({ contacts, onSelect, label = "Load from Contacts" }: { contacts: any[]; onSelect: (contactId: string) => void; label?: string }) => (
    <div className="space-y-4">
        <Select onValueChange={(v: string | null) => v && onSelect(v)}>
            <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder={label} />
                </div>
            </SelectTrigger>
            <SelectContent>
                {contacts.length === 0 ? (
                    <SelectItem value="empty" disabled className="text-sm text-foreground py-3 max-w-[250px] whitespace-normal pointer-events-none data-[disabled]:opacity-100">
                        No contacts found. Use the sidebar to add a contact and automate audit records.
                    </SelectItem>
                ) : (
                    contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                            <div className="flex items-center gap-2">
                                <span>{contact.name}</span>
                                {contact.addresses.length > 1 && (
                                    <span className="text-xs text-muted-foreground">
                                        ({contact.addresses.length} addresses)
                                    </span>
                                )}
                                {contact.addresses[0]?.jurisdiction && (
                                    <span className="text-xs bg-muted px-1 rounded">
                                        {contact.addresses[0].jurisdiction}
                                    </span>
                                )}
                            </div>
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
        <Alert variant="default" className="bg-muted/50 text-muted-foreground border-none py-3">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
                Contacts pre-fill audit records automatically. Manage them in the sidebar.
            </AlertDescription>
        </Alert>
    </div>
);

interface PaymentFormProps {
    walletAddress?: `0x${string}`;
}

type PaymentType = "single" | "batch";

export function PaymentForm({ walletAddress }: PaymentFormProps) {
    const [onchainTab, setOnchainTab] = useState<"single" | "batch">("single");

    const currentPaymentType: PaymentType = onchainTab;

    // Fetch balances
    const { data: wallet } = useQuery({
        queryKey: ["walletBalance", walletAddress],
        queryFn: () => fetchWalletBalance(walletAddress as `0x${string}`),
        enabled: !!walletAddress,
    });

    const activeBalance = wallet?.availableUsdcBalance;

    // Single payment state
    const [singleRecipient, setSingleRecipient] = useState<RecipientData>({ address: "", amount: "" });

    // Batch payment state
    const [batchRecipients, setBatchRecipients] = useState<RecipientData[]>([{ address: "", amount: "" }]);

    // Document and approval state
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [requiresApproval, setRequiresApproval] = useState<boolean>(false);

    const [isProcessing, setIsProcessing] = useState(false);
    const [transactionStatus, setTransactionStatus] = useState<string>("");

    // Contacts hook
    const { data: contacts = [] } = useContacts(walletAddress);

    // Mutations
    const singleMutation = useSingleTransfer(activeBalance);
    const batchMutation = useBatchTransfer(activeBalance);

    // Update processing state when mutation changes
    React.useEffect(() => {
        const processing = singleMutation.isPending || batchMutation.isPending;
        setIsProcessing(processing);
        if (!processing) {
            // Short delay before clearing status after completion
            const timer = setTimeout(() => setTransactionStatus(""), 2000);
            return () => clearTimeout(timer);
        }
    }, [singleMutation.isPending, batchMutation.isPending]);

    // Load contact for single transfer
    const loadContactForSingle = (contactId: string) => {
        const contact = contacts.find(c => c.id === contactId);
        if (!contact || contact.addresses.length === 0) return;

        const addr = contact.addresses[0]; // Use first address
        setSingleRecipient({
            address: addr.address,
            amount: singleRecipient.amount, // Keep existing amount
            referenceId: addr.entityId,
            jurisdictionCode: addr.jurisdictionCode, // Maps legacy to new
            purposeCode: addr.purposeCode, // Maps legacy to new
            contactName: contact.name,
        });
    };

    // Load contact for batch (adds as new recipient)
    const loadContactForList = (contactId: string, type: "batch") => {
        const contact = contacts.find(c => c.id === contactId);
        if (!contact) return;

        const newRecipients = contact.addresses.map(addr => ({
            address: addr.address,
            amount: "",
            referenceId: addr.entityId,
            jurisdictionCode: addr.jurisdictionCode,
            purposeCode: addr.purposeCode,
            riskTier: "",
            counterpartyType: "",
            contactName: contact.name,
        }));

        if (type === "batch") {
            // Replace empty first row or add to list
            const hasOnlyEmptyRow = batchRecipients.length === 1 && !batchRecipients[0].address;
            setBatchRecipients(hasOnlyEmptyRow ? newRecipients : [...batchRecipients, ...newRecipients]);
        }
    };

    const addRecipient = (type: "batch") => {
        if (type === "batch") {
            setBatchRecipients([...batchRecipients, { address: "", amount: "" }]);
        }
    };

    const removeRecipient = (type: "batch", index: number) => {
        if (type === "batch") {
            if (batchRecipients.length > 1) {
                setBatchRecipients(batchRecipients.filter((_, i) => i !== index));
            } else {
                setBatchRecipients([{ address: "", amount: "" }]);
            }
        }
    };

    const updateRecipient = (type: "batch", index: number, field: keyof RecipientData, value: string) => {
        if (type === "batch") {
            const updated = [...batchRecipients];
            updated[index] = { ...updated[index], [field]: value };
            setBatchRecipients(updated);
        }
    };

    // Build audit metadata from recipients (per-recipient arrays, converted to enum values)
    const buildAudit = (recipients: RecipientData[]) => {
        // Collect per-recipient data as string arrays
        const jurisdictionStrings = recipients.map(r => r.jurisdictionCode);
        const purposeCodeStrings = recipients.map(r => r.purposeCode);
        const referenceIdStrings = recipients.map(r => r.referenceId || "");
        const riskTierStrings = recipients.map(r => r.riskTier);
        const counterpartyTypeStrings = recipients.map(r => r.counterpartyType);

        // Filter out empty arrays for optional fields
        const hasJurisdictions = jurisdictionStrings.some(j => j && j !== "none");
        const hasPurposeCodes = purposeCodeStrings.some(c => c && c !== "none");
        const hasReferences = referenceIdStrings.some(r => r !== "");
        const hasRiskTiers = riskTierStrings.some(rt => rt && rt !== "none");
        const hasCounterpartyTypes = counterpartyTypeStrings.some(ct => ct && ct !== "none");

        // Convert strings to enum values (numbers)
        return {
            jurisdictionCodes: hasJurisdictions ? stringsToJurisdictionCodes(jurisdictionStrings) : undefined,
            purposeCodes: hasPurposeCodes ? stringsToPurposeCodes(purposeCodeStrings) : undefined,
            referenceIds: hasReferences ? referenceIdStrings : undefined,
            riskTiers: hasRiskTiers ? stringsToRiskTiers(riskTierStrings) : undefined,
            counterpartyTypes: hasCounterpartyTypes ? stringsToCounterpartyTypes(counterpartyTypeStrings) : undefined,
            requiresApproval,
        };
    };

    const validateRequiredAudit = (recipients: RecipientData[]) => {
        try {
            z.array(recipientSchema).parse(recipients);
            return true;
        } catch (error) {
            if (error instanceof z.ZodError) {
                toast.error((error as any).errors[0].message);
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

        const tokenAddress = MockUSDCAddress as `0x${string}`;

        try {
            if (currentPaymentType === "single") {
                if (!singleRecipient.address || !singleRecipient.amount) {
                    toast.error("Please fill in recipient and amount");
                    setTransactionStatus("");
                    return;
                }
                if (!validateRequiredAudit([singleRecipient])) return;
                await singleMutation.mutateAsync({
                    to: singleRecipient.address as `0x${string}`,
                    amount: singleRecipient.amount,
                    tokenAddress,
                    audit: buildAudit([singleRecipient]),
                    onStatusUpdate: setTransactionStatus,
                });
                setSingleRecipient({ address: "", amount: "", referenceId: "", riskTier: "", counterpartyType: "" });
                setDocumentFile(null);
            } else if (currentPaymentType === "batch") {
                const addressesOnly = batchRecipients.filter(r => r.address);
                if (addressesOnly.length < 2) {
                    toast.error("Batch payments require at least 2 recipients");
                    setTransactionStatus("");
                    return;
                }
                
                const validRecipients = batchRecipients.filter(r => r.address && r.amount);
                if (validRecipients.length !== addressesOnly.length) {
                    toast.error("Please provide an amount for all recipients");
                    setTransactionStatus("");
                    return;
                }
                if (!validateRequiredAudit(validRecipients)) return;
                
                await batchMutation.mutateAsync({
                    recipients: validRecipients.map(r => r.address as `0x${string}`),
                    amounts: validRecipients.map(r => r.amount),
                    tokenAddress,
                    audit: buildAudit(validRecipients),
                    onStatusUpdate: setTransactionStatus,
                });
                setBatchRecipients([{ address: "", amount: "", referenceId: "", riskTier: "", counterpartyType: "" }]);
                setDocumentFile(null);
            }
        } catch (error) {
            console.error("Payment error:", error);
            setTransactionStatus("Failed");
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-6">
            <Card>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <Tabs value={onchainTab} onValueChange={(v) => setOnchainTab(v as "single" | "batch")} className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="single">Single</TabsTrigger>
                                        <TabsTrigger value="batch">Batch</TabsTrigger>
                                    </TabsList>

                                    
                                    <TabsContent value="single" className="space-y-6 mt-6">
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Send a payment to a single recipient.
                                        </p>
                                        <ContactSelector contacts={contacts} onSelect={loadContactForSingle} />
                                        
                                        <div className="space-y-4 p-4 border rounded-lg">
                                            <div className="grid grid-cols-[1fr_120px] gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="single-recipient" className="text-xs text-muted-foreground">Recipient Address</Label>
                                                    <Input
                                                        id="single-recipient"
                                                        placeholder="0x..."
                                                        value={singleRecipient.address}
                                                        onChange={(e) => setSingleRecipient({ ...singleRecipient, address: e.target.value })}
                                                        className="font-mono text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-2 relative">
                                                    <Label htmlFor="single-amount" className="text-xs text-muted-foreground">Amount</Label>
                                                    <div className="relative">
                                                        <Input
                                                            id="single-amount"
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="0.00"
                                                            value={singleRecipient.amount}
                                                            onChange={(e) => setSingleRecipient({ ...singleRecipient, amount: e.target.value })}
                                                            className="pr-12"
                                                        />
                                                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">USDC</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="pt-3 border-t border-dashed">
                                                <h4 className="text-sm font-medium mb-3">Audit Records (Encrypted)</h4>
                                                <div className="grid grid-cols-2 gap-3 mb-3">
                                                    <div className="space-y-1">
                                                        <Label htmlFor="single-ref" className="text-xs text-muted-foreground">Reference ID</Label>
                                                        <Input
                                                            id="single-ref"
                                                            placeholder="Max 7 char"
                                                            value={singleRecipient.referenceId || ''}
                                                            onChange={(e) => setSingleRecipient({ ...singleRecipient, referenceId: e.target.value.substring(0, 7) })}
                                                            className="h-8 text-xs bg-muted/30"
                                                            maxLength={7}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor="single-jurisdiction" className="text-xs text-muted-foreground">Recipient Jurisdiction</Label>
                                                        <Select
                                                            value={singleRecipient.jurisdictionCode || ''}
                                                            onValueChange={(value) => setSingleRecipient({ ...singleRecipient, jurisdictionCode: value || '', riskTier: '' })}
                                                        >
                                                            <SelectTrigger id="single-jurisdiction" className="w-full h-8 text-xs bg-muted/30">
                                                                <SelectValue placeholder="Select..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {JURISDICTION_OPTIONS.map((j) => (
                                                                    <SelectItem key={j.value} value={j.value}>
                                                                        {j.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div className="space-y-1">
                                                        <Label htmlFor="single-purpose" className="text-xs text-muted-foreground">Payment Purpose</Label>
                                                        <Select
                                                            value={singleRecipient.purposeCode || ''}
                                                            onValueChange={(value) => setSingleRecipient({ ...singleRecipient, purposeCode: value || '' })}
                                                        >
                                                            <SelectTrigger id="single-purpose" className="w-full h-8 text-xs bg-muted/30">
                                                                <SelectValue placeholder="Select..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {PURPOSE_CODE_OPTIONS.map((c) => (
                                                                    <SelectItem key={c.value} value={c.value}>
                                                                        {c.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor="single-risk-tier" className="text-xs text-muted-foreground">Risk Tier</Label>
                                                        <Select
                                                            value={singleRecipient.riskTier || ''}
                                                            onValueChange={(value) => setSingleRecipient({ ...singleRecipient, riskTier: value || '' })}
                                                        >
                                                            <SelectTrigger id="single-risk-tier" className="w-full h-8 text-xs bg-muted/30">
                                                                <SelectValue placeholder="Select..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {getRiskTierOptions(singleRecipient.jurisdictionCode).map((rt) => (
                                                                    <SelectItem key={rt.value} value={rt.value}>
                                                                        {rt.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor="single-counterparty" className="text-xs text-muted-foreground">Counterparty Type</Label>
                                                        <Select
                                                            value={singleRecipient.counterpartyType || ''}
                                                            onValueChange={(value) => setSingleRecipient({ ...singleRecipient, counterpartyType: value || '' })}
                                                        >
                                                            <SelectTrigger id="single-counterparty" className="w-full h-8 text-xs bg-muted/30">
                                                                <SelectValue placeholder="Select..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {getCounterpartyTypeOptions().map((ct) => (
                                                                    <SelectItem key={ct.value} value={ct.value}>
                                                                        {ct.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Show contact name if loaded from contact */}
                                            {(singleRecipient.contactName) && (
                                                <div className="flex flex-wrap gap-1 text-xs pt-2">
                                                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded">
                                                        Contact: {singleRecipient.contactName}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </TabsContent>
                                    
                                    <TabsContent value="batch" className="space-y-6 mt-6">
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Send payments to multiple recipients in one transaction.
                                        </p>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <ContactSelector
                                                    contacts={contacts}
                                                    onSelect={(id) => loadContactForList(id, "batch")}
                                                    label="Select Contacts"
                                                />
                                            </div>
                                            <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => addRecipient("batch")}
                                                    className="h-10"
                                                >
                                                    <Plus className="h-4 w-4 mr-2" /> Add Recipient
                                                </Button>
                                        </div>

                                        <div className="space-y-4">
                                            {batchRecipients.map((recipient, index) => (
                                                <RecipientRow
                                                    key={`batch-${index}`}
                                                    recipient={recipient}
                                                    index={index}
                                                    type="batch"
                                                    showRemove={batchRecipients.length > 1 || !!recipient.address || !!recipient.amount}
                                                    tokenSymbol="USDC"
                                                    onUpdate={updateRecipient}
                                                    onRemove={removeRecipient}
                                                />
                                            ))}
                                        </div>
                                    </TabsContent>
                                </Tabs>
                                
                        <div className="space-y-4 mt-6 p-4 border rounded-lg bg-muted/10">
                            <div>
                                <Label className="text-sm font-medium">Supporting Document (Optional)</Label>
                                <Input
                                    type="file"
                                    onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                                    className="text-sm mt-2 text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                />
                                <p className="text-[10px] mt-1 text-muted-foreground">
                                    Invoice, purchase order, or memo. Hashed onchain, encrypted offchain via IPFS.
                                </p>
                            </div>
                            
                            <div className="pt-2 border-t flex items-start space-x-2">
                                <Checkbox 
                                    id="requires-approval" 
                                    checked={requiresApproval}
                                    onCheckedChange={(c) => setRequiresApproval(c === true)}
                                />
                                <div className="space-y-1 leading-none">
                                    <Label htmlFor="requires-approval" className="text-sm font-medium">
                                        Require Second Approver
                                    </Label>
                                    <p className="text-[10px] text-muted-foreground">
                                        Opt-in tier for high-value payments. Enforces a Segregation of Duties FHE test.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <Alert variant="default" className="bg-muted/50 text-muted-foreground border-none">
                                <Info className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                    Audit records are encrypted end-to-end and stored on-chain.
                                </AlertDescription>
                            </Alert>
                        </div>

                        <div className="space-y-4 mt-4">
                        {(transactionStatus === "Encrypting..." || transactionStatus === "Signing...") && (
                                <div className="animate-in fade-in duration-500">
                                    <p className="text-[10px] text-muted-foreground italic">
                                        Audit records are being encrypted with Zama FHE before leaving your browser — this takes a few seconds per payment.
                                    </p>
                                </div>
                            )}

                            <Button type="submit" className="w-full" disabled={isProcessing}>
                                {isProcessing ? (
                                    <>
                                        {transactionStatus !== "Encrypting..." && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {transactionStatus === "Encrypting..." ? "Securing Records..." : (transactionStatus || "Processing...")}
                                    </>
                                ) : (
                                    transactionStatus === "Complete" ? "Payment Successful" :
                                    "Confirm Payment"
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
