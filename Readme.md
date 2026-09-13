<div align="center">

<img src="./apps/web/public/complyrlogo-light.svg" alt="Complyr" width="90" height="90" />

# Complyr

**Confidential audit infrastructure for private on-chain business payments.**

<br />

[![Live Demo](https://img.shields.io/badge/Live%20Demo-complyr--v2.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://complyr-v2.vercel.app/)

<br />

![Zama FHE](https://img.shields.io/badge/Zama-Fully%20Homomorphic%20Encryption-FF6B35?style=flat-square)
![ERC-7984](https://img.shields.io/badge/ERC--7984-Confidential%20Token-3C3C3D?style=flat-square&logo=ethereum&logoColor=white)
![Ethereum Sepolia](https://img.shields.io/badge/Ethereum%20Sepolia-3C3C3D?style=flat-square&logo=ethereum&logoColor=white)
![ISA Standards](https://img.shields.io/badge/ISA%20Audit%20Standards-Big%204%20Methodology-0066CC?style=flat-square)

</div>



 Complyr lets external auditors run ISA-standard (International Standards on Auditing) audits on private on-chain business payments without ever seeing the actual transactions. Payment amounts and business metadata are encrypted with FHE, allowing audits to be executed directly on ciphertext. No raw financial data is ever leaked on-chain or exposed to the auditor.

---

## 🧩 The Problem

The blockchain industry has already solved financial privacy. Confidential tokens allow a business to hide its payment amounts. 

But this privacy introduces a new problem. It completely breaks accountability.

Businesses have to answer to investors, regulators, and external auditors. If an auditor cannot see the transaction amounts, how can they verify the business is following the rules? How can they check if a payment exceeded an authorized budget?

Right now, a business using private on-chain payments has no good way to be audited. They have only two options.

1. **Reveal the data.** Handing over the decryption keys destroys the privacy they just adopted.
2. **Rely on trust.** Asking an auditor to just trust the off-chain records defeats the entire purpose of using a blockchain.

Blockchain has solved private payments. It has not solved how to audit them. Once payment amounts are hidden, businesses lose the ability to prove compliance without revealing their financial data.

---

## 💡 The Solution: A Trustless Confidential Audit

Auditing a private on-chain transaction off-chain defeats the purpose of privacy. To maintain security, the audit infrastructure must move on-chain and become just as private as the transaction itself.

Complyr solves this by separating business operations from the audit process, allowing each side to access only the information they need.

### For the Business: Cryptographic Privacy
The business uses confidential tokens to hide payment amounts, keeping every financial transaction private.
But an audit requires more than knowing who got paid and how much. Auditors also need business context, such as the purpose of the payment.
Complyr encrypts this operational data with FHE and permanently attaches it to each transaction. Combined with confidential tokens, this creates payments that remain private while still being fully auditable.

### For the Auditor: ISA-Standard Infrastructure & Tiered Roles
To make this system usable for top firms like KPMG or Deloitte, Complyr is modeled directly on real-world auditing workflows:
*   **Encrypted Test Configuration:** The auditor configures standard International Standards on Auditing (ISA) tests (like Materiality or Concentration limits) using encrypted thresholds. Because these thresholds are hidden, the business cannot game the system by tweaking payment amounts to avoid detection.
*   **Tiered Access Controls:** Mirroring how audit firms operate in practice, Complyr enforces strict access tiers so each auditor sees only what their role requires. An **Analytics-Level Auditor** can decrypt rollup totals (category spend, recipient spend) and the specific transaction amounts that broke a rule. A **Full-Access Auditor** can decrypt individual payment amounts, GL categories, and authorization levels, but only for payments within their engagement scope. For payments made before the auditor was added, the business must explicitly grant access to each payment they want included in the audit scope.

### Bridging On-Chain Privacy with Off-Chain Reality
Smart contracts cannot verify everything required during an audit. It cannot verify the authenticity of a physical invoice or confirm that delivered goods matched a purchase order.

To bridge this gap, Complyr attaches immutable evidence anchors to every payment: the cryptographic hashes of the off-chain **Invoice** and **Purchase Order (PO)**. If a finding escalates to an off-chain review, the auditor requests the physical documents. Because the hashes were locked on-chain at the exact moment of payment, any tampering with the documents after the fact will produce a hash mismatch. The on chain record becomes the source of truth for verifying document integrity

### The Trustless Execution
Complyr enforces a completely trustless relationship between the two sides.
*   **No Self-Reporting:** The business cannot misrepresent their numbers. When a payment is made, the token contract automatically calls back into the audit infrastructure to record the exact encrypted amount that moved.
*   **Runtime Ciphertext Audits:** The smart contract evaluates the auditor's tests directly on the encrypted payment data at runtime, without decrypting it.
*   **Isolated Results:** The business and auditor sides remain completely isolated. They only connect when the Zama KMS gateway returns the decrypted audit results, giving the auditor cryptographic proof of any violations.

---

## 🔍 FHE Technical Deep Dive

Complyr's infrastructure pairs on-chain FHE smart contracts with a client-side findings pull engine in the auditor workspace:
*   [AuditRegistry.sol](./packages/contracts/contracts/AuditRegistry.sol): stores encrypted payment records and business metadata.
*   [ReviewTestRegistry.sol](./packages/contracts/contracts/ReviewTestRegistry.sol): stores encrypted audit rules and evaluates them against encrypted payment data.

When a business creates an account, [ComplyrFactory.sol](./packages/contracts/contracts/ComplyrFactory.sol) deploys isolated EIP-1167 minimal proxy clones of these two contracts and hands ownership to the business.

Payments run through [ConfidentialUSDC.sol](./packages/contracts/contracts/ConfidentialUSDC.sol), an ERC 7984 compliant confidential token that keeps transfer amounts encrypted.

Smart contracts cannot make decisions based on encrypted booleans. To resolve test outcomes without any centralized intermediary, the auditor workspace includes a client-side pull engine. The auditor's browser detects evaluation events, decrypts the boolean result using the Zama KMS via an EIP-712 session signature, and posts any triggered finding directly on-chain from the auditor's own wallet.

### Encrypted Fields at a Glance

| Field | Location | Type | Who Can Decrypt |
|---|---|---|---|
| Payment amount | `AuditRegistry` | `euint64` | Business owner, sender, recipient, FULL auditors |
| GL category | `AuditRegistry` | `euint8` | Business owner, sender, recipient, FULL auditors |
| Derived authorization level | `AuditRegistry` | `euint8` | Business owner, sender, recipient, FULL auditors |
| GL category running total | `AuditRegistry` | `euint64` | ANALYTICS + FULL auditors, `ReviewTestRegistry` |
| Recipient running total | `AuditRegistry` | `euint64` | ANALYTICS + FULL auditors, recipient |
| Audit test threshold | `ReviewTestRegistry` | `euint64` | Configuring auditor only |
| Test result (pass/fail) | `ReviewTestRegistry` | `ebool` | Configuring auditor only |
| Flagged amount in a finding | `AuditRegistry` | `euint64` | FULL auditors only |
| Invoice hash | `AuditRegistry` | `bytes32` (plaintext) | Public — acts as tamper-evident anchor |
| PO hash | `AuditRegistry` | `bytes32` (plaintext) | Public — acts as tamper-evident anchor |

The easiest way to understand the system is to follow a single payment from creation to the final audit finding.

---

### 1. The Setup & Access Control

Before the first payment, the business grants an external auditor access to its isolated AuditRegistry. Two things happen during setup.

**Auditor access tier.** The business assigns each auditor an access tier that determines which encrypted data they can decrypt.

```solidity
// AuditRegistry.sol
enum AuditorAccess {
    NONE,      // No access
    SIGNAL,    // Findings feed only (severity + testType, no handles)
    ANALYTICS, // Encrypted rollup totals only — cannot see individual payment amounts
    FULL       // Full per-payment handle access + rollup access
}

function setAuditorAccess(address auditor, AuditorAccess access, uint32 engagementId)
    external onlyOwner {
    auditorProfile[auditor] = AuditorProfile(access, engagementId);
}
```

> **💎 — Retroactive Historical Access:** An auditor added today cannot automatically read payments from last month. The business must explicitly call `grantHistoricalAccess(auditor, paymentIds[])` and specify exactly which historical payment IDs fall within the audit scope. This mirrors how real audit engagements work: a defined scope, not a blanket dump of all history. Once granted, the FHE access control list (ACL) gives the auditor permission to decrypt only those selected payments.

**Encrypted test configuration.** After receiving access, the auditor defines the audit rules they want the system to enforce. The auditor's test thresholds (e.g., a $10,000 Materiality limit) must remain completely hidden from the business. If the business knew the threshold, they could deliberately split payments so they stay just below the audit limit.

The auditor encrypts their threshold client-side and submits it to the `ReviewTestRegistry`. The contract uses `FHE.fromExternal` to validate the zero-knowledge input proof and convert the external ciphertext into an internal FHE handle that only the contract can operate on.

```solidity
// ReviewTestRegistry.sol
function createTest(
    uint8 testType,
    uint8 scope,              // GL category index for CATEGORY_CONCENTRATION; 0 elsewhere
    externalEuint64 encThreshold,
    bytes calldata inputProof,
    Priority priority,        // STANDARD (every payment) or MONITORING (every N payments)
    uint16 monitoringFrequency
) external {
    _requireApprovedAuditor(msg.sender);

    // Validate the ZK proof and convert to an internal FHE handle
    euint64 threshold = FHE.fromExternal(encThreshold, inputProof);
    _tests[msg.sender][testType] = ReviewTest({ threshold: threshold, ... });

    // Grant the contract permission to evaluate this threshold on future payments
    FHE.allowThis(threshold);
}
```

The `Priority` field lets auditors configure test frequency: `STANDARD` runs on every single payment, `MONITORING` runs every N payments to the same recipient (useful for periodic sampling), and `CRITICAL` runs on every payment and produces the highest-severity finding.

---

### 2. The Payment (Context Ingestion)

With the auditor's rules locked, the business initiates a private payment. This is where Complyr's most important architectural decision lives.

> **💎 — Audit Infrastructure Embedded in the Token:** Most audit systems rely on businesses self-reporting what they paid. Complyr eliminates this entirely. The function `confidentialTransferAndCallWithAudit` is defined on the token contract itself, `ConfidentialUSDC`. The audit fires atomically inside the transfer. There is no separate audit call the business could skip or fake.

When the business calls this function, they bundle the payment with two types of audit information:
1. **Evidence Anchors:** Plaintext hashes (`invoiceHash` and `poHash`) that act as immutable on-chain anchors for three-way matching with off-chain documentation.
2. **General Ledger Mapping:** The operational category of the spend (8 standard buckets: `OPEX`, `CAPEX`, `PAYROLL`, `PROFESSIONAL`, `INTERCOMPANY`, `TAX`, `DEBT_SERVICE`, `OTHER`). To prevent chain observers from profiling the business's operations, this category is encrypted client-side.

```solidity
// ConfidentialUSDC.sol
function confidentialTransferAndCallWithAudit(
    address to, externalEuint64 amount, bytes calldata amountProof, ExternalAuditFields calldata fields
) external returns (euint64) {
    // 1. Convert external ciphertexts to internal handles
    euint64 encryptedAmount = FHE.fromExternal(amount, amountProof);
    euint8  category        = FHE.fromExternal(fields.category, fields.inputProof);

    // 2. Temporarily grant the AuditRegistry read access to the encrypted category
    FHE.allowTransient(category, to);

    // 3. Bundle the encrypted category AND the plaintext evidence hashes together
    bytes memory data = abi.encode(CallbackAuditFields({
        category:    category,
        recipient:   fields.recipient,
        invoiceHash: fields.invoiceHash,
        poHash:      fields.poHash
    }));

    return _transferAndCall(msg.sender, to, encryptedAmount, data);
}
```

> **💎 — Callback Eliminates Reporting Fraud:** The `AuditRegistry` receives this payload via `onConfidentialTransferReceived` — the ERC-7984 transfer hook. The payment amount comes directly from the token transfer itself rather than the business. The business supplies none of the financial data. They cannot under-report the payment size because they never report it at all. The token contract does.

The `AuditRegistry` records the encrypted payment before forwarding the funds to the recipient. It observes the transfer without taking custody of the assets.

---

### 3. The Runtime Audit

As soon as the payment is recorded, the audit begins. `evaluateAll()` is called synchronously inside `_recordPayment()`, before that function returns. Tests run the moment the token callback fires. If the auditor has configured a threshold for a test, that test runs on every payment matching its priority setting.

```solidity
// AuditRegistry.sol — called during the token callback
IConfidentialToken(confidentialToken).confidentialTransfer(fields.recipient, amount); // pass-through
if (reviewTestRegistry != address(0)) {
    IReviewTestRegistry(reviewTestRegistry).evaluateAll(paymentId); // audit fires immediately
}
```

`evaluateAll` loops over all active auditors and runs each configured test in sequence. Four tests fire per payment.

**Test 1 — Materiality**
Materiality identifies payments that are significant enough to warrant additional review. If a payment exceeds the auditor's encrypted threshold, it is flagged.

```solidity
// ReviewTestRegistry.sol — evaluateAll()
// MATERIALITY: is this single payment above the auditor's examination threshold?
ebool result = FHE.gt(amount, testConfig.threshold);
_testResults[auditor][paymentId][testType] = result;
emit TestEvaluated(auditor, paymentId, testType, result);
```

**Test 2 — Missing Evidence**
Large non-routine payments require documentation. Small routine payments do not. This test fires only when two conditions are both true: the payment has no invoice (`invoiceHash == bytes32(0)`) AND the payment amount exceeds the auditor's configured threshold. A missing invoice on a $5 office supply purchase is not a finding. A missing invoice on a $500,000 consultant payment is.

```solidity
// ReviewTestRegistry.sol — evaluateAll()
// MISSING_EVIDENCE: only run the FHE threshold check if no invoice was attached
if (invoiceHash == bytes32(0)) {
    _evaluateEncryptedTest(auditor, paymentId, uint8(TestType.MISSING_EVIDENCE), amount, recipient);
}
```

**Test 3 — Category Concentration**
Auditors watch whether a business is channeling too much spend into a single GL bucket, a common technique for hiding irregular expenses inside `OTHER` or burying inflated costs inside `PROFESSIONAL`. The auditor targets a specific GL category via the `scope` field and sets an encrypted threshold for the running total of that category.

> **💎 — Blind Category Rollup:** How does the `AuditRegistry` update per-category running totals without leaking which category a payment belongs to? A naive implementation would update only the matching bucket, and any observer watching storage diffs would immediately know the GL category of every payment. Complyr solves this by updating all 8 buckets simultaneously on every payment using `FHE.select`. The correct bucket gets the encrypted amount added. Every other bucket gets an encrypted zero added. All 8 storage slots change on every payment, so storage diffs reveal nothing.

```solidity
// AuditRegistry.sol — executed during every token callback
euint64 zero = FHE.asEuint64(0);

// All 8 buckets update simultaneously. Observers cannot tell which one increased.
for (uint8 i = 0; i < CATEGORY_BUCKETS; i++) {
    euint64 delta = FHE.select(FHE.eq(category, FHE.asEuint8(i)), amount, zero);
    _categoryTotals[i] = FHE.add(_categoryTotals[i], delta);
}
```

With the rollup updated, the test compares the encrypted category total against the auditor's encrypted threshold:

```solidity
// ReviewTestRegistry.sol
euint64 catTotal = auditRegistry.getCategoryTotal(testConfig.scope);
ebool result = FHE.gt(catTotal, testConfig.threshold);
```

**Test 4 — Recipient Concentration**
This test checks whether the cumulative spend to a single recipient address exceeds the auditor's threshold. It catches vendor concentration risk, a business routing a disproportionate share of its payments to one counterparty, and flags potential related-party transactions that warrant scrutiny.

```solidity
// ReviewTestRegistry.sol
euint64 recipientTotal = auditRegistry.getRecipientTotal(recipient);
ebool result = FHE.gt(recipientTotal, testConfig.threshold);
```

Once every rule has been evaluated, the results are stored as encrypted booleans `ebool`. At this stage, nobody knows whether a test passed or failed, not the contract, not the business, and not the auditor. The encrypted result is simply recorded on chain, ready for the final decryption step.

---

### 4. The Finding (The KMS Reveal)

Smart contracts cannot make decisions based on encrypted values. After evaluating each audit rule, the contract stores an encrypted boolean handle (`ebool`) but cannot tell whether it represents a pass or a failure. The chain itself remains blind to the output.

Complyr handles this with a client-driven evaluation flow inside the auditor portal.

**Phase 1 — Event Pull & KMS Decryption**
While an auditor's workspace is open, the client pull engine polls for `TestEvaluated` events emitted by the business's `ReviewTestRegistry`. For each pending evaluation:
1. The auditor's wallet signs an EIP-712 message once per session to open a secure decryption window with the Zama KMS.
2. The browser fetches the encrypted `ebool` handle from `getTestResult()`.
3. The browser calls `fhevm.userDecrypt()` to decrypt the result locally.

**Phase 2 — Autonomous Finding Submission**
Once decrypted client-side:
*   If `triggered == false`: The test passed. The puller marks the event processed in browser storage and stops there. No transaction is submitted, preserving gas and keeping compliant transactions completely private.
*   If `triggered == true`: The auditor's wallet calls `recordFindingIfTriggered()` on `ReviewTestRegistry`. The contract verifies the caller is an authorized auditor, fetches the stored `flaggedHandle` for that test, and writes an immutable finding to `AuditRegistry`.

```solidity
// ReviewTestRegistry.sol
function recordFindingIfTriggered(
    uint256 paymentId,
    uint8 testType,
    bool triggered
) external {
    _requireApprovedAuditor(msg.sender);
    if (!triggered) return; // test passed — no trace left on-chain

    ReviewTest storage testConfig = _tests[msg.sender][testType];
    euint64 flaggedHandle = _testedValues[msg.sender][paymentId][testType];

    auditRegistry.recordFinding(
        paymentId,
        testType,
        uint8(testConfig.priority),
        flaggedHandle,
        bytes32(0),
        msg.sender,
        false
    );
}
```

**What each tier sees after a finding is created:**

| Auditor Tier | Can See |
|---|---|
| `ANALYTICS` | Finding metadata: testType, severity, block number, payment ID. Cannot decrypt the `flaggedHandle`. |
| `FULL` | All of the above, plus the encrypted `flaggedHandle` they can decrypt to get the exact amount. |

Findings cannot be modified or removed once recorded. Because they originate from deterministic FHE evaluation followed by Zama KMS decryption, neither the business nor the auditor can influence the outcome. An Analytics auditor can decrypt only the value associated with the finding, without gaining access to the rest of the ledger.

---

## ⚙️ Design Decisions & Known Limitations

The following design decisions and limitations are worth highlighting. Some capabilities already exist in the contracts but are not exposed in the current client, while others reflect practical limitations of today's architecture.

### SIGNAL Tier — Designed for Multi-Auditor Engagements

The `AuditorAccess` enum includes a `SIGNAL` tier that grants read access to finding metadata only — testType, severity, and block number — without any handle decryption rights.

`SIGNAL` was designed for a multi-auditor model: a senior auditor on an engagement configures the thresholds, and a junior SIGNAL-tier auditor monitors the findings feed. Since SIGNAL auditors cannot configure tests themselves, they produce no findings unless a higher-tier auditor has set thresholds first. Because the current client is scoped to one auditor per engagement, SIGNAL is functionally inert and not exposed in the UI. The tier is preserved in the contract for a future team model.

### Authorization Controls: Implemented, but Limited by Transaction Flow

Two tests implement authorization controls derived from real auditing practice. Both are fully implemented in the contracts but have a structural limitation that prevents real-world use in an Accounts Payable workflow.

**Segregation of Duties (SoD):** This test fires from `approvePayment()`, not `evaluateAll()`. The Segregation of Duties (SoD) control detects self approval and self dealing. When an approval is submitted, the contract checks whether the approver is also the sender or recipient of the payment. Either condition immediately creates a CRITICAL finding.

**Delegation of Authority (DoA) & Authorization Breach:** The business configures encrypted DoA thresholds for three authority levels: `MANAGER`, `DIRECTOR`, and `BOARD`. When a payment is recorded, the contract derives an `authLevel` using nested `FHE.select` — a pure FHE computation that no one submits or can influence. When an approver calls `approvePayment()`, the contract computes `FHE.lt(approverTier, payment.authLevel)`. If the approver's encrypted authority tier is below the required level, the breach `ebool` is stored for any ANALYTICS or FULL auditor to retrieve and decrypt.

**The limitation:** In a traditional accounts payable workflow, approval happens before funds are released. On chain transfers are atomic, so Complyr records the payment first and processes approval afterward. This means the contract can detect and record that an approval was made at the wrong authority level, but it cannot block the underlying transfer. The DoA mechanism functions as a detective control, not a preventive one. This limitation comes from the execution model of atomic blockchain transfers rather than the FHE implementation.

Both controls accurately demonstrate encrypted authorization checks and finding creation. They are not part of the default client because meaningful approval workflows require integration with an off chain accounts payable process.

---

## 🏗️ Architecture

Complyr is structured as a monorepo pairing the frontend application and client-side pull engine with the Solidity contracts:

```
complyr-v2/
├── apps/web/           Next.js 15 client (business portal, auditor portal & findings puller)
└── packages/contracts/ Hardhat project   (Solidity contracts + test suite)
```

### System Diagram

```
┌──────────────────────── Business / Auditor Browser ─────────────────────────┐
│  Next.js 15 (React 19, wagmi v2, viem)                                      │
│                                                                              │
│  @zama-fhe/relayer-sdk/web  -- encrypts amounts, categories, and thresholds  │
│                                 client-side before any tx is sent            │
│                                                                              │
│  Business workspace           Auditor workspace                             │
│  /payments  (send)            /auditors/[wallet]                            │
│                                 └─ Findings Pull Engine (useFindingsPuller) │
│                                    • Scans TestEvaluated logs               │
│                                    • Decrypts ebool via Zama KMS userDecrypt│
│                                    • Submits recordFindingIfTriggered()     │
└──────────────────┬────────────────────────────────────────▲─────────────────┘
                   │ encrypted handles + inputProof         │
                   │                                        │ recordFindingIfTriggered()
                   ▼                                        │ (only when test triggers)
┌──────────────────────── Sepolia Testnet (Zama fhEVM) ─────┴─────────────────┐
│                                                                              │
│  ComplyrFactory.sol                                                          │
│  └─ deploys EIP-1167 clone pairs (AuditRegistry + ReviewTestRegistry)        │
│     one isolated pair per business                                           │
│                                                                              │
│  ConfidentialUSDC.sol  (ERC-7984)                                            │
│  └─ confidentialTransferAndCallWithAudit()                                   │
│     fires atomically -- amount pulled from token engine, not self-reported   │
│                          │                                                   │
│                          ▼ onConfidentialTransferReceived callback            │
│  AuditRegistry.sol                                                           │
│  ├─ stores euint64 amount, euint8 category, euint8 authLevel per payment     │
│  ├─ blind rollup: updates all 8 GL buckets simultaneously via FHE.select     │
│  ├─ routes funds to recipient (pass-through, not custodian)                  │
│  └─ calls ReviewTestRegistry.evaluateAll() before returning                  │
│                          │                                                   │
│                          ▼                                                   │
│  ReviewTestRegistry.sol                                                      │
│  ├─ holds encrypted test thresholds per auditor                              │
│  ├─ runs FHE.gt / FHE.lt comparisons -- 4 tests per payment                 │
│  ├─ grants ACL access: FHE.allow(result, auditor)                            │
│  └─ emits TestEvaluated(auditor, paymentId, testType, result)                │
│                                                                              │
│  Zama fhEVM coprocessors execute all FHE arithmetic off-chain.               │
│  ACL (Access Control List) governs which addresses can decrypt each handle.  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### The Client

The web client is a Next.js 15 application with two primary workspaces:

**Business workspace** (`/payments`) handles private payment creation. The business selects a recipient, enters an amount and GL category, attaches invoice and purchase order hashes, and submits. Before the transaction reaches the chain, the Zama SDK encrypts both the amount and the GL category directly in the browser. The resulting handles and zero-knowledge input proofs pass to `confidentialTransferAndCallWithAudit`. Plaintext financial numbers never leave the user's browser.

**Auditor workspace** (`/auditors/[wallet]`) provides the auditor's review interface, housing analytics, historical findings, and the findings pull engine. Analytics-tier auditors can decrypt category rollups. Full-tier auditors can decrypt the flagged handles on findings. Decryption uses the Zama SDK's userDecrypt flow, requiring an EIP-712 signature from the auditor's connected wallet.

The client is built on wagmi v2 and viem for all contract interactions, with the Zama SDK initialised as a singleton that survives React re-renders.

### The Contracts

The on-chain layer consists of five contracts:

| Contract | Role |
|---|---|
| `ComplyrFactory.sol` | Deploys isolated EIP-1167 clone pairs (AuditRegistry + ReviewTestRegistry) per business and tracks all deployments. |
| `ConfidentialUSDC.sol` | ERC-7984 confidential token. The audit callback is built directly into the transfer function, eliminating self-reporting. |
| `AuditRegistry.sol` | Stores encrypted payment records, maintains the 8-bucket GL rollup, manages auditor tiers and ACL grants, and stores immutable findings. |
| `ReviewTestRegistry.sol` | Stores encrypted test thresholds, evaluates rules on each payment, grants result read permissions to the auditor, and records findings when triggered. |
| `IComplyrTypes.sol` | Shared struct definitions used across all contracts. |

Each business receives its own clone pair. One business's registry cannot read or affect another business's records.

### The Findings Pull Engine

Complyr uses a decentralized, client-side pull architecture built into the auditor workspace (`useFindingsPuller.ts`).

When an auditor views the workspace, the pull engine runs directly in the browser:

1. **Log Discovery:** Scans for `TestEvaluated` events emitted by the business's `ReviewTestRegistry` clone, filtered to the connected auditor. It uses chunked queries and public RPC fallbacks to handle block-range caps cleanly.
2. **Filtering & Deduplication:** Skips tests that don't need off-chain decryption (like Segregation of Duties, which logs plaintext findings directly during payment approval). It deduplicates pending events against existing findings recorded in `AuditRegistry` and a local browser cache, preventing redundant decryptions.
3. **KMS Session Decryption:** Prompts the auditor for a single EIP-712 signature to open a decryption session. It fetches the encrypted test result handle via `getTestResult()` and calls `fhevm.userDecrypt()`.
4. **On-Chain Recording:** If the test passed (`triggered == false`), the event is marked processed in local cache with zero gas spent. If a test fired (`triggered == true`), the auditor's wallet submits `recordFindingIfTriggered()`, permanently committing the finding to the `AuditRegistry`.

This keeps finding evaluation trustless: there are no custodial server wallets, no backend daemons to host, and all findings are verified and submitted directly by the auditor holding the engagement keys.

---

## 📦 Deployed Contracts (Sepolia)

| Contract | Address |
|---|---|
| `ComplyrFactory` | [`0x4508f247D0eBE3311e4dA32404cb75f308b20EBf`](https://sepolia.etherscan.io/address/0x4508f247D0eBE3311e4dA32404cb75f308b20EBf) |
| `ConfidentialUSDC` | [`0x33cD2b437Db6A30E8Eac60EF888E3d4681e556EF`](https://sepolia.etherscan.io/address/0x33cD2b437Db6A30E8Eac60EF888E3d4681e556EF) |
| `AuditRegistry` (implementation) | [`0x84F1489c1c1B30eddBDC163Ec489Acca76670D8`](https://sepolia.etherscan.io/address/0x84F1489c1c1B30eddBDC163Ec489Acca76670D8) |
| `ReviewTestRegistry` (implementation) | [`0xbcA8e25Ab0d42FaC46082c8d8812CbAf5fDA573d`](https://sepolia.etherscan.io/address/0xbcA8e25Ab0d42FaC46082c8d8812CbAf5fDA573d) |

The implementation contracts are deployed once. Every business that creates an account gets a dedicated EIP-1167 minimal proxy clone pair pointed at these implementations.

---

## 🛠️ Tech Stack & Testing

- **Smart Contracts:** Solidity, Hardhat, fhEVM, ERC-7984
- **Frontend:** Next.js 15, React 19, Tailwind CSS, shadcn/ui
- **Web3 Integration:** wagmi v2, viem, `@zama-fhe/relayer-sdk`
- **Audit Engine:** Client-side Zama SDK pull engine (`fhevm.userDecrypt`, EIP-712 sessions)

The smart contract layer includes a comprehensive test suite covering the full FHE lifecycle.
*(Include a screenshot or block of your passing test suite here)*

---

## 🚀 Local Setup

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- A Sepolia RPC URL (e.g. from Alchemy or Infura)
- An Ethereum wallet (e.g. MetaMask) with Sepolia testnet ETH

### 1. Clone and install

```bash
git clone https://github.com/your-github-username/complyrv2.git
cd complyrv2
pnpm install
```

### 2. Configure the client

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

Fill in `apps/web/.env.local`:

```env
NEXT_PUBLIC_COMPLYR_FACTORY=0x4508f247D0eBE3311e4dA32404cb75f308b20EBf
NEXT_PUBLIC_CONFIDENTIAL_USDC=0x33cD2b437Db6A30E8Eac60EF888E3d4681e556EF
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_wallet_connect_project_id
```

### 3. Run the client

```bash
cd apps/web
pnpm dev
```

The client is available at `http://localhost:3000`.

### 4. Run the contracts tests

```bash
cd packages/contracts
npm test
```

---

##  Acknowledgements

- [Zama](https://www.zama.ai/) for the fhEVM and the `@zama-fhe/relayer-sdk` that make on-chain FHE practical.
- [ERC-7984](https://eips.ethereum.org/EIPS/eip-7984) for the confidential token standard that makes the audit callback trustless.
- The Big 4 audit methodology and ISA standards that informed the test design.
