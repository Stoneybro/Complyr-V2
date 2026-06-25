# Complyr — Development Plan V2

> External compliance monitoring for onchain business payments, built on Zama fhEVM.

---

## What Complyr Is

Complyr is an onchain business payments system with a built-in encrypted compliance layer, modelled after the audit methodology used by Deloitte, KPMG, EY, and PwC.

Every payment permanently attaches encrypted audit records directly to the transaction. External auditors — investors with contractual audit rights, institutional counterparties requiring AML/CFT attestations, or compliance monitors — configure and run ISA-standard audit tests against those records without the data ever being decrypted on-chain. The contract evaluates audit logic directly on ciphertext using Fully Homomorphic Encryption.

**Auditors get findings. The business's financial details stay private.**

The payment token is a confidential ERC-7984 token (cUSDC). The audit record's encrypted amount is pulled directly from the token transfer callback — not self-reported by the sender. This cryptographically binds the audit record to the actual movement of funds. **You cannot fake compliance by reporting a different number than what moved.**

> **"Your auditor gets findings. Not access."**

---

## Why FHE, Not ZK

ZK proofs are excellent for proving membership in a fixed set. They are poor tools for running arbitrary audit logic over private accumulated state that grows with every payment.

Complyr's audit tests operate on running totals — encrypted cumulative spend by GL category, by recipient, by authorization level. These totals are unbounded and evolve continuously. Generating a ZK proof over an unbounded, evolving state would require the prover to know the plaintext, defeating the purpose.

FHE allows the contract to perform addition, comparison, and conditional selection **directly on ciphertexts** — no prover, no decryption event, no trusted setup. This is the only cryptographic primitive that supports:

1. Continuous accumulation of encrypted state
2. Threshold comparisons over that state
3. No trusted prover and no on-chain decryption event

---

## Product Scope

**In scope:**
- Business-to-business payments using a confidential ERC-7984 USDC wrapper
- Encrypted audit records attached to every payment (see record structure below)
- Per-business isolated deployment via EIP-1167 clone factory
- Auditor portal: configure encrypted ISA-standard tests, receive findings, decrypt flagged records
- 6 active test types in V1 (STRUCTURING deferred to V2 — see Limitations)
- Test priority levels (Critical / Standard / Monitoring)
- Two-phase finding creation via FHEVM Gateway decryption callback
- Document hash anchors (invoiceHash + poHash) for off-chain three-way matching

**Out of scope for V1:**
- Account abstraction / smart account wallets
- Off-chain indexers
- STRUCTURING test (deferred — design decision on encrypted band pending)
- AUTHORIZATION_BREACH approver authority level check (deferred — requires on-chain AuthorityRegistry)
- Mainnet deployment
- Tax withholding or automated regulatory reporting

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chain | Ethereum Sepolia + Zama fhEVM coprocessors |
| Contract language | Solidity 0.8.27 |
| FHE library | `@fhevm/solidity` 0.11.1 |
| Confidential token | `@openzeppelin/confidential-contracts` (ERC-7984) |
| Contract toolchain | Hardhat + TypeChain |
| FHE test harness | `@fhevm/hardhat-plugin` (local mock) |
| Frontend | Next.js (App Router), TypeScript |
| Web3 | wagmi v2, viem v2 |
| Wallet | MetaMask (EOA) |
| FHE browser SDK | `@zama-fhe/relayer-sdk` (client-side re-encrypt + decrypt) |
| FHE server SDK | `@zama-fhe/relayer-sdk/node` (server-side input encryption) |
| UI components | shadcn/ui, Tailwind v4 |

---

## Monorepo Structure

```
complyrv2/
├── packages/
│   └── contracts/          Hardhat project
│       ├── contracts/
│       │   ├── IComplyrTypes.sol         Shared struct definitions (imported by USDC + AuditRegistry)
│       │   ├── ConfidentialUSDC.sol      ERC-7984 confidential USDC
│       │   ├── AuditRegistry.sol         FHE audit core + PaymentRecord storage
│       │   ├── ReviewTestRegistry.sol    ISA-standard test evaluation engine
│       │   └── ComplyrFactory.sol        EIP-1167 clone deployer (one per platform)
│       ├── test/           TypeScript FHE mock tests
│       ├── deploy/         Hardhat deploy scripts
│       └── hardhat.config.ts
└── apps/
    └── web/                Next.js App Router frontend
        └── src/
            ├── app/
            │   ├── dashboard/          Business payment + audit view
            │   ├── auditors/[wallet]/  External auditor portal
            │   └── api/
            │       ├── fhe/encrypt-input/   Server-side FHE encryption
            │       └── fhe/public-decrypt/  Zama gateway proxy
            ├── hooks/
            │   ├── usePayment.ts
            │   ├── useAuditLogs.ts
            │   └── useAuditorPortal.ts
            └── lib/
                ├── fhe.ts              Client-side decrypt helpers
                ├── active-pull.ts      KMS active-pull pattern
                └── contracts.ts        ABIs + addresses
```

---

## Audit Record Design

### Core Philosophy

Encrypt only what genuinely needs to stay hidden. Fields that encode business intelligence over time — amount, GL category, authorization level — are encrypted because their distribution leaks spending patterns even without individual values. Fields that anchor records to off-chain evidence (invoice and PO hashes) stay as plaintext hashes. Fields that authorize the record (approver, approval status) are never submitted at payment creation — only a separate `approvePayment()` call can set them.

Every field maps to a real-world compliance concept used in Big 4 audit engagements.

### `PaymentRecord` Struct

```solidity
struct PaymentRecord {
    // ── Encrypted fields (FHE handles) ─────────────────────────────────────
    euint64 amount;      // From token callback. Cryptographically verified — never self-reported.
    euint8  category;    // GL category (enum below). Business-declared.
    euint8  authLevel;   // CONTRACT-DERIVED from encrypted amount via owner-set DoA thresholds.
                         // Never caller-supplied. Business cannot under-declare.

    // ── Plaintext fields ───────────────────────────────────────────────────
    address sender;      // Who initiated the transfer
    address recipient;   // Who received the payment
    address approver;    // Always address(0) at creation. Set only by approvePayment().
    bool    approved;    // Always false at creation. Set only by approvePayment().

    // ── Evidence anchors (immutable after creation) ────────────────────────
    bytes32 invoiceHash; // keccak256 of supporting invoice — feeds MISSING_EVIDENCE test
    bytes32 poHash;      // keccak256 of purchase order — enables off-chain three-way match

    // ── Metadata ──────────────────────────────────────────────────────────
    uint32  blockNumber; // Block when recorded
}
```

### Why `approved` and `approver` Are Not in the Payment Submission

A business submitting a payment could include `approved: true, approver: someColleagueAddress` in the calldata — claiming a third party authorized the payment without that person ever signing anything on-chain. This breaks the AUTHORIZATION_BREACH and SEGREGATION_OF_DUTIES tests.

The fix: strip both fields from `ExternalAuditFields` and `CallbackAuditFields` entirely. At creation, `approved = false` and `approver = address(0)` always. The only path that sets them is `approvePayment(paymentId)` — a separate transaction by a different wallet. This closes the self-certification attack and makes the authorization check cryptographically grounded.

### Enums

```solidity
// GL-level payment categories (8 buckets = 8-iteration rollup loop)
enum Category {
    OPEX,         // 0 — Operating expenses (utilities, supplies)
    CAPEX,        // 1 — Capital expenditure (equipment, property)
    PAYROLL,      // 2 — Salary, wages, benefits
    PROFESSIONAL, // 3 — Consulting, legal, advisory
    INTERCOMPANY, // 4 — Related-party / intra-group transfers
    TAX,          // 5 — Tax payments to authorities
    DEBT_SERVICE, // 6 — Loan repayments, interest
    OTHER         // 7 — Unclassified
}

// Derived authorization level — contract-computed only
enum AuthLevel {
    ROUTINE,  // 0 — Below manager threshold, no human sign-off required
    MANAGER,  // 1 — Requires manager authorization
    DIRECTOR, // 2 — Requires director authorization
    BOARD     // 3 — Requires board resolution
}

// Tiered auditor access model
enum AuditorAccess {
    NONE,      // 0 — No access
    SIGNAL,    // 1 — Finding count + severity (no handles, no amounts)
    ANALYTICS, // 2 — Encrypted rollup totals + category/authLevel handles per payment
    FULL       // 3 — Full payment handle access + analytics
}
```

### `authLevel` Derivation — Contract-Enforced

`authLevel` is derived entirely on-chain by comparing the encrypted payment amount against the owner's Delegation of Authority (DoA) thresholds. The business never supplies it. The thresholds are set once by the business owner at onboarding (not by the auditor — this is the company's internal control policy):

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

**Onboarding gate:** `authThresholdsConfigured` must be `true` before any payment can be recorded. The contract reverts with `ThresholdsNotConfigured()` otherwise. This mirrors the real-world audit onboarding step of reviewing and agreeing on the client's DoA policy.

**What the thresholds are encrypted to:** The owner's own key. `FHE.allowThis` + `FHE.allow(threshold, msg.sender)`. Auditors never receive allow grants on DoA thresholds — only the contract uses them for comparison.

### `Finding` Struct

```solidity
struct Finding {
    uint256 paymentId;        // Links back to PaymentRecord
    uint8   testType;         // TestType enum value — which test triggered
    uint8   severity;         // Plaintext: mirrors auditor's configured Priority
    euint64 flaggedHandle;    // The encrypted value that crossed the threshold
    uint32  triggeredAtBlock;
    bytes32 narrativeHash;    // keccak256 of off-chain auditor narrative (optional)
    bool    escalated;
}
```

`severity` is plaintext so the auditor portal surfaces Critical findings immediately — no decryption required to triage the queue. This is how real audit management systems work.

`flaggedHandle` ACL is scoped to the triggering auditor only. Other auditors can see the finding exists (via `_auditorFindings`) but cannot decrypt its value unless they were the one whose test fired.

---

## Contract Architecture

### `IComplyrTypes.sol` — Shared Type Definitions

Single import point for `ExternalAuditFields` and `CallbackAuditFields`. Both `ConfidentialUSDC` and `AuditRegistry` import from here, eliminating struct duplication.

---

### `ConfidentialUSDC.sol` — ERC-7984 Token

Standard confidential ERC-7984 USDC wrapper. Core token logic unchanged from initial implementation.

**Modified function:**

`confidentialTransferAndCallWithAudit(to, amount, amountProof, ExternalAuditFields fields)` — the primary audit entry point. Decodes one encrypted field (category), packages it with recipient/invoiceHash/poHash into `CallbackAuditFields`, and calls `_transferAndCall`. The amount flows through the token's internal transfer mechanism to `AuditRegistry.onConfidentialTransferReceived`.

One encrypted field at the token level (down from three in the old design). `approved`, `approver`, `jurisdictionCode`, `referenceId`, `requiresApproval` removed entirely.

---

### `AuditRegistry.sol` — FHE Core

Implements `IConfidentialFungibleTokenReceiver`. Deployed as an EIP-1167 clone per business.

**Sole payment entry point:** `onConfidentialTransferReceived` — called by `ConfidentialUSDC` after the token transfer. The `nonReentrant` guard prevents re-entry. `recordPayment()` (self-reporting) does not exist.

**Key functions:**

| Function | Access | What it does |
|---|---|---|
| `initialize(token, owner)` | factory once | Replaces constructor (clone pattern). Locks if called again. |
| `setAuthTierThresholds(...)` | `onlyOwner` | Sets DoA encrypted thresholds. Sets `authThresholdsConfigured = true`. |
| `setReviewTestRegistry(addr)` | `onlyOwner` | Wires the paired ReviewTestRegistry. |
| `setAuditorAccess(addr, level)` | `onlyOwner` | Grants SIGNAL/ANALYTICS/FULL to an external auditor. Capped at 5. |
| `onConfidentialTransferReceived(...)` | `confidentialToken` only | Records payment. Derives authLevel. Updates rollups. Calls evaluateAll. |
| `approvePayment(paymentId)` | any wallet | Sets approved=true, approver=msg.sender. Triggers SoD check if sender==approver. |
| `recordFinding(...)` | `reviewTestRegistry` only | Creates a Finding. External entry point for the test system. |
| `getPaymentHandles(id)` | owner/sender/recipient/reviewTestRegistry/FULL auditor | Returns encrypted handles. |
| `getPaymentMeta(id)` | same | Returns plaintext metadata. |
| `getCategoryTotal(category)` | ANALYTICS/FULL/owner/reviewTestRegistry | Returns encrypted rollup total. |
| `getRecipientTotal(recipient)` | ANALYTICS/FULL/owner/recipient | Returns encrypted running total. |

**`_updateRollups` — blind accumulation:**

On every payment, all 8 category buckets update simultaneously using `FHE.select`. The real amount goes to the matching bucket; `FHE.asEuint64(0)` goes to all others. A chain observer cannot tell which bucket received the real amount — all 8 ciphertexts change on every payment.

```solidity
for (uint8 i = 0; i < CATEGORY_BUCKETS; i++) {
    euint64 delta = FHE.select(FHE.eq(category, FHE.asEuint8(i)), amount, zero);
    _categoryTotals[i] = FHE.add(_categoryTotals[i], delta);
}
```

8 iterations per payment (down from 22 in the old design = 64% reduction in rollup FHE ops).

**ReviewTestRegistry access — not an auditor slot:**

`ReviewTestRegistry` needs to call `getPaymentHandles` and `getCategoryTotal` to run tests. Rather than occupying one of the 5 auditor slots, its address is checked directly in `_canReadPayment` and `_canReadAnalytics`:
```solidity
account == reviewTestRegistry  // direct check, bypasses auditorAccess mapping
```
This keeps the 5-slot cap exclusively for external human auditors.

**`_createFinding` — auditor-scoped ACL:**

Old design broadcast `FHE.allow(flaggedHandle, auditor)` to all auditors in the loop. New design: only the triggering auditor receives the grant. Other auditors see the finding in their feed (metadata + severity) but cannot decrypt its value.

---

### `ReviewTestRegistry.sol` — Audit Test Engine

Deployed as an EIP-1167 clone per business, paired with its AuditRegistry.

**Test types (ISA assertion mapping):**

| TestType | ISA Assertion | Implementation | Status |
|---|---|---|---|
| `MATERIALITY` (0) | Occurrence, Accuracy | `FHE.gt(amount, threshold)` | ✅ V1 |
| `AUTHORIZATION_BREACH` (1) | Authorization | `FHE.gt(authLevel, ROUTINE) AND !approved` | ✅ V1 (partial — see Limitations) |
| `SEGREGATION_OF_DUTIES` (2) | Authorization | `sender == approver` plaintext check | ✅ V1 (via `createSodFinding`) |
| `MISSING_EVIDENCE` (3) | Occurrence | `FHE.gt(amount, threshold) AND invoiceHash == 0` | ✅ V1 |
| `CATEGORY_CONCENTRATION` (4) | Classification | `FHE.gt(categoryTotal[scope], threshold)` | ✅ V1 |
| `RECIPIENT_CONCENTRATION` (5) | Completeness | `FHE.gt(recipientTotal, threshold)` | ✅ V1 |
| `STRUCTURING` (6) | Occurrence | *(enum reserved — no-op in evaluateAll)* | ⏳ V2 |

**`evaluateAll(paymentId)` — called by AuditRegistry per payment:**

Payment data is fetched ONCE before the auditor loop (not once per auditor — gas optimization). External rollup calls (`getCategoryTotal`, `getRecipientTotal`) are guarded: only called if the auditor has configured that test with a non-NONE priority.

Per auditor (max 5 active):
- `AUTHORIZATION_BREACH`: runs only if `!approved` (which is always true at creation — approved is stripped from submission calldata)
- `MISSING_EVIDENCE`: runs only if `invoiceHash == bytes32(0)` — no FHE cost if document was provided
- `SEGREGATION_OF_DUTIES`: **skipped** in `evaluateAll`. Only fires via `createSodFinding()` from `approvePayment()`
- `STRUCTURING`: **no-op** (V2)

**Key implementation note — type casting:**

`authLevel` is stored as `euint8`. `_evaluateEncryptedTest` expects `euint64` (all tests share one comparison function keyed on the same threshold type). Upcast before passing:
```solidity
_evaluateEncryptedTest(auditor, paymentId, AUTHORIZATION_BREACH, FHE.asEuint64(authLevel));
```

**`_testedValues` mapping — why it exists:**

The two-phase finding system needs to reference the exact value that was the input to a test when creating a finding in Phase 2. `_testedValues[auditor][paymentId][testType]` stores the `euint64` handle at evaluation time. Phase 2 uses it as the `flaggedHandle` in the finding.

### Two-Phase Finding System

FHE imposes a hard constraint: **you cannot branch in Solidity on an encrypted boolean.** `if (FHE.gt(amount, threshold)) { createFinding() }` does not compile — the `ebool` is never decrypted on-chain.

**Phase 1 — Synchronous (during payment recording):**
FHE comparisons run. `ebool` results stored. `_testedValues` stored. `TestEvaluated` events emitted. No findings created. Gas cost bounded and predictable.

**Phase 2 — Auditor-initiated (after `TestEvaluated` event):**

```
Auditor sees TestEvaluated event
    └─► calls requestFindingCreation(paymentId, testType)
           └─► emits FindingRequested
                   └─► auditor's off-chain system decrypts the stored ebool via Zama KMS
                           └─► calls recordFindingIfTriggered(paymentId, testType, triggered)
                                   ├─► if !triggered: return. No finding. No trace.
                                   └─► if triggered: auditRegistry.recordFinding(...) → Finding created
```

**Why non-triggered tests leave no on-chain trace:**
`if (!triggered) return` — the chain only records positive findings. An observer can see that `requestFindingCreation` was called for a payment, but not whether the test fired or what the value was. This preserves the privacy of payments that do not cross any threshold.

**SEGREGATION_OF_DUTIES — bypasses the two-phase system:**
SoD is a pure plaintext check (`sender == approver`). No FHE comparison needed. When `approvePayment()` detects a SoD violation, it calls `reviewTestRegistry.createSodFinding(paymentId, auditor)` directly. This calls `auditRegistry.recordFinding()` immediately — no Gateway involvement, no `requestFindingCreation` needed.

---

### `ComplyrFactory.sol` — Clone Deployer

Deploys per-business `(AuditRegistry, ReviewTestRegistry)` pairs using inline EIP-1167 assembly. No external Clones.sol dependency.

**`deployRegistry(address business)` — 11-step wiring sequence:**

```
1.  auditProxy  = _clone(auditRegistryImpl)
2.  reviewProxy = _clone(reviewTestImpl)
3.  auditProxy.initialize(confidentialToken, address(this))   // factory = temp owner
4.  reviewProxy.initialize(auditProxy, address(this))         // factory = temp owner
5.  auditProxy.setReviewTestRegistry(reviewProxy)
6.  auditProxy.setAuditorAccess(reviewProxy, FULL)            // grants _isApprovedAuditor for wiring
7.  auditProxy.transferOwnership(business)                    // factory loses all admin rights
8.  reviewProxy.transferOwnership(business)                   // factory loses all admin rights
9.  registries[business] = BusinessRegistry{...}
10. businesses.push(business)
11. emit BusinessRegistered(business, auditProxy, reviewProxy)
```

After step 8, the factory has zero privileged access. There is no platform backdoor — verifiable on-chain.

**Why EIP-1167 clones:**
A shared contract pools all businesses' state. Rollup totals bleed across businesses. Auditor ACL grants become impossible to scope. EIP-1167 clones cost ~$0.10 to deploy (55 bytes of bytecode delegating all calls to a shared implementation) and give complete isolation.

---

## Audit Test Suite

### Active Tests (V1)

| Test | ISA Assertion | FHE Operation | What It Catches |
|---|---|---|---|
| **MATERIALITY** | Occurrence, Accuracy | `FHE.gt(amount, threshold)` | Single payment exceeding auditor limit |
| **AUTHORIZATION_BREACH** | Authorization | `FHE.gt(authLevel, ROUTINE)` AND `!approved` | Non-routine payment with no authorization on record |
| **SEGREGATION_OF_DUTIES** | Authorization | `sender == approver` (plaintext) | Payment initiator approved their own payment |
| **MISSING_EVIDENCE** | Occurrence | `FHE.gt(amount, threshold)` AND `invoiceHash == 0` | Material payment with no supporting invoice |
| **CATEGORY_CONCENTRATION** | Classification | `FHE.gt(categoryTotal[scope], threshold)` | Excess spend in a GL category |
| **RECIPIENT_CONCENTRATION** | Completeness | `FHE.gt(recipientTotal, threshold)` | Excess cumulative spend to one recipient |

### Deferred Tests (V2)

| Test | Reason Deferred | Design Path |
|---|---|---|
| **STRUCTURING** | Requires encrypted band comparison tied to encrypted DoA thresholds. Auditor can't configure a band without revealing where the DoA cutoffs are. | Design session: independent auditor-configured band vs DoA-derived band |

### Test Priority Levels

| Priority | When it runs |
|---|---|
| `CRITICAL` | Every payment, unconditionally |
| `STANDARD` | Every payment |
| `MONITORING` | Every Nth payment to a given recipient (configurable sampling) |
| `NONE` | Disabled |

---

## Privacy Model

| Party | What They Can See |
|---|---|
| **Business owner** | Their own payment amounts (sender/recipient ACL). That findings were triggered. NOT auditor thresholds. |
| **Auditor (SIGNAL)** | Finding count + severity. No payment amounts. No unflagged records. |
| **Auditor (ANALYTICS)** | Encrypted rollup totals (category, recipient). Category and authLevel handles per payment. NOT amounts. |
| **Auditor (FULL)** | All of above + raw amount handles. Decrypt individually via Zama KMS. |
| **Public / chain observers** | Encrypted ciphertexts only. Transaction graph (who paid whom, when). |
| **The contract** | Operates on ciphertexts. Never holds plaintext amounts during computation. |
| **The factory (post-deployment)** | Nothing. Ownership transferred to business at deploy time. |

---

## Key Flows

### Business Onboarding (Owner — run once)

```
Business owner wallet
 └─► AuditRegistry.setAuthTierThresholds(
         encManagerThreshold,    // e.g. >$10k needs manager sign-off
         encDirectorThreshold,   // e.g. >$100k needs director sign-off
         encBoardThreshold,      // e.g. >$500k needs board resolution
         inputProof
     )
         Sets authThresholdsConfigured = true
         No payment can be recorded before this call
         Thresholds encrypted to owner's key — auditors never see band boundaries
```

### Payment with Audit Record

```
Business (EOA)
 │
 ├─1─► Client-side preparation (parallel):
 │         a) SHA-256 hash invoice and PO → invoiceHash, poHash known immediately
 │         b) Encrypt 1 field via /api/fhe/encrypt-input:
 │              category (GL enum 0–7)
 │              Server uses @zama-fhe/relayer-sdk/node → {encCategory, inputProof}
 │         Note: authLevel is NOT encrypted by client — contract derives it.
 │               approved/approver are NOT in the calldata — stripped by design.
 │
 ├─2─► ConfidentialUSDC.confidentialTransferAndCallWithAudit(
 │         AuditRegistry,            ← destination
 │         encAmount, amountProof,
 │         ExternalAuditFields{
 │             encCategory, inputProof,
 │             recipient,
 │             invoiceHash,
 │             poHash
 │         }
 │     )
 │        Token internally calls: AuditRegistry.onConfidentialTransferReceived(
 │            operator, from, amountHandle, callbackData
 │        )
 │
 └─3─► AuditRegistry._recordPayment(sender, amountHandle, CallbackAuditFields)
           1. if (!authThresholdsConfigured) revert ThresholdsNotConfigured()
           2. euint8 authLevel = _deriveAuthLevel(amount)   ← FHE.select tree
           3. Push PaymentRecord{amount, category, authLevel, ..., approved=false, approver=0}
           4. _allowPaymentHandles(payment)                 ← ACL grants
           5. _updateRollups(amount, category, recipient)   ← 8-iter blind accumulation + recipient total
           6. IReviewTestRegistry(reviewTestRegistry).evaluateAll(paymentId)
```

### Auditor Creates a Test

```
Auditor (EOA)
 │
 ├─1─► Encrypt threshold in browser via /api/fhe/encrypt-input
 │         Threshold encrypted to auditor's key — business never sees it
 │
 └─2─► ReviewTestRegistry.createTest(
           testType,           ← TestType enum (0–5 active in V1)
           scope,              ← For CATEGORY_CONCENTRATION: which category (0–7)
           encThreshold,
           inputProof,
           priority,           ← CRITICAL / STANDARD / MONITORING
           monitoringFrequency ← used only when priority == MONITORING
       )
           FHE.allowThis(threshold)
           FHE.allow(threshold, msg.sender)
           _activateAuditor(msg.sender)
```

### Auditor Receives a Finding (Two-Phase)

```
[Phase 1 — happens automatically on every payment]
AuditRegistry._recordPayment
    └─► ReviewTestRegistry.evaluateAll(paymentId)
            └─► Per auditor × test:
                    result = FHE.gt(valueToTest, testConfig.threshold)
                    _testResults[auditor][paymentId][testType] = result
                    _testedValues[auditor][paymentId][testType] = valueToTest
                    FHE.allow(result, auditor)
                    emit TestEvaluated(auditor, paymentId, testType, result)

[Phase 2 — auditor-initiated]
Auditor system sees TestEvaluated event
 └─► ReviewTestRegistry.requestFindingCreation(paymentId, testType)
         └─► emit FindingRequested(auditor, paymentId, testType)
                 └─► off-chain system decrypts stored ebool via Zama KMS
                         └─► ReviewTestRegistry.recordFindingIfTriggered(
                                 paymentId, testType, triggered=true/false
                             )
                                 if !triggered → return (no trace)
                                 if triggered  → auditRegistry.recordFinding(
                                     paymentId, testType, severity,
                                     _testedValues[auditor][paymentId][testType],
                                     narrativeHash=0, auditor
                                 )
```

### Auditor Decrypts a Finding

```
Auditor (EOA)
 │
 ├─1─► AuditRegistry.getFinding(findingId)
 │         Returns: severity (plaintext — triage without decryption)
 │         Returns: flaggedHandle (euint64 — auditor has FHE.allow grant)
 │
 ├─2─► relayer-sdk.reencrypt(flaggedHandle, auditorPublicKey, EIP-712 signature)
 │         Zama KMS re-encrypts to auditor's ephemeral key
 │
 └─3─► Browser decrypts with auditor's private key
           Plaintext finding value displayed client-side
           Auditor sees the specific value — and only this value from the ledger
```

### Payment Authorization (Two-wallet flow)

```
Business (EOA)
 ├─1─► Payment recorded as normal via token transfer
 │         approved = false, approver = address(0) at creation
 │         AUTHORIZATION_BREACH test fires if authLevel > ROUTINE
 │
 └─2─► Authorized approver (different wallet) calls:
           AuditRegistry.approvePayment(paymentId)
               if msg.sender == payment.sender:
                   reviewTestRegistry.createSodFinding(paymentId, auditor) ← SoD violation
               payment.approved = true
               payment.approver = msg.sender
               emit PaymentApproved
```

---

## The Demo

The demo runs with two wallets controlled by the demonstrator in two browser windows side by side. This layout is intentional — it visually demonstrates the asymmetric information property.

**Left window — Business view:**
- Call `setAuthTierThresholds` (onboarding setup)
- Send payments with GL category + invoice/PO hash
- See that findings were triggered
- Cannot see auditor's test thresholds or find how the thresholds are set

**Right window — Auditor view:**
- Configure tests with encrypted thresholds and priority levels
- See findings with plaintext severity (triage without decryption)
- Decrypt only flagged payment records — not the full ledger
- Cannot see unflagged payment amounts

The two-window layout is the demo. The audience sees cryptographic separation of concerns in real time.

---

## Build Sequence

### Phase 0 — Prerequisites ✅ Complete

- [x] Hardhat workspace with `@fhevm/hardhat-plugin` confirmed
- [x] `IConfidentialFungibleTokenReceiver` callback signature confirmed
- [x] All contracts compile clean against `@fhevm/solidity` 0.11.1

### Phase 1 — Token Layer ✅ Complete

- [x] `ConfidentialUSDC.sol` — ERC-7984 wrapper
- [x] `confidentialTransferAndCallWithAudit` — simplified to 1 encrypted field
- [x] `ExternalAuditFields` / `CallbackAuditFields` moved to `IComplyrTypes.sol`
- [x] Compile verified

### Phase 2 — Shared Types ✅ Complete

- [x] `IComplyrTypes.sol` — `ExternalAuditFields` + `CallbackAuditFields`
- [x] Both `ConfidentialUSDC` and `AuditRegistry` import from here

### Phase 3 — Audit Storage ✅ Complete

- [x] `AuditRegistry.sol` — full rebuild
- [x] `PaymentRecord` struct with 10 fields (down from 13)
- [x] Enums: `Category` (8), `AuthLevel` (4), `AuditorAccess` (4)
- [x] `initialize()` + locked constructor (clone pattern)
- [x] `setAuthTierThresholds` — `onlyOwner`, sets `authThresholdsConfigured`
- [x] `_deriveAuthLevel` — FHE.select tree, never caller-supplied
- [x] `onConfidentialTransferReceived` — sole payment entry point, `nonReentrant`
- [x] `approvePayment` — triggers SoD check if sender == approver
- [x] `recordFinding` — external entry point, gated to `reviewTestRegistry`
- [x] `_updateRollups` — 8-iter blind accumulation + recipient total
- [x] `_allowPaymentHandles` — ReviewTestRegistry gets direct grants outside auditor loop
- [x] `_canReadPayment` — `reviewTestRegistry` address check (not via auditorAccess mapping)
- [x] All view functions (getPaymentMeta, getPaymentHandles, getCategoryTotal, etc.)

### Phase 4 — Test Engine ✅ Complete

- [x] `ReviewTestRegistry.sol` — full rebuild
- [x] `TestType` enum: 7 values (0–6), STRUCTURING reserved as no-op
- [x] `Priority` enum: NONE / MONITORING / STANDARD / CRITICAL
- [x] `initialize()` + locked constructor
- [x] `evaluateAll()` — 6 active tests, shared payment data fetch, guarded external calls
- [x] `_evaluateEncryptedTest()` — stores `_testResults` + `_testedValues`
- [x] `createSodFinding()` — plaintext SoD check, called from `approvePayment`
- [x] `requestFindingCreation()` / `recordFindingIfTriggered()` — two-phase finding system
- [x] `_validateTest()` — scope rules per test type
- [x] `euint8 → euint64` upcast for AUTHORIZATION_BREACH

### Phase 5 — Factory ✅ Complete

- [x] `ComplyrFactory.sol` — new file
- [x] Inline EIP-1167 `_clone()` assembly
- [x] `deployRegistry()` — full 11-step wiring, factory transfers ownership post-deploy
- [x] `deactivateBusiness()`

### Phase 6 — Compile ✅ Complete

- [x] `pnpm hardhat compile` — 5 files, zero errors, zero warnings on new files

### Phase 7 — Deployment Script ⏳ Pending

- [ ] Deploy `ConfidentialUSDC`
- [ ] Deploy `AuditRegistry` implementation (used as clone target)
- [ ] Deploy `ReviewTestRegistry` implementation (used as clone target)
- [ ] Deploy `ComplyrFactory(token, auditImpl, reviewImpl)`
- [ ] Call `factory.deployRegistry(testBusinessAddress)` — validate wiring
- [ ] Verify all contracts on Sepolia Etherscan

### Phase 8 — Tests ⏳ Pending

- [ ] Business onboarding: `setAuthTierThresholds` gates payments correctly
- [ ] Payment recording: amount in record matches actual transfer (not self-reported)
- [ ] `authLevel` derivation: correct band for each amount tier
- [ ] `approved`/`approver` cannot be set at creation (stripped from calldata)
- [ ] `approvePayment`: sets approved=true, triggers SoD finding when sender==approver
- [ ] MATERIALITY test: fires above threshold, silent below
- [ ] AUTHORIZATION_BREACH: fires for non-ROUTINE payments (approved always false at creation)
- [ ] MISSING_EVIDENCE: fires when invoiceHash==0 and amount>threshold; silent when hash provided
- [ ] CATEGORY_CONCENTRATION: fires when category rollup exceeds threshold
- [ ] RECIPIENT_CONCENTRATION: fires when recipient total exceeds threshold
- [ ] SEGREGATION_OF_DUTIES: fires via `createSodFinding` when sender==approver
- [ ] Two-phase finding: `recordFindingIfTriggered(triggered=false)` creates no finding
- [ ] ACL boundary: unauthorized address cannot decrypt any handle
- [ ] Factory: deployed clone pair is isolated (one business cannot read another's state)
- [ ] ReviewTestRegistry in auditor cap: does NOT consume one of the 5 external auditor slots

### Phase 9 — Frontend ⏳ Pending

- [ ] `/api/fhe/encrypt-input` — server-side category encryption
- [ ] `/api/fhe/public-decrypt` — Zama gateway proxy
- [ ] `active-pull.ts` — KMS proof fetch with visible progress
- [ ] Business onboarding flow: DoA threshold configuration
- [ ] Payment form: GL category picker, recipient, invoice hash, PO hash
- [ ] Auditor setup: test configuration with encrypted thresholds + priority levels
- [ ] Business dashboard: payment log, category rollup view
- [ ] Auditor portal: finding queue (sorted by severity, plaintext — no decrypt to triage), finding decrypt
- [ ] wagmi hooks for all contract interactions
- [ ] EIP-712 re-encryption flow for auditor client-side decrypt
- [ ] Two-view demo layout: Business | Auditor side by side

---

## V1 Known Limitations

| Limitation | V1 Behavior | V2 Path |
|---|---|---|
| **AUTHORIZATION_BREACH** | Catches unapproved non-routine payments. Does NOT verify approver holds sufficient organizational authority. | Add on-chain `AuthorityRegistry` mapping addresses to organizational roles. Test compares `authLevel` against approver's registered level. |
| **STRUCTURING** | Enum reserved. No-op in `evaluateAll`. | Design session: independent auditor-configured encrypted band vs DoA-derived band. |
| **`category` self-reporting** | GL category declared by sender. Misclassification possible. | `invoiceHash`/`poHash` enable off-chain three-way match verification. Misclassification patterns are themselves audit findings. |
| **Auditor revocation** | Revokes future grants. Does not retroactively remove KMS access to past handles. | FHE property. Mitigate with time-windowed access grants. |
| **Three-way match** | On-chain: hashes stored. Off-chain: auditor verifies document content against payment record. | Oracle-based document content verification (speculative). |

---

## Definition of Done

- [ ] All 6 active test types pass in Hardhat FHE mock, covering positive and negative cases
- [ ] ACL boundary tests: unauthorized addresses cannot decrypt any handle
- [ ] `transferAndCall` callback: amount in audit record matches actual transfer
- [ ] `approved`/`approver` verified: cannot be set in submission calldata, only via `approvePayment()`
- [ ] `authLevel`: verified contract-derived, never matches a caller-supplied value
- [ ] Two-phase finding: `recordFindingIfTriggered(triggered=false)` leaves no on-chain trace
- [ ] Factory isolation: clone pair deployed per business, one business cannot read another's state
- [ ] Server-side encryption: browser never loads FHE WASM
- [ ] Active-pull: user sees explicit progress, never an unexplained spinner
- [ ] Contracts deploy to Sepolia, factory wiring verifiable on-chain
- [ ] A developer can read `AuditRegistry.sol` and identify the `FHE.allow` grant for every handle without searching
- [ ] Demo runs cleanly with two wallets without coordination from a second human

---

*Complyr — Zama Developer Program, Season 3*
