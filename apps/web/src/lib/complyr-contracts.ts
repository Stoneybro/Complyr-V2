import type { Abi } from "viem";

export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export const FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_COMPLYR_FACTORY_ADDRESS || "") as `0x${string}`;

export const CONFIDENTIAL_USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_CONFIDENTIAL_USDC_ADDRESS || "") as `0x${string}`;

export const isAddressLike = (value: string): value is `0x${string}` =>
  /^0x[a-fA-F0-9]{40}$/.test(value);

export const isBytes32 = (value: string): value is `0x${string}` =>
  /^0x[a-fA-F0-9]{64}$/.test(value);

export const accessTiers = [
  { value: 0, label: "None", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: 1, label: "Signal", tone: "bg-slate-100 text-slate-700 border-slate-300" },
  { value: 2, label: "Analytics", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: 3, label: "Full", tone: "bg-violet-50 text-violet-700 border-violet-200" },
] as const;

export const spendCategories = [
  { value: 0, contract: "OPEX", label: "Operating Expenses" },
  { value: 1, contract: "CAPEX", label: "Capital Expenditure" },
  { value: 2, contract: "PAYROLL", label: "Payroll" },
  { value: 3, contract: "PROFESSIONAL", label: "Professional Services" },
  { value: 4, contract: "INTERCOMPANY", label: "Intercompany Transfer" },
  { value: 5, contract: "TAX", label: "Tax Payments" },
  { value: 6, contract: "DEBT_SERVICE", label: "Debt Service" },
  { value: 7, contract: "OTHER", label: "Unclassified" },
] as const;

export const testTypes = [
  { value: 0, label: "Materiality", assertion: "Occurrence, Accuracy" },
  { value: 1, label: "Authorization Breach", assertion: "Authorization" },
  { value: 2, label: "Segregation of Duties", assertion: "Authorization" },
  { value: 3, label: "Missing Evidence", assertion: "Occurrence" },
  { value: 4, label: "Category Concentration", assertion: "Classification" },
  { value: 5, label: "Recipient Concentration", assertion: "Completeness" },
  { value: 6, label: "Structuring", assertion: "Deferred V2" },
] as const;

export const priorities = [
  { value: 0, label: "Disabled", tone: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: 1, label: "Low", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: 2, label: "Medium", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  { value: 3, label: "Critical", tone: "bg-red-50 text-red-700 border-red-200" },
] as const;

export const authLevels = ["Routine", "Manager", "Director", "Board"] as const;

export const factoryAbi = [
  {
    type: "function",
    name: "getRegistry",
    stateMutability: "view",
    inputs: [{ name: "business", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "auditRegistry", type: "address" },
          { name: "reviewTestRegistry", type: "address" },
          { name: "active", type: "bool" },
          { name: "deployedAtBlock", type: "uint256" },
        ],
      },
    ],
  },
] as const satisfies Abi;

export const auditRegistryAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "reviewTestRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "authThresholdsConfigured",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "paymentCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "findingCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "auditorFindingCount",
    stateMutability: "view",
    inputs: [{ name: "auditor", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "auditorFindingAt",
    stateMutability: "view",
    inputs: [
      { name: "auditor", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "auditorAccess",
    stateMutability: "view",
    inputs: [{ name: "auditor", type: "address" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "authorizedApprovers",
    stateMutability: "view",
    inputs: [{ name: "approver", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getPaymentMeta",
    stateMutability: "view",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "approver", type: "address" },
      { name: "invoiceHash", type: "bytes32" },
      { name: "poHash", type: "bytes32" },
      { name: "blockNumber", type: "uint32" },
      { name: "approved", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getPaymentHandles",
    stateMutability: "view",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [
      { name: "amount", type: "bytes32" },
      { name: "category", type: "bytes32" },
      { name: "authLevel", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "getCategoryTotal",
    stateMutability: "view",
    inputs: [{ name: "category", type: "uint8" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "getFinding",
    stateMutability: "view",
    inputs: [{ name: "findingId", type: "uint256" }],
    outputs: [
      { name: "paymentId", type: "uint256" },
      { name: "testType", type: "uint8" },
      { name: "severity", type: "uint8" },
      { name: "flaggedHandle", type: "bytes32" },
      { name: "triggeredAtBlock", type: "uint32" },
      { name: "narrativeHash", type: "bytes32" },
      { name: "escalated", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "setAuthTierThresholds",
    stateMutability: "nonpayable",
    inputs: [
      { name: "managerThreshold", type: "bytes32" },
      { name: "directorThreshold", type: "bytes32" },
      { name: "boardThreshold", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setAuditorAccess",
    stateMutability: "nonpayable",
    inputs: [
      { name: "auditor", type: "address" },
      { name: "access", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setAuthorizedApprover",
    stateMutability: "nonpayable",
    inputs: [
      { name: "approver", type: "address" },
      { name: "authorized", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approvePayment",
    stateMutability: "nonpayable",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [],
  },
] as const satisfies Abi;

export const reviewTestRegistryAbi = [
  {
    type: "function",
    name: "activeAuditorCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getTest",
    stateMutability: "view",
    inputs: [
      { name: "auditor", type: "address" },
      { name: "testType", type: "uint8" },
    ],
    outputs: [
      { name: "priority", type: "uint8" },
      { name: "scope", type: "uint8" },
      { name: "monitoringFrequency", type: "uint16" },
      { name: "exists", type: "bool" },
      { name: "threshold", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "createTest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "testType", type: "uint8" },
      { name: "scope", type: "uint8" },
      { name: "encThreshold", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
      { name: "priority", type: "uint8" },
      { name: "monitoringFrequency", type: "uint16" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "disableTest",
    stateMutability: "nonpayable",
    inputs: [{ name: "testType", type: "uint8" }],
    outputs: [],
  },
  {
    type: "function",
    name: "requestFindingCreation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "uint256" },
      { name: "testType", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "recordFindingIfTriggered",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "uint256" },
      { name: "testType", type: "uint8" },
      { name: "triggered", type: "bool" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export const confidentialUsdcAbi = [
  {
    type: "function",
    name: "confidentialTransferAndCallWithAudit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "bytes32" },
      { name: "amountProof", type: "bytes" },
      {
        name: "fields",
        type: "tuple",
        components: [
          { name: "category", type: "bytes32" },
          { name: "inputProof", type: "bytes" },
          { name: "recipient", type: "address" },
          { name: "invoiceHash", type: "bytes32" },
          { name: "poHash", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const satisfies Abi;

export function shortHex(value?: string, chars = 6) {
  if (!value) return "Not set";
  if (value.length <= chars * 2 + 2) return value;
  return `${value.slice(0, chars + 2)}...${value.slice(-chars)}`;
}

export async function hashFile(file: File): Promise<`0x${string}`> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}
