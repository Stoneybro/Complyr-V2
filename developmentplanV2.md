# Complyr — Development Plan V2

> External compliance monitoring for onchain business payments, built on Zama fhEVM.

---

## What Complyr Is

Complyr is an onchain business payments system with a built-in encrypted compliance layer. Businesses send payments between wallets. Every payment permanently attaches encrypted audit records directly to the transaction. External auditors — investors with contractual audit rights, institutional counterparties requiring AML/CFT attestations, or compliance monitors — run active compliance tests against those records without the data ever being decrypted. The contract evaluates audit logic directly on ciphertext using Fully Homomorphic Encryption. Auditors get findings. The business's financial details stay private.

**The product resolves a specific problem that exists in crypto and not in traditional finance:** regulated businesses face compliance obligations from external parties who have a right to audit them but not an unconditional right to see everything. The current options are hand over your entire financial history, or refuse and lose the institutional relationship. Complyr gives a third option — an external party runs real, meaningful compliance tests against your payment history and only ever sees the records that actually fail a test.

> **"Your auditor gets findings. Not access."**

The payment token is a confidential ERC-7984 token (cUSDC). The audit record's encrypted amount is pulled directly from the token transfer callback — not self-reported by the sender. This cryptographically ties the audit record to the actual movement of funds, which is the foundational integrity claim the product rests on.

---

## Product Scope

**In scope:**
- Business-to-business payments using a confidential ERC-7984 USDC wrapper
- Encrypted audit records attached to every payment (see record structure below)
- Auditor portal: create encrypted audit tests, receive findings, request escalation
- Tier-1 audit tests: run fully encrypted on every payment, no decryption
- Tier-2 escalation: scoped, logged public decryption for off-chain statistical work
- Document attachment layer (hashed on-chain, encrypted off-chain on IPFS) — core to the payment flow, not a later phase
- Test priority levels (Critical / Standard / Monitoring) — auditor configures per test

**Out of scope:**
- Account abstraction / smart account wallets
- Off-chain indexers
- Contacts database
- Mainnet deployment
- Tax withholding or automated regulatory reporting

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chain | Ethereum Sepolia + Zama fhEVM coprocessors |
| Contract language | Solidity 0.8.27 |
| FHE library | `@fhevm/solidity` |
| Confidential token | `@openzeppelin/confidential-contracts` (ERC-7984) |
| Contract toolchain | Hardhat + `hardhat-deploy` + TypeChain |
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
complyr/
├── packages/
│   └── contracts/          Hardhat project — all Solidity contracts and tests
│       ├── contracts/
│       │   ├── ConfidentialUSDC.sol
│       │   ├── AuditRegistry.sol
│       │   ├── ReviewTestRegistry.sol
│       │   └── EscalationManager.sol
│       ├── test/           TypeScript FHE mock tests
│       ├── deploy/         hardhat-deploy scripts
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

Encrypt only what genuinely needs to stay hidden. The amount is the crown jewel — it is always encrypted. Fields that encode business intelligence (payment purpose, risk classification, counterparty type, authorization band) are also encrypted because their distribution over time leaks spending patterns even without amounts. Fields that are harmless in plaintext (timestamps, reference IDs, jurisdiction risk region) stay plaintext to avoid unnecessary gas cost.

Every field maps to a real-world compliance standard — not an arbitrary integer bucket.

**Self-reporting controls.** A critical principle: the entity being audited must not be able to self-certify fields that gate audit tests. `amount` is already enforced by the token callback. `authTier` is contract-derived from the encrypted amount — the business cannot declare a lower authorization band than the amount requires. `riskTier` is clamped upward by a floor derived from the plaintext `jurisdictionCode` — the business cannot declare a SANCTIONED-jurisdiction payment as LOW risk. `purposeCode` and `counterpartyType` remain business-declared; misclassification is a documented limitation.

### `PaymentRecord` Struct

```solidity
struct PaymentRecord {
    // ── Encrypted fields (FHE handles) ───────────────────────────────────
    euint64  amount;            // From token callback. Never self-reported.
    euint8   purposeCode;       // ISO 20022-derived payment purpose (enum below). Business-declared.
    euint8   riskTier;          // FATF risk classification. Business-submitted but clamped upward
                                // by contract from jurisdictionCode floor — cannot be gamed.
    euint8   counterpartyType;  // AML counterparty classification (enum below). Business-declared.
    euint8   authTier;          // CONTRACT-DERIVED from encrypted amount via auditor-set encrypted
                                // thresholds. Never caller-supplied. Business cannot under-declare.

    // ── Plaintext fields ─────────────────────────────────────────────────
    address  sender;            // Public from msg.sender
    address  recipient;         // Public from transfer destination
    bytes32  referenceId;       // Hashed PO/invoice number — not sensitive
    bytes32  docHash;           // SHA-256 of attached document (IPFS CID)
    uint32   blockNumber;       // Velocity window anchor
    uint8    jurisdictionCode;  // Risk-region code (enum below) — plaintext by design
                                // Also drives riskTier floor derivation inside the contract.
    bool     requiresApproval;  // Opt-in: does this payment require a second approver?
    bool     approved;          // Was approval received before settlement?
}
```

### Enums (defined in Solidity)

```solidity
// ISO 20022-derived payment purpose codes
enum PurposeCode {
    GDDS,   // 0 — Purchase of goods
    SVCS,   // 1 — Purchase of services
    SALA,   // 2 — Payroll / salary
    SUPP,   // 3 — Supplier / vendor payment
    CONS,   // 4 — Consulting fee
    REBT,   // 5 — Rebate / refund
    RENT,   // 6 — Rent / lease
    TAXS,   // 7 — Tax payment
    INTC,   // 8 — Intra-company transfer
    LOAN,   // 9 — Loan / debt repayment
    INVS,   // 10 — Investment / capital
    OTHR    // 11 — Other / unclassified
}

// FATF risk-based approach tiers
enum RiskTier {
    LOW,        // 0 — Routine, verified counterparty
    MEDIUM,     // 1 — New vendor, elevated amount, or unusual purpose
    HIGH,       // 2 — Cross-border to non-FATF jurisdiction, large single tx
    WATCHLIST   // 3 — Counterparty on OFAC/UN/EU sanctions list
}

// AML counterparty classification
enum CounterpartyType {
    VENDOR,        // 0 — Third-party supplier
    CONTRACTOR,    // 1 — Independent contractor (1099-equivalent)
    EMPLOYEE,      // 2 — Internal payroll
    INTERCOMPANY,  // 3 — Same corporate group
    GOVERNMENT     // 4 — Tax authority / regulator
}

// Authorization approval band
enum AuthTier {
    ROUTINE,   // 0 — Auto-approved (low value)
    MANAGER,   // 1 — Manager sign-off required
    DIRECTOR,  // 2 — Director sign-off required
    BOARD      // 3 — Board resolution required
}

// Jurisdiction risk-region codes (plaintext — see design decision below)
enum JurisdictionCode {
    DOMESTIC,       // 0 — Same country as deployer
    FATF_COMPLIANT, // 1 — G20 + FATF member nations
    FATF_GREY,      // 2 — FATF grey-listed jurisdictions
    HIGH_RISK,      // 3 — Non-FATF, high-risk financial centers
    SANCTIONED      // 4 — OFAC/UN/EU sanctioned territory
}
```

### Why `jurisdictionCode` Is Plaintext

The previous design encrypted jurisdiction. This was a mistake for two reasons:

1. **The information is not secret.** The set of "which jurisdictions are dangerous" is public knowledge (FATF grey lists, OFAC sanctions lists). There is no privacy benefit to encrypting which risk region a payment is going to — the auditor needs to know this to apply regulatory rules, and the rules themselves are public.

2. **Gas cost.** Encrypted jurisdiction required blind-accumulation across all jurisdiction buckets simultaneously — 13 `FHE.select` calls per payment at ~120k gas each = **~1.56M gas per payment just for jurisdiction rollups**. With jurisdiction plaintext, the running total is a `mapping(uint8 => euint64)` keyed by risk region — one `FHE.add` at ~120k gas total. This is the single largest gas saving in the record redesign.

**Net gas change from the full redesign:** -1.56M (jurisdiction) + 240k (two new `euint8` fields) = **-1.32M gas saved per payment**.

### `authTier` Derivation (Contract-Enforced)

`authTier` is never supplied by the business. It is derived inside `onConfidentialTransferReceived` by comparing the encrypted amount against auditor-set encrypted band thresholds:

```solidity
// AuditRegistry.sol — called inside onConfidentialTransferReceived
// Thresholds set by auditor in a separate setup call; business never sees them.
euint8 derivedAuthTier = FHE.select(
    FHE.gt(amount, _encBoardThreshold),     // > board threshold → BOARD
    FHE.asEuint8(uint8(AuthTier.BOARD)),
    FHE.select(
        FHE.gt(amount, _encDirectorThreshold), // > director threshold → DIRECTOR
        FHE.asEuint8(uint8(AuthTier.DIRECTOR)),
        FHE.select(
            FHE.gt(amount, _encManagerThreshold), // > manager threshold → MANAGER
            FHE.asEuint8(uint8(AuthTier.MANAGER)),
            FHE.asEuint8(uint8(AuthTier.ROUTINE)) // else → ROUTINE
        )
    )
);
record.authTier = derivedAuthTier;
```

**Setup dependency:** The auditor must call `setAuthTierThresholds(encManager, encDirector, encBoard, inputProof)` before any payment can be processed. For the demo, this is a pre-step run by the auditor wallet at setup. The thresholds are encrypted — the business never learns where the band boundaries are.

**Gas cost of derivation:** 3 × `FHE.gt(euint64, euint64)` + 3 × `FHE.select` ≈ **500–700k additional gas per payment**. Justified by the control quality — `authTier` is now a cryptographic fact, not a declaration.

### `riskTier` Floor Derivation (Jurisdiction-Clamped)

`riskTier` is business-submitted but the contract enforces a minimum floor based on the plaintext `jurisdictionCode`. The business can declare a higher risk tier but cannot declare a lower one than geography requires:

```solidity
// AuditRegistry.sol — inside onConfidentialTransferReceived
// Derive minimum risk floor from plaintext jurisdiction (zero FHE cost)
uint8 floor;
if (jurisdictionCode == uint8(JurisdictionCode.SANCTIONED)) {
    floor = uint8(RiskTier.WATCHLIST); // Cannot be overridden
} else if (jurisdictionCode == uint8(JurisdictionCode.HIGH_RISK)) {
    floor = uint8(RiskTier.HIGH);
} else if (jurisdictionCode == uint8(JurisdictionCode.FATF_GREY)) {
    floor = uint8(RiskTier.MEDIUM);
} else {
    floor = uint8(RiskTier.LOW); // Business submission unconstrained
}

// Clamp: store max(businessSubmitted, floor)
euint8 encFloor = FHE.asEuint8(floor);
euint8 effectiveRiskTier = FHE.select(
    FHE.gt(encFloor, submittedRiskTier),
    encFloor,
    submittedRiskTier
);
record.riskTier = effectiveRiskTier;
```

**What this means:** A payment to a SANCTIONED jurisdiction always records as WATCHLIST regardless of what the business submitted. HIGH_RISK jurisdictions always record at least HIGH. The business cannot launder a high-risk payment into the LOW risk tier accumulator to evade the Risk Tier Spike test.

**Gas cost of clamping:** 1 × `FHE.gt(euint8, euint8)` + 1 × `FHE.select` ≈ **~150k additional gas per payment**. Minimal.

**Remaining limitation:** `purposeCode` and `counterpartyType` are still business-declared with no on-chain enforcement. Misclassification is possible and is a documented limitation. The consequence is that cumulative exposure tests on those fields are only as reliable as honest self-reporting — but misclassification is itself an audit finding during Tier-2 escalation when patterns become visible.

### `Finding` Struct

```solidity
struct Finding {
    uint256  paymentId;        // Links back to PaymentRecord
    uint8    testType;         // Which Tier-1 test triggered (enum)
    uint8    severity;         // 1=Info, 2=Warning, 3=Critical — plaintext for portal UX
    euint64  flaggedHandle;    // The encrypted value that triggered
    uint32   triggeredAtBlock;
    bytes32  narrativeHash;    // SHA-256 of off-chain auditor narrative (IPFS)
    bool     escalated;
}
```

`severity` is plaintext so the auditor portal can surface Critical findings immediately without requiring FHE decryption of the handle first. This is how real audit management systems work.

---

## Contract Architecture

### `ConfidentialUSDC.sol`

ERC-7984 wrapper for underlying Sepolia USDC.

Responsibilities:
- `wrap(address to, uint256 amount)` — convert plain USDC to cUSDC (encrypted balance)
- `confidentialTransfer(to, externalEuint64, inputProof)` — transfer between Complyr wallets
- `confidentialTransferAndCall(to, externalEuint64, inputProof, data)` — transfer + callback to receiver
- `unwrap(from, to, encAmount, inputProof)` — initiate unwrap, emits event for active-pull
- `finalizeUnwrap(requestId, clearAmount, decryptionProof)` — settles after KMS proof

---

### `AuditRegistry.sol`

Core audit storage and FHE evaluation engine. Implements `IERC7984Receiver`.

Responsibilities:
- Receive encrypted amount handle via `confidentialTransferAndCall` callback
- Store `PaymentRecord` structs (see design above)
- **Derive `authTier`** inside `onConfidentialTransferReceived` using auditor-set encrypted band thresholds — never accept from caller
- **Derive `riskTier` floor** from plaintext `jurisdictionCode` and clamp business-submitted value upward
- Maintain blind-accumulation rollups per `purposeCode` (12 buckets) and per `riskTier` (4 buckets)
- Maintain plaintext-keyed running totals per `jurisdictionCode` with encrypted values
- Maintain running encrypted totals per recipient
- `setAuthTierThresholds(encManager, encDirector, encBoard, inputProof)` — auditor-only setup function, must be called before first payment
- Manage auditor access levels: Signal / Analytics / Full
- Expose finding queues per auditor
- Call `ReviewTestRegistry` on every new payment to evaluate active tests
- `attachDocument(paymentId, docHash)` — callable by original sender only, only while `docHash == bytes32(0)`
- `approvePayment(paymentId)` — callable by designated approver, records approver address for SoD check

**ACL discipline rule:** Every function that creates or receives an encrypted handle must document in a comment block exactly which addresses receive `FHE.allow` and why.

**Blind accumulation pattern (purposeCode and riskTier only):**
On every payment, update all buckets simultaneously using `FHE.select` to add the real encrypted amount to the matching bucket and `FHE.asEuint64(0)` to every other bucket. Jurisdiction totals use a single `FHE.add` call keyed by the plaintext jurisdiction code — no select needed.

---

### `ReviewTestRegistry.sol`

Stores and evaluates audit tests. Separate from `AuditRegistry` to prevent a God contract.

Responsibilities:
- Store encrypted thresholds per auditor per test type
- Store test priority level per test (Critical / Standard / Monitoring)
- `evaluateAll(auditor, paymentRecord)` called by `AuditRegistry` per payment
  - Critical tests: run on every payment
  - Standard tests: run when `amount > auditor base threshold` (plaintext gate)
  - Monitoring tests: run every Nth payment to this recipient (plaintext counter)
- Write triggered findings into auditor finding queues in `AuditRegistry`
- Support historical backtesting: auditor deploys a new test and sweeps the existing ledger

---

### `EscalationManager.sol`

Manages Tier-2 escalation — scoped public decryption for off-chain statistical work.

Responsibilities:
- Track flag accumulation per category/recipient per auditor
- Gate escalation requests behind flag-count thresholds
- Log every escalation request: who, what scope, block timestamp
- Call `FHE.makePubliclyDecryptable()` on the approved handle set
- Scoped by which handles are disclosed — not by a time-based lock (`FHE.allow` is permanent)

> ⚠️ **Open question before building this layer:** Verify ERC-7984's actual disclosure API against the OZ confidential-contracts source. The Zama primitive is `FHE.makePubliclyDecryptable()`. Confirm whether ERC-7984 wraps this or whether you call it directly.

---

## Audit Test Suite

### Tier 1 — FHE-Native

Runs on every payment (subject to priority level), fully encrypted.

| Test | FHE Operation | What It Catches |
|---|---|---|
| **Large Payment** | `FHE.gt(amount, encThreshold)` | Single transaction exceeding defined limit |
| **Recipient Exposure** | `FHE.gt(recipientTotal[addr], encThreshold)` | Cumulative spend to a single recipient |
| **Purpose Exposure** | `FHE.gt(purposeTotal[code], encThreshold)` | Total spend in a purpose category (ISO 20022 code) |
| **Risk Tier Spike** | `FHE.gt(riskTierTotal[HIGH], encThreshold)` | Total value of HIGH/WATCHLIST payments |
| **Jurisdiction Exposure** | `FHE.gt(jurisdictionTotal[jCode], encThreshold)` | Total spend into a risk region (plaintext key, encrypted value) |
| **Counterparty Pattern** | `FHE.gt(counterpartyTotal[CONTRACTOR], encThreshold)` | Contractor spend ceiling |
| **Velocity** | `FHE.gt(counter[recipient][window], encLimit)` | N payments to same recipient in a block window |
| **Structuring / Tolerance-band** | `FHE.gt(amount, lower) && FHE.lt(amount, upper)` | Payments just under an approval threshold |
| **Reserve / Liquidity** | `FHE.lt(encBalance, encMinimum)` | Wallet balance below auditor-set floor |
| **Authorization Tier** | `FHE.select(amountBand, requiredApprovers, ...)` | Amount band versus claimed auth tier |
| **Approval Gap** | `requiresApproval == true && approved == false` | Plaintext check — no FHE cost |
| **Segregation of Duties** | `initiator != approver` | Initiator and approver must be different addresses |
| **Counterparty Confirmation** | `FHE.eq(senderAmount, recipientAmount)` | Both parties recorded the same encrypted amount |

### Test Priority Levels

| Level | When it runs | Gas profile |
|---|---|---|
| **Critical** | Every payment, unconditionally | Full cost every tx |
| **Standard** | When amount exceeds auditor's base threshold (plaintext gate) | ~50% of payments in practice |
| **Monitoring** | Every Nth payment to a given recipient (plaintext counter) | ~10–20% of payments |

Auditor configures priority at test creation. The plaintext gates (base threshold, N) are not sensitive — only the encrypted test thresholds are hidden.

> **Note on Velocity:** Uses `block.number` as the time proxy. `block.timestamp` can be manipulated slightly by validators — document this limitation in the contract.

> **Note on Counterparty Confirmation:** Only works when both sender and recipient are Complyr wallets.

---

### Tier 2 — Escalation

Cannot run while data stays fully encrypted. Triggered when Tier-1 flag accumulation crosses a threshold.

| Test | What Requires Decryption | Off-chain Method |
|---|---|---|
| **Benford's Law** | Population of amounts for a purpose category | Digit-frequency analysis |
| **Trend / Variance Analysis** | Period totals vs. baseline | Comparison against budget or prior-period average |
| **Ghost / Dormant Vendor** | Recipient history | Human review of decrypted recipient activity |
| **Fuzzy Duplicate** | Clustered near-duplicate amounts | Near-duplicate detection after decrypt |

---

### Document / Memo Layer

fhEVM has no encrypted string type. Document handling is off-chain.

**Flow (single process, no separate step):**
1. User selects a document before submitting payment
2. Client hashes document SHA-256 (instant, local — no network)
3. In parallel: FHE encryption of 4 audit fields → `/api/fhe/encrypt-input`, IPFS upload of encrypted document
4. When both complete: transaction submitted with `docHash` already in calldata
5. Frontend shows progress: `[✓ Hashed] [⏳ Encrypting] [⏳ Uploading]` — "Sign & Send" activates when all done
6. No "update document later" flow needed — the transaction never goes on-chain until the document is confirmed

If no document is attached: `docHash = bytes32(0)`. The `attachDocument(paymentId, docHash)` function exists for edge cases (IPFS retry after a failed upload) but is not part of the primary UX.

---

## Type Sizing

| Field | Type | Source | Reason |
|---|---|---|---|
| Payment amount | `euint64` | Token callback | Supports up to ~$18 trillion in smallest denomination |
| Purpose code | `euint8` | Business-declared | 12 ISO 20022-derived codes — fits in 8 bits |
| Risk tier | `euint8` | Business-submitted, clamped upward by contract | 4 FATF-aligned levels — jurisdiction floor enforced |
| Counterparty type | `euint8` | Business-declared | 5 AML counterparty types — fits in 8 bits |
| Auth tier | `euint8` | **Contract-derived** | 4 approval bands — computed from amount vs. auditor thresholds |
| Jurisdiction | `uint8` (plaintext) | Business-declared | 5 risk-region codes — drives riskTier floor, see design decision |
| Auth tier thresholds | `euint64` × 3 | Auditor-set (setup step) | Must match amount type for `FHE.gt` comparison |
| Audit thresholds | `euint64` | Auditor-set | Must match amount type for `FHE.gt` comparison |
| Velocity counter | `euint32` | Contract-maintained | Counter per window — 32 bits sufficient |

---

## Key Flows

### Payment with Audit Record

```
[PRE-STEP — Auditor Setup, run once before first payment]
Auditor (EOA)
 └─► AuditRegistry.setAuthTierThresholds(
         encManagerThreshold, encDirectorThreshold, encBoardThreshold, inputProof
     )
         FHE.allow(encManagerThreshold, address(this))
         FHE.allow(encDirectorThreshold, address(this))
         FHE.allow(encBoardThreshold, address(this))
         Stored encrypted — business never sees the band boundaries

Business (EOA)
 │
 ├─1─► Client-side preparation (parallel):
 │         a) SHA-256 hash document → docHash known immediately
 │         b) Encrypt 3 fields via /api/fhe/encrypt-input:
 │              purposeCode, riskTier (suggestion), counterpartyType
 │              Note: authTier is NOT encrypted by the client — contract derives it
 │              Server uses @zama-fhe/relayer-sdk/node → returns {handles[3], inputProof}
 │         c) Upload encrypted document to IPFS
 │
 ├─2─► When both (b) and (c) complete:
 │     ConfidentialUSDC.confidentialTransferAndCall(
 │         AuditRegistry,
 │         encAmount, inputProofAmount,
 │         abi.encode(
 │             encPurposeCode, encRiskTier, encCounterpartyType,
 │             inputProofAudit,
 │             jurisdictionCode,   ← uint8 plaintext (also drives riskTier floor)
 │             referenceId,        ← bytes32
 │             docHash,            ← bytes32
 │             requiresApproval,   ← bool
 │             approved            ← bool
 │         )
 │         // authTier is absent — the contract derives it
 │     )
 │        Amount handle flows to AuditRegistry via IERC7984Receiver callback
 │
 └─3─► AuditRegistry.onConfidentialTransferReceived(...)
           FHE.allow(amountHandle, address(this))
           FHE.allow(amountHandle, business)
           FHE.allow(amountHandle, auditor)    ← per access level

           // Derive authTier from encrypted amount vs. auditor thresholds
           euint8 derivedAuthTier = FHE.select(FHE.gt(amount, _encBoardThreshold), ...)
           // ~500-700k gas — cryptographic fact, not a declaration

           // Clamp riskTier upward from jurisdictionCode floor
           uint8 floor = _riskFloorFromJurisdiction(jurisdictionCode);
           euint8 effectiveRiskTier = FHE.select(FHE.gt(FHE.asEuint8(floor), submittedRiskTier), ...)
           // ~150k gas — SANCTIONED payments cannot be declared LOW risk

           Store PaymentRecord (with derived authTier, clamped riskTier)
           Update blind-accumulation rollups (purposeCode, effectiveRiskTier)
           Update jurisdiction running total (plaintext key, FHE.add)
           Update recipient running total
           Call ReviewTestRegistry.evaluateAll(...)
```

### Authorization Tier (Optional, Opt-in)

```
Business (EOA) — for high-value payments only
 │
 ├─1─► Submit payment with requiresApproval = true, approved = false
 │
 ├─2─► Designated approver wallet calls AuditRegistry.approvePayment(paymentId)
 │        Sets approved = true
 │        Records approver address (must differ from sender — SoD check)
 │
 └─3─► If approved == false when a time window closes:
           Approval Gap test fires → finding created
```

For the demo: `requiresApproval = false` by default on all payments. One payment in the demo uses `requiresApproval = true` to showcase the SoD feature with a second wallet.

### Auditor Creates a Test

```
Auditor (EOA)
 │
 ├─1─► Encrypt threshold in browser via /api/fhe/encrypt-input
 │
 └─2─► ReviewTestRegistry.createTest(
           testType, encThreshold, inputProof, scope, priority
       )
           FHE.allow(encThreshold, address(auditRegistry))
           FHE.allow(encThreshold, address(reviewTestRegistry))
           Store test with priority level under auditor address
```

### Auditor Decrypts a Finding

```
Auditor (EOA)
 │
 ├─1─► AuditRegistry.getFindingHandle(findingId)
 │        Returns encrypted handle for this auditor
 │        Finding severity (plaintext) already visible without decryption
 │
 ├─2─► relayer-sdk.reencrypt(handle, auditorPublicKey, EIP-712 signature)
 │        KMS re-encrypts to auditor's ephemeral key
 │
 └─3─► Browser decrypts with auditor's private key
           Plaintext finding displayed client-side
           Auditor can now see the specific payment amount — and only this payment
```

---

## The Demo

The demo is designed to run with two wallets controlled by the demonstrator in two browser windows side by side. This layout is intentional — it visually demonstrates the asymmetric information property.

**Left window — Business view:**
- Send payments with audit fields attached
- See that findings were triggered
- Cannot see auditor's test thresholds

**Right window — Auditor view:**
- Receive access grant from business wallet
- Deploy encrypted tests with priority levels
- See findings (severity visible immediately)
- Decrypt only flagged payment records — not the full ledger
- Cannot see unflagged payment amounts

The two-window layout is the demo. The audience sees cryptographic separation of concerns in real time.

---

## Build Sequence

### Phase 0 — Prerequisites

- [ ] Verify ERC-7984 actual method signatures against `@openzeppelin/confidential-contracts` source
- [ ] Verify `FHE.makePubliclyDecryptable()` signature and behavior against current `@fhevm/solidity` docs
- [ ] Set up Hardhat workspace with `@fhevm/hardhat-plugin` and confirm local FHE mock runs
- [ ] Confirm `IERC7984Receiver` callback signature and parameter shape
- [ ] Read through at least one winning project's test suite to understand the FHE mock test pattern

### Phase 1 — Token Layer

- [ ] `ConfidentialUSDC.sol` — ERC-7984 wrapper
- [ ] `wrap()` and `unwrap()` + `finalizeUnwrap()`
- [ ] `confidentialTransfer()` between EOAs
- [ ] `confidentialTransferAndCall()` with `AuditRegistry` as receiver
- [ ] Hardhat FHE mock tests: wrap → transfer → unwrap full cycle
- [ ] Confirm ACL: sender, receiver, and registry each get explicit `FHE.allow` on amount handle

### Phase 2 — Audit Storage and Registry

- [ ] `AuditRegistry.sol` — implements `IERC7984Receiver`
- [ ] `PaymentRecord` struct with all fields (see record design section)
- [ ] Define all enums: `PurposeCode`, `RiskTier`, `CounterpartyType`, `AuthTier`, `JurisdictionCode`
- [ ] `setAuthTierThresholds(encManager, encDirector, encBoard, inputProof)` — auditor-only, gates payment processing
- [ ] `_deriveAuthTier(euint64 amount)` — internal FHE.select tree against stored encrypted thresholds
- [ ] `_clampRiskTier(uint8 jurisdictionCode, euint8 submittedRiskTier)` — plaintext floor + FHE.select clamp
- [ ] `_riskFloorFromJurisdiction(uint8 code)` — pure function returning plaintext floor `uint8`
- [ ] Blind-accumulation rollups for `purposeCode` (12 buckets) and `riskTier` (4 buckets)
- [ ] Plaintext-keyed jurisdiction running totals with encrypted values (`mapping(uint8 => euint64)`)
- [ ] Recipient running totals
- [ ] `attachDocument(paymentId, docHash)` function
- [ ] `approvePayment(paymentId)` function with SoD check
- [ ] Auditor access level management (Signal / Analytics / Full)
- [ ] `FHE.allow` management: document every grant in a comment block
- [ ] `Finding` struct with plaintext severity
- [ ] Hardhat tests: payment recorded, rollups updated, unauthorized address cannot decrypt
- [ ] Hardhat test: business cannot under-declare `authTier` (derived band matches amount)
- [ ] Hardhat test: SANCTIONED jurisdiction payment cannot store riskTier below WATCHLIST

### Phase 3 — Test Registry and Tier-1 Tests

- [ ] `ReviewTestRegistry.sol`
- [ ] Encrypted threshold storage per auditor per test type
- [ ] Test priority level storage (Critical / Standard / Monitoring) with plaintext gates
- [ ] `evaluateAll()` called by `AuditRegistry` on each payment — respects priority levels
- [ ] Implement all Tier-1 tests (see table above)
- [ ] Finding queue write-back to `AuditRegistry`
- [ ] Historical backtesting sweep function
- [ ] Hardhat tests: each test type triggers and does not trigger correctly

### Phase 4 — Escalation Layer

- [ ] `EscalationManager.sol`
- [ ] Flag accumulation counter
- [ ] Escalation request gate and log
- [ ] `FHE.makePubliclyDecryptable()` on scoped handles
- [ ] Hardhat tests: escalation denied below threshold, approved above threshold, log immutable

### Phase 5 — Frontend

- [ ] `/api/fhe/encrypt-input` — server-side encryption using `@zama-fhe/relayer-sdk/node`
- [ ] `/api/fhe/public-decrypt` — Zama gateway proxy
- [ ] `active-pull.ts` — KMS proof fetch loop with visible progress state
- [ ] Payment form: ISO 20022 purpose picker, risk tier selector, counterparty type, document upload
  - Note: no `authTier` field — it is derived by the contract. Risk tier selector shows allowed range given jurisdiction selection.
- [ ] Auditor setup flow: auth tier threshold configuration (run once, pre-demo)
- [ ] Parallel upload flow: document hashing + IPFS upload + FHE encryption (3 fields) racing before tx submission
- [ ] Business dashboard: payment form, audit log view, purpose/risk rollup view
- [ ] Auditor portal: test creation (with priority level), finding queue, escalation request, finding decrypt
- [ ] Finding queue sorts by severity (plaintext) — Critical at top, no decryption required to triage
- [ ] wagmi hooks for all contract interactions
- [ ] EIP-712 re-encryption flow for auditor client-side decrypt
- [ ] Two-view demo layout: Business | Auditor side by side

### Phase 6 — Gas and Performance

- [ ] Measure gas cost per Tier-1 test type
- [ ] Measure gas cost of blind-accumulation across purposeCode and riskTier buckets
- [ ] Measure gas cost of `_deriveAuthTier` (expected ~500–700k) — confirm acceptable
- [ ] Measure gas cost of `_clampRiskTier` (expected ~150k) — confirm acceptable
- [ ] Confirm jurisdiction plaintext approach gas saving vs. prior encrypted design
- [ ] Benchmark server-side encryption round-trip time for 3-field batch (authTier removed from client)
- [ ] Benchmark active-pull decryption end-to-end time
- [ ] Benchmark full Hardhat test suite run time — target under 60 seconds locally

---

## Open Questions

1. **ERC-7984 disclosure API** — verify actual method names before building `EscalationManager`
2. **External recipients** — a business may pay a vendor who is not a Complyr wallet. What is the UX for wrapping/unwrapping for external recipients?
3. **Auditor key bootstrapping** — how does a new auditor establish their decryption key? EIP-712 flow must be designed before the auditor portal is built.
4. **`FHE.allow` and auditor revocation** — access grants are permanent at the cryptographic level. Revocation in the contract prevents future grants and new record access, but does not retroactively remove access to past handles. Document this as a known limitation.
5. **Counterparty confirmation scope** — the confirmation test only works if the recipient is also a registered Complyr wallet. Define behavior for external recipients before implementing.
6. **Monitoring priority sampler** — "every Nth payment" requires either a plaintext counter or encrypted modulo. Plaintext counter is fine (the fact that sampling is happening is not sensitive). Confirm approach before Phase 3.

---

## Definition of Done

- [ ] All Tier-1 tests pass in Hardhat FHE mock, covering positive and negative cases
- [ ] ACL boundary tests: confirm unauthorized addresses cannot decrypt any handle
- [ ] `transferAndCall` callback: confirm amount in audit record matches actual transfer (not self-reported)
- [ ] Server-side encryption: browser never loads FHE WASM
- [ ] Active-pull: user sees explicit progress, never an unexplained spinner
- [ ] Escalation log: every scoped decrypt is on-chain and immutable
- [ ] Contracts deploy cleanly to Sepolia with `hardhat-deploy`
- [ ] A developer familiar with fhEVM can read `AuditRegistry.sol` and identify the `FHE.allow` grant for every handle without searching
- [ ] Demo runs cleanly with two wallets in two windows — business view and auditor view — without coordination from a second human

---

*Complyr — Season 3*
