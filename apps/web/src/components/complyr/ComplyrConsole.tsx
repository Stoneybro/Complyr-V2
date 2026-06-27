"use client";

import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import {
  Activity,
  BadgeCheck,
  ClipboardCheck,
  FileCheck2,
  FileLock2,
  KeyRound,
  Landmark,
  Link2,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FACTORY_ADDRESS,
  CONFIDENTIAL_USDC_ADDRESS,
  ZERO_BYTES32,
  accessTiers,
  auditRegistryAbi,
  confidentialUsdcAbi,
  factoryAbi,
  hashFile,
  isAddressLike,
  isBytes32,
  priorities,
  reviewTestRegistryAbi,
  shortHex,
  spendCategories,
  testTypes,
} from "@/lib/complyr-contracts";

type ConsoleMode = "business" | "auditor";

type RegistryTuple =
  | readonly [`0x${string}`, `0x${string}`, boolean, bigint]
  | {
      auditRegistry: `0x${string}`;
      reviewTestRegistry: `0x${string}`;
      active: boolean;
      deployedAtBlock: bigint;
    };

type RegistryScope = {
  auditRegistry: `0x${string}`;
  reviewTestRegistry: `0x${string}`;
  active: boolean;
  deployedAtBlock: bigint;
};

function registryFromResult(result: unknown): RegistryScope | null {
  if (!result) return null;
  const registry = result as RegistryTuple;
  if (Array.isArray(registry)) {
    return {
      auditRegistry: registry[0],
      reviewTestRegistry: registry[1],
      active: registry[2],
      deployedAtBlock: registry[3],
    };
  }
  const objectRegistry = registry as Extract<RegistryTuple, { auditRegistry: `0x${string}` }>;
  return {
    auditRegistry: objectRegistry.auditRegistry,
    reviewTestRegistry: objectRegistry.reviewTestRegistry,
    active: objectRegistry.active,
    deployedAtBlock: objectRegistry.deployedAtBlock,
  };
}

function Badge({
  children,
  className = "border-slate-200 bg-slate-50 text-slate-700",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

async function encryptInput(body: Record<string, unknown>) {
  const response = await fetch("/api/fhe/encrypt-input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("FHE input encryption failed");
  return response.json();
}

export function ComplyrConsole({
  mode,
  initialRegistry,
}: {
  mode: ConsoleMode;
  initialRegistry?: string;
}) {
  const { address, isConnected } = useAccount();
  const [manualRegistry, setManualRegistry] = React.useState(initialRegistry || "");
  const [manualReview, setManualReview] = React.useState("");
  const [activeTab, setActiveTab] = React.useState(mode === "auditor" ? "findings" : "payments");

  const factoryConfigured = isAddressLike(FACTORY_ADDRESS || "");
  const { data: factoryRegistry } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getRegistry",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(factoryConfigured && address && mode === "business") },
  });

  const discovered = registryFromResult(factoryRegistry);
  const auditRegistry = discovered?.active
    ? discovered.auditRegistry
    : isAddressLike(manualRegistry)
      ? manualRegistry
      : undefined;

  const { data: reviewFromRegistry } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "reviewTestRegistry",
    query: { enabled: Boolean(auditRegistry && !manualReview) },
  });

  const reviewRegistry = isAddressLike(manualReview)
    ? manualReview
    : isAddressLike((reviewFromRegistry as string) || "")
      ? (reviewFromRegistry as `0x${string}`)
      : discovered?.reviewTestRegistry;

  const { data: owner } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "owner",
    query: { enabled: Boolean(auditRegistry) },
  });

  const { data: access } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "auditorAccess",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(auditRegistry && address) },
  });

  const { data: authConfigured } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "authThresholdsConfigured",
    query: { enabled: Boolean(auditRegistry) },
  });

  const isOwner = Boolean(address && owner && address.toLowerCase() === String(owner).toLowerCase());
  const tier = accessTiers.find((item) => item.value === Number(access || 0)) || accessTiers[0];

  return (
    <div className="min-h-screen bg-[#f6f7f5] text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-slate-950 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">Complyr</h1>
                <Badge className={mode === "business" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : tier.tone}>
                  {mode === "business" ? "Business Console" : `${tier.label} Auditor`}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">Your auditor gets findings. Not access.</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-md border bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Landmark className="h-4 w-4" />
              Registry Scope
            </div>
            <div className="space-y-3">
              <Field label="Audit Registry">
                <Input
                  value={manualRegistry}
                  onChange={(event) => setManualRegistry(event.target.value)}
                  placeholder={discovered?.auditRegistry || "0x..."}
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Review Test Registry">
                <Input
                  value={manualReview}
                  onChange={(event) => setManualReview(event.target.value)}
                  placeholder={(reviewRegistry as string) || "Auto-read from AuditRegistry"}
                  className="font-mono text-xs"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border bg-slate-50 p-2">
                  <div className="text-muted-foreground">Owner</div>
                  <div className="font-mono">{shortHex(String(owner || ""))}</div>
                </div>
                <div className="rounded border bg-slate-50 p-2">
                  <div className="text-muted-foreground">DoA</div>
                  <div>{authConfigured ? "Configured" : "Not set"}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FileLock2 className="h-4 w-4" />
              Access Model
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Connected role</span>
                <Badge className={isOwner ? "border-emerald-200 bg-emerald-50 text-emerald-700" : tier.tone}>
                  {isOwner ? "Owner" : tier.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                The UI only calls contract reads that the connected wallet can execute. Hidden values render as encrypted handles or access-controlled states.
              </p>
            </div>
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="mb-3 text-sm font-semibold">FHE Demo Path</div>
            <ol className="space-y-2 text-xs text-muted-foreground">
              <li>1. Configure encrypted DoA thresholds.</li>
              <li>2. Attach evidence hash and send confidential payment.</li>
              <li>3. Auditor configures encrypted audit test.</li>
              <li>4. Auditor requests finding confirmation.</li>
            </ol>
          </section>
        </aside>

        <section className="min-w-0 rounded-md border bg-white">
          {!isConnected ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center gap-4 p-8 text-center">
              <LockKeyhole className="h-10 w-10 text-slate-500" />
              <div>
                <h2 className="text-xl font-semibold">Connect a wallet to enter the scoped registry console.</h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Business owners are discovered through the factory when configured. Auditors must use a registry-scoped link or enter a registry address.
                </p>
              </div>
              <ConnectButton />
            </div>
          ) : !auditRegistry ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center gap-3 p-8 text-center">
              <Link2 className="h-10 w-10 text-slate-500" />
              <h2 className="text-xl font-semibold">No registry selected.</h2>
              <p className="max-w-xl text-sm text-muted-foreground">
                Set `NEXT_PUBLIC_COMPLYR_FACTORY_ADDRESS` for automatic business discovery, or paste an AuditRegistry address into the scope panel.
              </p>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="border-b p-3">
                <TabsList className="grid h-auto w-full grid-cols-2 lg:grid-cols-6">
                  <TabsTrigger value="payments">Payments</TabsTrigger>
                  <TabsTrigger value="ledger">Ledger</TabsTrigger>
                  <TabsTrigger value="doa">DoA</TabsTrigger>
                  <TabsTrigger value="access">Access</TabsTrigger>
                  <TabsTrigger value="tests">Tests</TabsTrigger>
                  <TabsTrigger value="findings">Findings</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="payments" className="m-0">
                <PaymentPanel auditRegistry={auditRegistry} />
              </TabsContent>
              <TabsContent value="ledger" className="m-0">
                <LedgerPanel auditRegistry={auditRegistry} accessTier={Number(access || 0)} isOwner={isOwner} />
              </TabsContent>
              <TabsContent value="doa" className="m-0">
                <DoaPanel auditRegistry={auditRegistry} canWrite={isOwner} />
              </TabsContent>
              <TabsContent value="access" className="m-0">
                <AccessPanel auditRegistry={auditRegistry} canWrite={isOwner} />
              </TabsContent>
              <TabsContent value="tests" className="m-0">
                <TestsPanel reviewRegistry={reviewRegistry} canWrite={Number(access || 0) >= 2} auditor={address} />
              </TabsContent>
              <TabsContent value="findings" className="m-0">
                <FindingsPanel auditRegistry={auditRegistry} reviewRegistry={reviewRegistry} auditor={address} mode={mode} />
              </TabsContent>
            </Tabs>
          )}
        </section>
      </main>
    </div>
  );
}

function PaymentPanel({ auditRegistry }: { auditRegistry: `0x${string}` }) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [recipient, setRecipient] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [category, setCategory] = React.useState("0");
  const [invoiceHash, setInvoiceHash] = React.useState<`0x${string}`>(ZERO_BYTES32);
  const [poHash, setPoHash] = React.useState<`0x${string}`>(ZERO_BYTES32);
  const [evidenceName, setEvidenceName] = React.useState("");

  async function onEvidence(file?: File) {
    if (!file) return;
    const digest = await hashFile(file);
    setInvoiceHash(digest);
    setEvidenceName(file.name);
    toast.success("Evidence hashed locally. The file was not uploaded.");
  }

  async function submit() {
    if (!isAddressLike(CONFIDENTIAL_USDC_ADDRESS || "")) {
      toast.error("Set NEXT_PUBLIC_CONFIDENTIAL_USDC_ADDRESS before sending payments.");
      return;
    }
    if (!isAddressLike(recipient)) {
      toast.error("Enter a valid recipient address.");
      return;
    }
    const encrypted = await encryptInput({ amount, category: Number(category) });
    await writeContractAsync({
      address: CONFIDENTIAL_USDC_ADDRESS,
      abi: confidentialUsdcAbi,
      functionName: "confidentialTransferAndCallWithAudit",
      args: [
        auditRegistry,
        encrypted.encryptedAmount,
        encrypted.inputProofAmount,
        {
          category: encrypted.encryptedCategory,
          inputProof: encrypted.inputProofCategory,
          recipient,
          invoiceHash,
          poHash,
        },
      ],
    });
    toast.success("Confidential payment submitted to AuditRegistry callback.");
  }

  return (
    <div className="grid gap-5 p-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <SectionTitle icon={ReceiptText} title="Payment Instruction" text="The amount is encrypted before it is sent to ConfidentialUSDC." />
        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <Field label="Recipient">
            <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x..." className="font-mono" />
          </Field>
          <Field label="Amount">
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" type="number" min="0" step="0.01" />
          </Field>
        </div>
        <SectionTitle icon={ClipboardCheck} title="Audit Record" text="Spend Category is encrypted and bound to the token callback." />
        <Field label="Spend Category">
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
            {spendCategories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <SectionTitle icon={FileCheck2} title="Evidence" text="Only the SHA-256 fingerprint is recorded on-chain." />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Invoice Evidence File">
            <Input type="file" onChange={(event) => onEvidence(event.target.files?.[0])} />
          </Field>
          <Field label="PO Hash">
            <Input value={poHash} onChange={(event) => isBytes32(event.target.value) && setPoHash(event.target.value)} className="font-mono text-xs" />
          </Field>
        </div>
        <div className="rounded-md border bg-slate-50 p-3 text-xs text-muted-foreground">
          {evidenceName ? (
            <div>
              <span className="font-medium text-slate-900">{evidenceName}</span> hashed to{" "}
              <span className="font-mono">{shortHex(invoiceHash, 8)}</span>.
            </div>
          ) : (
            "Your document is not uploaded or stored by Complyr. Attach a file to compute a local hash."
          )}
        </div>
        <Button onClick={submit} disabled={isPending} className="w-full bg-slate-950 text-white hover:bg-slate-800">
          {isPending ? "Submitting..." : "Encrypt and Confirm Payment"}
        </Button>
      </div>
      <ChainOfCustody />
    </div>
  );
}

function ChainOfCustody() {
  return (
    <div className="rounded-md border bg-[#fbfbfa] p-4">
      <h3 className="mb-3 text-sm font-semibold">Chain of Custody Preview</h3>
      {[
        "Amount encrypted in client/API boundary",
        "Spend Category encrypted as euint8",
        "ConfidentialUSDC transfers to AuditRegistry",
        "AuditRegistry records callback payment",
        "ReviewTestRegistry evaluates active tests",
        "Findings require auditor confirmation",
      ].map((item, index) => (
        <div key={item} className="flex gap-3 border-l pb-4 pl-3 text-sm last:pb-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white text-xs">{index + 1}</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function DoaPanel({ auditRegistry, canWrite }: { auditRegistry: `0x${string}`; canWrite: boolean }) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [manager, setManager] = React.useState("");
  const [director, setDirector] = React.useState("");
  const [board, setBoard] = React.useState("");

  async function submit() {
    const encrypted = await encryptInput({ thresholds: { manager, director, board } });
    await writeContractAsync({
      address: auditRegistry,
      abi: auditRegistryAbi,
      functionName: "setAuthTierThresholds",
      args: [
        encrypted.encryptedThresholds.manager,
        encrypted.encryptedThresholds.director,
        encrypted.encryptedThresholds.board,
        encrypted.inputProofThreshold,
      ],
    });
    toast.success("Encrypted DoA thresholds submitted.");
  }

  return (
    <div className="p-5">
      <SectionTitle icon={SlidersHorizontal} title="Delegation of Authority" text="Thresholds become encrypted handles after submission. Auditors see required level, not exact thresholds." />
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Tier</th>
              <th className="p-3">Threshold</th>
              <th className="p-3">Authorization</th>
              <th className="p-3">Post-save state</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[
              ["Manager", manager, setManager],
              ["Director", director, setDirector],
              ["Board", board, setBoard],
            ].map(([tierName, value, setter]) => (
              <tr key={tierName as string}>
                <td className="p-3 font-medium">{tierName as string}</td>
                <td className="p-3">
                  <Input value={value as string} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)} type="number" />
                </td>
                <td className="p-3">Required above threshold</td>
                <td className="p-3">
                  <Badge className="border-blue-200 bg-blue-50 text-blue-700">Encrypted handle</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button className="mt-4 bg-slate-950 text-white hover:bg-slate-800" disabled={!canWrite || isPending} onClick={submit}>
        {canWrite ? (isPending ? "Saving..." : "Encrypt and Save Thresholds") : "Owner wallet required"}
      </Button>
    </div>
  );
}

function AccessPanel({ auditRegistry, canWrite }: { auditRegistry: `0x${string}`; canWrite: boolean }) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [auditor, setAuditor] = React.useState("");
  const [tier, setTier] = React.useState("1");
  const [approver, setApprover] = React.useState("");
  const auditUrl = typeof window === "undefined" ? "" : `${window.location.origin}/audit?registry=${auditRegistry}`;

  async function grantAuditor() {
    if (!isAddressLike(auditor)) return toast.error("Enter a valid auditor address.");
    await writeContractAsync({
      address: auditRegistry,
      abi: auditRegistryAbi,
      functionName: "setAuditorAccess",
      args: [auditor, Number(tier)],
    });
    toast.success("Auditor access updated.");
  }

  async function authorizeApprover() {
    if (!isAddressLike(approver)) return toast.error("Enter a valid approver address.");
    await writeContractAsync({
      address: auditRegistry,
      abi: auditRegistryAbi,
      functionName: "setAuthorizedApprover",
      args: [approver, true],
    });
    toast.success("Approver authorized.");
  }

  return (
    <div className="grid gap-5 p-5 xl:grid-cols-2">
      <div className="space-y-4">
        <SectionTitle icon={UserCheck} title="Auditor Access" text="Access is per AuditRegistry, not global." />
        <Field label="Auditor Wallet">
          <Input value={auditor} onChange={(event) => setAuditor(event.target.value)} className="font-mono" placeholder="0x..." />
        </Field>
        <Field label="Access Tier">
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={tier} onChange={(event) => setTier(event.target.value)}>
            {accessTiers.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Button disabled={!canWrite || isPending} onClick={grantAuditor} className="bg-slate-950 text-white hover:bg-slate-800">
          {canWrite ? "Set Auditor Access" : "Owner wallet required"}
        </Button>
        <div className="rounded-md border bg-slate-50 p-3 text-xs">
          Shareable auditor URL: <span className="font-mono">{auditUrl}</span>
        </div>
      </div>
      <div className="space-y-4">
        <SectionTitle icon={BadgeCheck} title="Approver Authorization" text="Only authorized approvers can approve payments. SoD violations are detective findings." />
        <Field label="Approver Wallet">
          <Input value={approver} onChange={(event) => setApprover(event.target.value)} className="font-mono" placeholder="0x..." />
        </Field>
        <Button disabled={!canWrite || isPending} onClick={authorizeApprover} variant="outline">
          Authorize Approver
        </Button>
      </div>
    </div>
  );
}

function TestsPanel({
  reviewRegistry,
  canWrite,
  auditor,
}: {
  reviewRegistry?: `0x${string}`;
  canWrite: boolean;
  auditor?: `0x${string}`;
}) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [testType, setTestType] = React.useState("0");
  const [threshold, setThreshold] = React.useState("");
  const [priority, setPriority] = React.useState("2");
  const [scope, setScope] = React.useState("0");
  const [frequency, setFrequency] = React.useState("0");

  async function createTest() {
    if (!reviewRegistry) return toast.error("ReviewTestRegistry is not set.");
    const encrypted = await encryptInput({ threshold });
    await writeContractAsync({
      address: reviewRegistry,
      abi: reviewTestRegistryAbi,
      functionName: "createTest",
      args: [Number(testType), Number(scope), encrypted.encryptedThreshold, encrypted.inputProofThreshold, Number(priority), Number(frequency)],
    });
    toast.success("Encrypted audit test configured.");
  }

  return (
    <div className="grid gap-5 p-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <SectionTitle icon={Activity} title="Audit Test Registry" text="Auditors configure encrypted thresholds. The business cannot read the plaintext limit." />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Test Type">
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={testType} onChange={(event) => setTestType(event.target.value)}>
              {testTypes.filter((item) => item.value !== 2 && item.value !== 6).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Threshold">
            <Input value={threshold} onChange={(event) => setThreshold(event.target.value)} type="number" />
          </Field>
          <Field label="Priority">
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={priority} onChange={(event) => setPriority(event.target.value)}>
              {priorities.slice(1).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category Scope">
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={scope} onChange={(event) => setScope(event.target.value)} disabled={Number(testType) !== 4}>
              {spendCategories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monitoring Frequency">
            <Input value={frequency} onChange={(event) => setFrequency(event.target.value)} type="number" min="0" />
          </Field>
        </div>
        <Button disabled={!canWrite || !reviewRegistry || isPending} onClick={createTest} className="bg-slate-950 text-white hover:bg-slate-800">
          {canWrite ? "Encrypt and Create Test" : "Analytics or Full auditor access required"}
        </Button>
      </div>
      <div className="rounded-md border bg-slate-50 p-4">
        <h3 className="mb-3 text-sm font-semibold">Configured Test Handles</h3>
        {auditor && reviewRegistry ? <TestReadout reviewRegistry={reviewRegistry} auditor={auditor} /> : <p className="text-sm text-muted-foreground">Connect an auditor wallet and registry.</p>}
      </div>
    </div>
  );
}

function TestReadout({ reviewRegistry, auditor }: { reviewRegistry: `0x${string}`; auditor: `0x${string}` }) {
  return (
    <div className="space-y-2">
      {testTypes.slice(0, 6).map((test) => (
        <TestReadoutRow key={test.value} reviewRegistry={reviewRegistry} auditor={auditor} testType={test.value} />
      ))}
    </div>
  );
}

function TestReadoutRow({ reviewRegistry, auditor, testType }: { reviewRegistry: `0x${string}`; auditor: `0x${string}`; testType: number }) {
  const { data } = useReadContract({
    address: reviewRegistry,
    abi: reviewTestRegistryAbi,
    functionName: "getTest",
    args: [auditor, testType],
    query: { retry: false },
  });
  const row = data as readonly [number, number, number, boolean, `0x${string}`] | undefined;
  const test = testTypes[testType];
  return (
    <div className="flex items-center justify-between gap-3 rounded border bg-white p-2 text-xs">
      <span>{test.label}</span>
      {row?.[3] ? <Badge className="border-blue-200 bg-blue-50 text-blue-700">{shortHex(row[4])}</Badge> : <Badge>Not configured</Badge>}
    </div>
  );
}

function LedgerPanel({ auditRegistry, accessTier, isOwner }: { auditRegistry: `0x${string}`; accessTier: number; isOwner: boolean }) {
  const { data: count } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "paymentCount",
  });
  const paymentCount = Number(count || BigInt(0));
  const ids = Array.from({ length: Math.min(paymentCount, 12) }, (_, index) => paymentCount - index - 1);

  return (
    <div className="p-5">
      <SectionTitle icon={ReceiptText} title="Payment Records / Audit Ledger" text="Rows are read through AuditRegistry access checks. Values without ACL appear as encrypted handles." />
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Payment</th>
              <th className="p-3">Parties</th>
              <th className="p-3">Evidence</th>
              <th className="p-3">Approval</th>
              <th className="p-3">Encrypted Handles</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ids.length ? ids.map((id) => <PaymentRow key={id} auditRegistry={auditRegistry} id={BigInt(id)} accessTier={accessTier} isOwner={isOwner} />) : null}
          </tbody>
        </table>
        {!ids.length && <div className="p-8 text-center text-sm text-muted-foreground">No payment records have been recorded through the token callback.</div>}
      </div>
    </div>
  );
}

function PaymentRow({ auditRegistry, id, accessTier, isOwner }: { auditRegistry: `0x${string}`; id: bigint; accessTier: number; isOwner: boolean }) {
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: meta } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "getPaymentMeta",
    args: [id],
    query: { retry: false },
  });
  const { data: handles } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "getPaymentHandles",
    args: [id],
    query: { retry: false, enabled: isOwner || accessTier === 3 },
  });
  const m = meta as readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, number, boolean] | undefined;
  const h = handles as readonly [`0x${string}`, `0x${string}`, `0x${string}`] | undefined;

  async function approve() {
    await writeContractAsync({
      address: auditRegistry,
      abi: auditRegistryAbi,
      functionName: "approvePayment",
      args: [id],
    });
    toast.success("Payment approval submitted.");
  }

  return (
    <tr>
      <td className="p-3 align-top">
        <div className="font-mono text-xs">PAY-{id.toString().padStart(4, "0")}</div>
        <div className="text-xs text-muted-foreground">Block {m?.[5] || "access controlled"}</div>
      </td>
      <td className="p-3 align-top text-xs">
        {m ? (
          <>
            <div>From <span className="font-mono">{shortHex(m[0])}</span></div>
            <div>To <span className="font-mono">{shortHex(m[1])}</span></div>
          </>
        ) : (
          <Badge className="border-blue-200 bg-blue-50 text-blue-700">Encrypted / access controlled</Badge>
        )}
      </td>
      <td className="p-3 align-top text-xs">
        <div>Invoice <span className="font-mono">{shortHex(m?.[3])}</span></div>
        <div>PO <span className="font-mono">{shortHex(m?.[4])}</span></div>
      </td>
      <td className="p-3 align-top">
        <div className="mb-2">{m?.[6] ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Approved</Badge> : <Badge className="border-amber-200 bg-amber-50 text-amber-700">Pending</Badge>}</div>
        <Button size="sm" variant="outline" onClick={approve} disabled={isPending || m?.[6]}>
          Approve
        </Button>
      </td>
      <td className="space-y-1 p-3 align-top text-xs">
        {h ? (
          <>
            <div>Amount <span className="font-mono">{shortHex(h[0])}</span></div>
            <div>Category <span className="font-mono">{shortHex(h[1])}</span></div>
            <div>Auth <span className="font-mono">{shortHex(h[2])}</span></div>
          </>
        ) : (
          <Badge className="border-blue-200 bg-blue-50 text-blue-700">Handles hidden by contract ACL</Badge>
        )}
      </td>
    </tr>
  );
}

function FindingsPanel({
  auditRegistry,
  reviewRegistry,
  auditor,
}: {
  auditRegistry: `0x${string}`;
  reviewRegistry?: `0x${string}`;
  auditor?: `0x${string}`;
  mode: ConsoleMode;
}) {
  const { data: findingCount } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "findingCount",
  });
  const { data: auditorCount } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "auditorFindingCount",
    args: auditor ? [auditor] : undefined,
    query: { enabled: Boolean(auditor) },
  });
  const total = Number(findingCount || BigInt(0));
  const auditorTotal = Number(auditorCount || BigInt(0));
  const ids = Array.from({ length: Math.min(total, 12) }, (_, index) => total - index - 1);

  return (
    <div className="p-5">
      <SectionTitle icon={KeyRound} title="Findings Feed" text="Gateway integration is represented by requestFindingCreation and the current placeholder recordFindingIfTriggered path in the contract." />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Metric label="Total findings" value={String(total)} />
        <Metric label="Findings linked to wallet" value={String(auditorTotal)} />
        <Metric label="Lifecycle" value="Signal -> Confirmed -> Response -> Cleared" />
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Finding</th>
              <th className="p-3">Test</th>
              <th className="p-3">Severity</th>
              <th className="p-3">Flagged Handle</th>
              <th className="p-3">Gateway Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ids.map((id) => (
              <FindingRow key={id} auditRegistry={auditRegistry} reviewRegistry={reviewRegistry} id={BigInt(id)} />
            ))}
          </tbody>
        </table>
        {!ids.length && <div className="p-8 text-center text-sm text-muted-foreground">No findings confirmed yet.</div>}
      </div>
    </div>
  );
}

function FindingRow({ auditRegistry, reviewRegistry, id }: { auditRegistry: `0x${string}`; reviewRegistry?: `0x${string}`; id: bigint }) {
  const { writeContractAsync, isPending } = useWriteContract();
  const { data } = useReadContract({
    address: auditRegistry,
    abi: auditRegistryAbi,
    functionName: "getFinding",
    args: [id],
    query: { retry: false },
  });
  const row = data as readonly [bigint, number, number, `0x${string}`, number, `0x${string}`, boolean] | undefined;
  const test = row ? testTypes[row[1]] : undefined;
  const severity = row ? priorities[row[2]] : undefined;

  async function requestGateway() {
    if (!reviewRegistry || !row) return;
    await writeContractAsync({
      address: reviewRegistry,
      abi: reviewTestRegistryAbi,
      functionName: "requestFindingCreation",
      args: [row[0], row[1]],
    });
    toast.success("Finding confirmation requested.");
  }

  async function confirmTriggered() {
    if (!reviewRegistry || !row) return;
    await writeContractAsync({
      address: reviewRegistry,
      abi: reviewTestRegistryAbi,
      functionName: "recordFindingIfTriggered",
      args: [row[0], row[1], true],
    });
    toast.success("Triggered finding submitted.");
  }

  return (
    <tr>
      <td className="p-3 font-mono text-xs">FND-{id.toString().padStart(4, "0")}</td>
      <td className="p-3">{test ? `${test.label} (${test.assertion})` : <Badge>Access controlled</Badge>}</td>
      <td className="p-3">{severity ? <Badge className={severity.tone}>{severity.label}</Badge> : <Badge>Encrypted signal</Badge>}</td>
      <td className="p-3 font-mono text-xs">{row ? shortHex(row[3]) : <Badge className="border-blue-200 bg-blue-50 text-blue-700">Hidden by ACL</Badge>}</td>
      <td className="space-x-2 p-3">
        <Button size="sm" variant="outline" disabled={!reviewRegistry || !row || isPending} onClick={requestGateway}>
          Request
        </Button>
        <Button size="sm" disabled={!reviewRegistry || !row || isPending} onClick={confirmTriggered}>
          Confirm
        </Button>
      </td>
    </tr>
  );
}

function SectionTitle({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-600" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
