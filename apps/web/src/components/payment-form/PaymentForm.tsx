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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Plus, Trash2, Users, Info, FileText } from "lucide-react";
import { useSingleTransfer } from "@/hooks/payments/useSingleTransfer";
import { useBatchTransfer } from "@/hooks/payments/useBatchTransfer";
import { useContacts } from "@/hooks/useContacts";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { z } from "zod";
import { MockUSDCAddress } from "@/lib/CA";
import { getCategoryOptions, stringToCategory } from "@/lib/audit-enums";
import { useQuery } from "@tanstack/react-query";
import { fetchWalletBalance } from "@/utils/helper";

// GL category options from V2 contract
const CATEGORY_OPTIONS = getCategoryOptions();

// Per-recipient data matching ExternalAuditFields in AuditRegistry.sol
type RecipientData = {
    address: string;
    amount: string;
    category: string;        // GL Category (OPEX, CAPEX, etc.)
    invoiceFile?: File;      // Optional — hashed to bytes32 invoiceHash onchain
    poFile?: File;           // Optional — hashed to bytes32 poHash onchain
    contactName?: string;
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

// ─── Contact Selector ────────────────────────────────────────────────────────

const ContactSelector = ({
    contacts,
    onSelect,
    label = "Load from Contacts",
}: {
    contacts: any[];
    onSelect: (contactId: string) => void;
    label?: string;
}) => (
    <div className="space-y-3">
        <Select onValueChange={(v: string | null) => v && onSelect(v)}>
            <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder={label} />
                </div>
            </SelectTrigger>
            <SelectContent>
                {contacts.length === 0 ? (
                    <SelectItem
                        value="empty"
                        disabled
                        className="text-sm text-foreground py-3 max-w-[250px] whitespace-normal pointer-events-none data-[disabled]:opacity-100"
                    >
                        No contacts yet. Add one in the Contacts view.
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
                            </div>
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
        <Alert variant="default" className="bg-muted/50 text-muted-foreground border-none py-2">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
                Contacts pre-fill the recipient address. Manage them in the Contacts view.
            </AlertDescription>
        </Alert>
    </div>
);

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
        <div className="space-y-3 p-4 border rounded-lg">
            {/* Address + Amount */}
            <div className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Recipient Address</Label>
                    <Input
                        placeholder="0x..."
                        value={recipient.address}
                        onChange={(e) => onUpdate(index, "address", e.target.value)}
                        className="font-mono text-sm"
                    />
                </div>
                <div className="w-32 space-y-1">
                    <Label className="text-xs text-muted-foreground">Amount</Label>
                    <div className="relative">
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={recipient.amount}
                            onChange={(e) => onUpdate(index, "amount", e.target.value)}
                            className="pr-14"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">
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
                        className="mt-6"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* GL Category */}
            <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">GL Category (Encrypted)</Label>
                <Select
                    value={recipient.category || ""}
                    onValueChange={(v) => onUpdate(index, "category", v ?? "")}
                >
                    <SelectTrigger className="w-full h-8 text-xs bg-muted/30">
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

            {/* Document hashes */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-dashed">
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Invoice (Optional)
                    </Label>
                    <Input
                        type="file"
                        onChange={(e) => onUpdate(index, "invoiceFile", e.target.files?.[0])}
                        className="text-xs h-8 bg-muted/30 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary"
                    />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Purchase Order (Optional)
                    </Label>
                    <Input
                        type="file"
                        onChange={(e) => onUpdate(index, "poFile", e.target.files?.[0])}
                        className="text-xs h-8 bg-muted/30 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary"
                    />
                </div>
            </div>

            {recipient.contactName && (
                <div className="flex text-xs">
                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded">
                        Contact: {recipient.contactName}
                    </span>
                </div>
            )}
        </div>
    )
);
RecipientRow.displayName = "RecipientRow";

// ─── Main Form ───────────────────────────────────────────────────────────────

interface PaymentFormProps {
    walletAddress?: `0x${string}`;
}

const emptyRecipient = (): RecipientData => ({ address: "", amount: "", category: "" });

export function PaymentForm({ walletAddress }: PaymentFormProps) {
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

    const { data: contacts = [] } = useContacts(walletAddress);

    const singleMutation = useSingleTransfer(activeBalance);
    const batchMutation = useBatchTransfer(activeBalance);

    React.useEffect(() => {
        const processing = singleMutation.isPending || batchMutation.isPending;
        setIsProcessing(processing);
        if (!processing) {
            const t = setTimeout(() => setTransactionStatus(""), 2000);
            return () => clearTimeout(t);
        }
    }, [singleMutation.isPending, batchMutation.isPending]);

    // Load contact address into the single form
    const loadContactForSingle = (contactId: string) => {
        const contact = contacts.find((c) => c.id === contactId);
        if (!contact || contact.addresses.length === 0) return;
        const addr = contact.addresses[0];
        setSingle((prev) => ({
            ...prev,
            address: addr.address,
            contactName: contact.name,
        }));
    };

    // Load contact address(es) into batch
    const loadContactForBatch = (contactId: string) => {
        const contact = contacts.find((c) => c.id === contactId);
        if (!contact) return;
        const newRows: RecipientData[] = contact.addresses.map((addr: any) => ({
            address: addr.address,
            amount: "",
            category: "",
            contactName: contact.name,
        }));
        const hasOnlyEmpty = batch.length === 1 && !batch[0].address;
        setBatch(hasOnlyEmpty ? newRows : [...batch, ...newRows]);
    };

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
        const tokenAddress = MockUSDCAddress as `0x${string}`;

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
                    invoiceFile: singleInvoice,
                    poFile: singlePO,
                    tokenAddress,
                    requiresApproval,
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
                    recipients: valid.map((r) => r.address as `0x${string}`),
                    amounts: valid.map((r) => r.amount),
                    categories: valid.map((r) => r.category),
                    invoiceHashes: valid.map(() => null), // file hashing would happen here
                    poHashes: valid.map(() => null),
                    tokenAddress,
                    requiresApproval,
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
        <div className="max-w-2xl mx-auto w-full py-6">
            <form onSubmit={handleSubmit} className="space-y-6">
                <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as "single" | "batch")}
                    className="w-full"
                >
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="single">Single</TabsTrigger>
                        <TabsTrigger value="batch">Batch</TabsTrigger>
                    </TabsList>

                    {/* ── Single Payment ── */}
                    <TabsContent value="single" className="space-y-5 mt-6">
                        <ContactSelector contacts={contacts} onSelect={loadContactForSingle} />

                        <div className="space-y-4 p-4 border rounded-lg">
                            {/* Address + Amount */}
                            <div className="grid grid-cols-[1fr_140px] gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="single-recipient" className="text-xs text-muted-foreground">
                                        Recipient Address
                                    </Label>
                                    <Input
                                        id="single-recipient"
                                        placeholder="0x..."
                                        value={single.address}
                                        onChange={(e) =>
                                            setSingle((p) => ({ ...p, address: e.target.value }))
                                        }
                                        className="font-mono text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="single-amount" className="text-xs text-muted-foreground">
                                        Amount
                                    </Label>
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
                                            className="pr-14"
                                        />
                                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">
                                            USDC
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* GL Category */}
                            <div className="pt-3 border-t border-dashed space-y-3">
                                <h4 className="text-sm font-medium">Audit Record (Encrypted Onchain)</h4>
                                <div className="space-y-1">
                                    <Label htmlFor="single-category" className="text-xs text-muted-foreground">
                                        GL Category
                                    </Label>
                                    <Select
                                        value={single.category || ""}
                                        onValueChange={(v) =>
                                            setSingle((p) => ({ ...p, category: v ?? "" }))
                                        }
                                    >
                                        <SelectTrigger id="single-category" className="w-full h-8 text-xs bg-muted/30">
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

                                {/* Document evidence anchors */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                            <FileText className="h-3 w-3" /> Invoice (Optional)
                                        </Label>
                                        <Input
                                            type="file"
                                            onChange={(e) =>
                                                setSingleInvoice(e.target.files?.[0] || null)
                                            }
                                            className="text-xs h-8 bg-muted/30 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                            <FileText className="h-3 w-3" /> Purchase Order (Optional)
                                        </Label>
                                        <Input
                                            type="file"
                                            onChange={(e) => setSinglePO(e.target.files?.[0] || null)}
                                            className="text-xs h-8 bg-muted/30 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary"
                                        />
                                    </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    Files are hashed locally (keccak256) and the hash is stored onchain as an evidence anchor — the file itself is never uploaded.
                                </p>
                            </div>

                            {single.contactName && (
                                <div className="flex text-xs">
                                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded">
                                        Contact: {single.contactName}
                                    </span>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    {/* ── Batch Payment ── */}
                    <TabsContent value="batch" className="space-y-5 mt-6">
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <ContactSelector
                                    contacts={contacts}
                                    onSelect={loadContactForBatch}
                                    label="Add from Contacts"
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addBatchRow}
                                className="h-10 shrink-0"
                            >
                                <Plus className="h-4 w-4 mr-1" /> Add Recipient
                            </Button>
                        </div>

                        <div className="space-y-4">
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
                    </TabsContent>
                </Tabs>

                {/* ── Second Approver (maps to AuditRegistry.approvePayment SoD workflow) ── */}
                <div className="space-y-4 p-4 border rounded-lg">
                    <div className="flex items-start space-x-2">
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
                                Flags this payment for approval via{" "}
                                <code className="text-[10px]">AuditRegistry.approvePayment()</code>. Enforces
                                Segregation of Duties — the approver must be a different address than the sender.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Info banner ── */}
                <Alert variant="default" className="bg-muted/50 text-muted-foreground border-none">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                        GL category is FHE-encrypted before leaving your browser. Only the{" "}
                        <code className="text-[10px]">AuditRegistry</code> and authorised auditors can
                        decrypt it.
                    </AlertDescription>
                </Alert>

                {/* ── Submit ── */}
                <div className="space-y-3">
                    {(transactionStatus === "Encrypting..." ||
                        transactionStatus === "Signing...") && (
                        <p className="text-[10px] text-muted-foreground italic animate-in fade-in duration-500">
                            GL category is being FHE-encrypted before leaving your browser — this takes a
                            few seconds.
                        </p>
                    )}
                    <Button type="submit" className="w-full" disabled={isProcessing}>
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
            </form>
        </div>
    );
}
