<div align="center">

<img src="./apps/web/public/complyrlogo-light.svg" alt="Complyr" width="90" height="90" />

# Complyr

### Your auditor gets findings. Not access.

<br />

[![Live Demo](https://img.shields.io/badge/Live%20Demo-usecomplyr.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://usecomplyr.vercel.app)

<br />

![Zama FHE](https://img.shields.io/badge/Zama-Fully%20Homomorphic%20Encryption-FF6B35?style=flat-square)
![ERC-7984](https://img.shields.io/badge/ERC--7984-Confidential%20Token-3C3C3D?style=flat-square&logo=ethereum&logoColor=white)
![Ethereum Sepolia](https://img.shields.io/badge/Ethereum%20Sepolia-3C3C3D?style=flat-square&logo=ethereum&logoColor=white)
![ISA Standards](https://img.shields.io/badge/ISA%20Audit%20Standards-Big%204%20Methodology-0066CC?style=flat-square)

</div>

---

## What Complyr Is

Complyr is onchain business payments with a built-in encrypted compliance layer, modelled after the audit methodology used by Deloitte, KPMG, EY, and PwC.

Every payment permanently attaches encrypted audit records directly to the transaction. External auditors — investors with contractual audit rights, institutional counterparties requiring AML/CFT attestations, or compliance monitors — configure and run ISA-standard audit tests against those records without the data ever being decrypted on-chain. The contract evaluates audit logic directly on ciphertext using Fully Homomorphic Encryption.

**Auditors get findings. The business's financial details stay private.**

The payment token is a confidential ERC-7984 token (cUSDC). The audit record's encrypted amount is pulled directly from the token transfer callback — not self-reported by the sender. This cryptographically binds the audit record to the actual movement of funds. **You cannot fake compliance by reporting a different number than what moved.**

---

## The Problem

Regulated businesses — DAOs with investor audit rights, payment processors needing AML attestations from banking partners, DeFi protocols making operational payments — face compliance obligations from external parties who have a contractual or legal right to audit them but not an unconditional right to see everything.

The current options are:

- **Hand over your entire financial history.** This exposes every vendor relationship, salary, and spending pattern. It is a competitive liability and an operational risk.
- **Refuse and lose the institutional relationship.** No institutional partner, regulated bank, or serious investor will accept "trust us" without audit access.

Complyr gives a third option: an external party runs real, ISA-standard compliance tests against your payment history and only ever sees the specific records that actually fail a test.

Traditional finance doesn't have this problem because regulators compel full access under law. In crypto, where you're already on a public chain, the problem is worse — you can't selectively disclose. FHE on a public chain is what closes that gap.

---

## Why FHE Is the Right Tool Here (Not ZK)

A common question: why not zero-knowledge proofs?

ZK proofs are excellent for proving membership in a fixed set — "this transaction is valid," "this address is on a whitelist." They are poor tools for **running arbitrary audit logic over private accumulated state**.

Complyr's audit tests operate on running totals — encrypted cumulative spend by GL category, by recipient, by authorization level. These totals grow with every payment. The set of possible values is unbounded. Generating a ZK proof over an unbounded, evolving FHE-managed state would require the prover to know the plaintext, defeating the purpose.

FHE allows the contract to perform addition, comparison, and conditional selection **directly on ciphertexts** without a prover and without revealing the plaintext at any point. The contract never decrypts. The rollup state is always encrypted. This is the only cryptographic primitive that supports the combination of:

1. Continuous accumulation of encrypted state
2. Threshold comparisons over that state
3. No trusted prover or decryption event

---

## How It Works

### 1 — Business Onboarding (Owner-only Gate)

Before any payment can be recorded, the business owner configures the Delegation of Authority (DoA) policy — the encrypted amount thresholds that define which payments require manager, director, or board-level authorization:

```solidity
registry.setAuthTierThresholds(
    encManagerThreshold,   // e.g. payments > $10k need manager sign-off
    encDirectorThreshold,  // e.g. payments > $100k need director sign-off
    encBoardThreshold,     // e.g. payments > $500k need board resolution
    inputProof
);
```

These thresholds are encrypted client-side before submission. The auditors never see them. The business cannot change them without losing the `authThresholdsConfigured` gate — no payment is recorded until thresholds are set.

This is modelled after the real-world process used by external audit firms: the first step of any audit engagement is reviewing and agreeing on the client's Delegation of Authority policy.

### 2 — Payment with Encrypted Audit Record

When a business sends a payment, one audit field is encrypted client-side before the transaction is submitted:

| Field | Type | Set by | Encrypted? |
|---|---|---|---|
| `category` | GL category (OPEX/CAPEX/PAYROLL/PROFESSIONAL/INTERCOMPANY/TAX/DEBT_SERVICE/OTHER) | Business | ✅ Yes — FHE ciphertext |
| `recipient` | Payment destination | Business | ❌ Plaintext |
| `invoiceHash` | `keccak256` of supporting invoice | Business | ❌ Hash only (document stored off-chain) |
| `poHash` | `keccak256` of purchase order | Business | ❌ Hash only |
| `amount` | Payment value | **Token contract** | ✅ Yes — pulled from transfer callback |
| `authLevel` | DoA authorization tier | **Contract-derived** | ✅ Yes — never caller-supplied |
| `approved` | Authorization status | **`approvePayment()` only** | ❌ Plaintext bool |
| `approver` | Who authorized | **`approvePayment()` only** | ❌ Plaintext address |

**Three fields the business cannot game:**

**`amount`** — flows from `ConfidentialUSDC` into `AuditRegistry` via the `onConfidentialTransferReceived` callback. The sender never touches it after the transfer is initiated. The value in the audit record is the value that moved.

**`authLevel`** — derived entirely on-chain from the encrypted amount using a nested `FHE.select` tree against the owner's DoA thresholds. The contract never accepts an `authLevel` from the caller. A $500k payment cannot be routed through the ROUTINE band to skip board-level authorization.

```solidity
euint8 derivedAuthLevel = FHE.select(
    FHE.gt(amount, _boardThreshold),
    FHE.asEuint8(uint8(AuthLevel.BOARD)),
    FHE.select(
        FHE.gt(amount, _directorThreshold),
        FHE.asEuint8(uint8(AuthLevel.DIRECTOR)),
        FHE.select(
            FHE.gt(amount, _managerThreshold),
            FHE.asEuint8(uint8(AuthLevel.MANAGER)),
            FHE.asEuint8(uint8(AuthLevel.ROUTINE))
        )
    )
);
```

**`approved` / `approver`** — stripped from the payment submission calldata entirely. At creation, these fields are always `false` / `address(0)`. The only path that sets them is `approvePayment()` — a separate on-chain transaction by a different wallet. This closes the self-certification attack: a business cannot submit `approved: true` on their own payment and claim the authorization check passed.

### 3 — Auditor Deploys Tests

The auditor configures ISA-standard compliance rules with encrypted thresholds. The business never sees the thresholds and cannot tune payments to stay just under detection limits.

Tests map directly to ISA audit assertions:

| Test | ISA Assertion | What It Catches |
|---|---|---|
| **MATERIALITY** | Occurrence, Accuracy | Single payment > auditor's threshold |
| **AUTHORIZATION_BREACH** | Authorization | Non-routine payment with no authorization on record |
| **SEGREGATION_OF_DUTIES** | Authorization | Payment initiator approved their own payment |
| **MISSING_EVIDENCE** | Occurrence | Material payment with no supporting invoice hash |
| **CATEGORY_CONCENTRATION** | Classification | Cumulative spend in one GL category exceeds ceiling |
| **RECIPIENT_CONCENTRATION** | Completeness | Cumulative spend to one recipient exceeds ceiling |
| **STRUCTURING** | Occurrence | *(V2 — deferred: requires encrypted band design)* |

Each test has a **priority level** that controls when it runs:

| Priority | Behavior |
|---|---|
| `CRITICAL` | Every payment, unconditionally. Finding severity = highest. |
| `STANDARD` | Every payment |
| `MONITORING` | Every Nth payment to a given recipient (statistical sampling) |
| `NONE` | Disabled |

### 4 — Contract Evaluates Tests On Every Payment (Never Decrypts)

On every payment, `ReviewTestRegistry.evaluateAll()` runs all active tests across all registered auditors directly on ciphertext. No decryption occurs.

```solidity
// Example: MATERIALITY test
ebool result = FHE.gt(amount, testConfig.threshold);
// Neither amount nor threshold was decrypted. The comparison was homomorphic.
```

The encrypted result is stored in `_testResults[auditor][paymentId][testType]`. The tested value is stored in `_testedValues[auditor][paymentId][testType]` — needed for Phase 2 finding creation.

**Gas optimization:** Payment data is read once before the auditor loop, not once per auditor. External rollup fetches (`getCategoryTotal`, `getRecipientTotal`) are guarded — if an auditor hasn't configured the test, the external call doesn't execute. Category rollups use 8 FHE loop iterations (the GL taxonomy) vs the prior 22-iteration design.

### 5 — Two-Phase Finding Creation (Gateway Pattern)

FHE imposes a constraint that shapes the entire finding workflow: **you cannot branch on an encrypted boolean in Solidity.** `if (FHE.gt(amount, threshold)) { createFinding() }` is impossible — the `ebool` is never decrypted on-chain.

Complyr solves this with a two-phase approach:

**Phase 1 (synchronous — during payment recording):**
`evaluateAll` runs. `ebool` results are stored. `TestEvaluated` events are emitted. No findings are created yet. Gas cost is bounded and predictable.

**Phase 2 (auditor-initiated — after evaluation):**
The auditor's system watches `TestEvaluated` events. For each event, the auditor calls `requestFindingCreation(paymentId, testType)`. Their system decrypts the stored `ebool` via the Zama KMS and calls `recordFindingIfTriggered(paymentId, testType, triggered)`:

- If `triggered == false` → return immediately. **No finding, no on-chain trace of the non-triggered test.** An observer sees that evaluation ran, not whether it fired.
- If `triggered == true` → `auditRegistry.recordFinding()` is called. The finding is written with the encrypted `flaggedHandle` — the actual value that crossed the threshold.

This design means auditors control which results they escalate to findings. This is correct: in real ISA-standard auditing, the auditor reviews results and decides what rises to a finding. Automated continuous monitoring is a different product. Complyr is auditor-controlled review tooling.

### 6 — Auditor Reviews Findings

Findings arrive in the auditor portal sorted by plaintext severity (no decryption needed to see the queue). When the auditor investigates, they decrypt the `flaggedHandle` via the Zama KMS client-side. They see the specific encrypted value that triggered the rule. They do not see the rest of the ledger.

The `invoiceHash` and `poHash` stored on-chain enable the real-world three-way match: auditor compares the on-chain payment record against the off-chain invoice and purchase order. If the declared `category` is PAYROLL but the invoice says "Consulting Services," that discrepancy is the auditor's finding, not the contract's — exactly as in a real audit engagement.

---

## Privacy Model

| Party | What They Can See |
|---|---|
| **Business owner** | Their own payment amounts (sender/recipient ACL). That findings were triggered. NOT the auditor's thresholds. |
| **Auditor (SIGNAL access)** | Finding count + severity by test type. No payment amounts. No unflagged records. |
| **Auditor (ANALYTICS access)** | Encrypted rollup totals (category, recipient). Category and authLevel handles per payment. NOT raw amounts. |
| **Auditor (FULL access)** | All of the above + raw payment amount handles. Decrypt individually via KMS. |
| **Public / chain observers** | Encrypted ciphertexts only. Transaction graph (who paid whom, when). |
| **The contract itself** | Operates on ciphertexts throughout. Never holds plaintext amounts during computation. |
| **The factory (post-deployment)** | Nothing. Ownership of both AuditRegistry and ReviewTestRegistry is transferred to the business at deploy time. |

**Auditor access is tiered by design.** An ANALYTICS auditor can test concentration hypotheses (is this business putting too much through one category?) without ever seeing individual payment amounts. They only see raw values when a finding is triggered and they explicitly request decryption. This mirrors how real audit firms operate: the engagement team sees aggregate data first, raw transactions only when something flags.

---

## The Business Isolation Architecture

Each business gets its own isolated `AuditRegistry` and `ReviewTestRegistry` deployed as EIP-1167 minimal proxy clones by `ComplyrFactory`. The factory deploys, wires, and immediately transfers ownership to the business.

```
ComplyrFactory.deployRegistry(businessAddress)
   → clone(auditRegistryImpl)   → auditProxy
   → clone(reviewTestImpl)      → reviewProxy
   → auditProxy.initialize(...)
   → reviewProxy.initialize(...)
   → auditProxy.setReviewTestRegistry(reviewProxy)
   → auditProxy.setAuditorAccess(reviewProxy, FULL)  // wiring grant
   → auditProxy.transferOwnership(business)          // factory loses control
   → reviewProxy.transferOwnership(business)         // factory loses control
```

After deployment, the factory has zero privileged access to any business's data. There is no platform backdoor.

**Why clones instead of one shared contract?** A shared contract pools all businesses' audit state. Rollup totals bleed across businesses. Auditor access grants become complex to scope. Finding queues mix. EIP-1167 clones cost ~$0.10 in gas to deploy (55 bytes of proxy bytecode, forwarding all calls to a shared implementation) and give complete isolation with no code duplication.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Next.js Web App                              │
│  Business payment UI · Auditor portal · FHE browser decrypt          │
└──────────────┬──────────────────────────────┬────────────────────────┘
               │                              │
               │ wagmi/viem + MetaMask        │ Server-side FHE encrypt
               ▼                              ▼
┌──────────────────────────────────┐  ┌──────────────────────────────┐
│       Ethereum Sepolia (fhEVM)   │  │   /api/fhe/encrypt-input     │
│                                  │  │   @zama-fhe/relayer-sdk/node │
│  ConfidentialUSDC (ERC-7984)     │  └──────────────────────────────┘
│  ComplyrFactory                  │
│  ╠═ AuditRegistry (per business) │  ┌──────────────────────────────┐
│  ╚═ ReviewTestRegistry (per biz) │  │   /api/fhe/public-decrypt    │
│                                  │  │   Zama KMS gateway proxy     │
└──────────────────────────────────┘  └──────────────────────────────┘
```

**`AuditRegistry.sol`** is the FHE core. It receives the encrypted amount handle from the token contract via the `onConfidentialTransferReceived` callback, stores `PaymentRecord` structs, maintains blind-accumulation rollups by GL category and recipient, manages `FHE.allow` grants, and exposes the `recordFinding` entry point that only the paired `ReviewTestRegistry` can call.

**`ReviewTestRegistry.sol`** is the audit engine. Auditors configure tests here. `evaluateAll()` runs all active tests per payment. Test results are stored as `ebool` handles. The two-phase finding system turns those results into findings via `recordFindingIfTriggered`.

**Blind accumulation** prevents observers from learning which GL category a payment belongs to by updating all 8 category totals simultaneously on every payment — real amount to the matching bucket, encrypted zero to all others. All 8 ciphertexts update at the same time. A chain observer cannot tell whether a payment was PAYROLL or PROFESSIONAL by watching which bucket changed.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chain | Ethereum Sepolia + Zama fhEVM coprocessors |
| FHE library | `@fhevm/solidity` 0.11.1 |
| Confidential token | `@openzeppelin/confidential-contracts` (ERC-7984) |
| Contract toolchain | Hardhat + TypeChain |
| Frontend | Next.js (App Router), TypeScript |
| Web3 | wagmi v2, viem v2 |
| Wallet | MetaMask (EOA) |
| FHE browser SDK | `@zama-fhe/relayer-sdk` |
| FHE server SDK | `@zama-fhe/relayer-sdk/node` |
| UI | shadcn/ui, Tailwind v4 |

---

## Local Development

**Prerequisites:** Node.js 20+, pnpm, Hardhat.

```bash
git clone https://github.com/Stoneybro/complyrv2
cd complyrv2
pnpm install
```

Create `apps/web/.env.local`:

```bash
# Contract addresses (Sepolia)
NEXT_PUBLIC_CONFIDENTIAL_USDC_ADDRESS=0x...
NEXT_PUBLIC_FACTORY_ADDRESS=0x...

# Zama gateway
NEXT_PUBLIC_ZAMA_GATEWAY_URL=https://gateway.sepolia.zama.ai
```

Run the frontend:

```bash
pnpm dev
```

Run FHE mock contract tests:

```bash
cd packages/contracts
npx hardhat test
```

Deploy to Sepolia:

```bash
cd packages/contracts
npx hardhat deploy --network sepolia
```

---

## Project Structure

```
complyrv2/
├── packages/
│   └── contracts/
│       ├── contracts/
│       │   ├── IComplyrTypes.sol         # Shared struct definitions
│       │   ├── ConfidentialUSDC.sol      # ERC-7984 confidential USDC
│       │   ├── AuditRegistry.sol         # FHE audit core + PaymentRecord storage
│       │   ├── ReviewTestRegistry.sol    # ISA-standard test evaluation engine
│       │   └── ComplyrFactory.sol        # EIP-1167 clone deployer
│       ├── test/                         # TypeScript FHE mock tests
│       └── deploy/                       # Hardhat deploy scripts
└── apps/
    └── web/
        └── src/
            ├── app/
            │   ├── dashboard/            # Business payment + audit view
            │   ├── auditors/[wallet]/    # External auditor portal
            │   └── api/fhe/             # Server-side FHE encrypt + decrypt proxy
            ├── hooks/
            │   ├── usePayment.ts
            │   ├── useAuditLogs.ts
            │   └── useAuditorPortal.ts
            └── lib/
                ├── fhe.ts               # Client-side decrypt helpers
                ├── active-pull.ts       # KMS proof fetch with visible progress
                └── contracts.ts         # ABIs + addresses
```

---

## Key Design Decisions

**Amount integrity is non-negotiable.** The encrypted `amount` in every `PaymentRecord` is pulled from the token transfer callback — the sender never self-reports it. This is the architectural spine of the system. Every compliance claim Complyr makes rests on it.

**`approved` and `approver` are never caller-supplied.** Both fields are always `false` / `address(0)` at payment creation. Only `approvePayment()` — a separate transaction by a different wallet — can set them. This closes the self-certification attack where a business submits `approved: true` on their own payment.

**`authLevel` is contract-derived, never caller-supplied.** Authorization bands are computed by the contract from the encrypted amount using the owner's encrypted DoA thresholds. The business cannot under-declare a payment's authorization requirement. The thresholds are encrypted — the business doesn't know where the cutoffs are.

**Auditor thresholds are encrypted end-to-end.** Test criteria are encrypted in the auditor's browser before submission. The business is never granted `FHE.allow` on threshold ciphertexts and cannot read the auditor's rules — nor tune payments to avoid detection.

**ReviewTestRegistry is not an auditor.** The paired `ReviewTestRegistry` gets direct read access to payment data via a dedicated `reviewTestRegistry` address check in `_canReadPayment` — it is never added to the `_auditors` array. The 5-auditor cap is exclusively for external human auditors.

**Evidence anchors bridge on-chain and off-chain audit.** `invoiceHash` and `poHash` are stored immutably with every payment. They enable auditors to perform three-way matching — verifying that the payment, invoice, and purchase order tell a consistent story. Document content is encrypted to the auditor's key and stored on IPFS. The contract never touches document content.

**Non-triggered tests leave no trace.** When Phase 2 decryption reveals `triggered == false`, the function returns immediately with no state change. A chain observer can see that a `requestFindingCreation` call was made — not whether the test fired. The privacy of non-triggering payments is preserved.

**`FHE.allow` is documented at every callsite.** Every function that creates or receives an encrypted handle has inline comments listing exactly which addresses receive access and why. ACL hygiene is enforced at code review.

**Business isolation via factory.** Every business gets their own isolated clone pair. The factory transfers ownership immediately post-deployment and retains zero privileged access. No platform backdoor exists — verifiable on-chain.

---

## Limitations

- **Testnet only.** Deployed on Ethereum Sepolia. Not audited for production use.
- **Auditor revocation is not retroactive.** Removing an auditor revokes future access and new record grants, but does not retroactively remove cryptographic KMS access to past handles. This is a fundamental FHE property — the KMS cannot "un-grant" previously issued decryption keys.
- **AUTHORIZATION_BREACH is a partial check (V1).** The test catches unapproved non-routine payments. It does not verify that the approver holds sufficient organizational authority for the payment's authorization level — that requires an on-chain `AuthorityRegistry` mapping addresses to roles (planned for V2).
- **STRUCTURING is deferred (V2).** Detecting "payment just below the approval threshold" requires an encrypted band comparison tied to the encrypted DoA thresholds. The design — whether to use an independent auditor-configured band or derive it from the DoA thresholds — requires a separate design session.
- **`category` is self-reported.** The GL category declared by the sender has no on-chain enforcement. Misclassification is possible. The `invoiceHash`/`poHash` evidence anchors provide the off-chain verification path. Misclassification patterns discovered during investigation are themselves audit findings.
- **No automated regulatory reporting.** Complyr provides private audit infrastructure. It does not natively enforce tax withholding or file regulatory reports.

---

<div align="center">

Built for the [Zama Developer Program — Season 3](https://www.zama.ai/).

</div>