# Complyr — Development Plan

> Private audit infrastructure for onchain business payments, built on Zama fhEVM.

---

## What Complyr Is

Complyr is an onchain business payments system with a built-in encrypted audit layer. Businesses send payments between wallets. Every payment permanently attaches encrypted audit records — amount, category, jurisdiction — directly to the transaction. External auditors run active compliance tests against those records without the data ever being decrypted. The contract evaluates audit logic directly on ciphertext using Fully Homomorphic Encryption. Auditors get answers. The business's financial details stay private.

The payment token is a confidential ERC-7984 token (cUSDC). The audit record's encrypted amount is pulled directly from the token transfer callback — not self-reported by the sender. This cryptographically ties the audit record to the actual movement of funds, which is the foundational integrity claim the product rests on.

---

## Product Scope

**In scope:**
- Business-to-business payments using a confidential ERC-7984 USDC wrapper
- Encrypted audit records attached to every payment (amount, category, jurisdiction)
- Auditor portal: create encrypted audit tests, receive findings, request escalation
- Tier-1 audit tests: run fully encrypted on every payment, no decryption
- Tier-2 escalation: scoped, logged public decryption for off-chain statistical work
- Document attachment layer (hashed on-chain, encrypted off-chain on IPFS)

**Out of scope:**
- Account abstraction / smart account wallets
- Off-chain indexers
- Contacts database (descoped for now)
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
| FHE test harness | `@fhevm/hardhat-plugin` (local mock, no Sepolia needed) |
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
- Store encrypted ledger entries (amount, category, jurisdiction, referenceId, timestamp)
- Maintain blind-accumulation rollups per category and per jurisdiction
- Maintain running encrypted totals per recipient
- Manage auditor access levels: Signal / Analytics / Full
- Expose finding queues per auditor
- Call `ReviewTestRegistry` on every new payment to evaluate active tests

**ACL discipline rule:** Every function that creates or receives an encrypted handle must document in a comment block exactly which addresses receive `FHE.allow` and why. This is enforced at code review, not at runtime.

**Blind accumulation pattern (mandatory for category/jurisdiction):**
On every payment, update all category totals simultaneously. Use `FHE.select` to add the real encrypted amount to the matching bucket and `FHE.asEuint64(0)` to every other bucket. All totals emit ciphertext updates at the same time. No observer can tell which category received funds.

---

### `ReviewTestRegistry.sol`

Stores and evaluates audit tests. Separate from `AuditRegistry` to prevent a God contract.

Responsibilities:
- Store encrypted thresholds per auditor per test type
- Expose `evaluateAll(auditor, paymentRecord)` called by `AuditRegistry` per payment
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
- Scoped by which handles are disclosed — not by a time-based lock (FHE.allow is permanent)

> ⚠️ **Open question before building this layer:** Verify ERC-7984's actual disclosure API against the OZ confidential-contracts source. The Zama primitive is `FHE.makePubliclyDecryptable()`. Confirm whether ERC-7984 wraps this or whether you call it directly.

---

## Audit Test Suite

### Tier 1 — FHE-Native

Runs on every payment, fully encrypted, no decryption involved. Evaluates in `ReviewTestRegistry`.

| Test | FHE Operation | What It Catches |
|---|---|---|
| **Large Payment** | `FHE.gt(amount, encThreshold)` | Single transaction exceeding defined limit |
| **Recipient Exposure** | `FHE.gt(recipientTotal[addr], encThreshold)` | Cumulative spend to a single recipient |
| **Category Exposure** | `FHE.gt(categoryTotal[cat], encThreshold)` | Total spend in a category (payroll, contractor, etc.) |
| **Jurisdiction Exposure** | `FHE.gt(jurisdictionTotal[jur], encThreshold)` | Total spend into a jurisdiction |
| **Velocity** | `FHE.gt(counter[recipient][window], encLimit)` | N payments to same recipient in a block window |
| **Structuring / Tolerance-band** | `FHE.gt(amount, lower) && FHE.lt(amount, upper)` | Payments just under an approval threshold |
| **Reserve / Liquidity** | `FHE.lt(encBalance, encMinimum)` | Wallet balance below auditor-set floor |
| **Authorization Tier** | `FHE.select(amountBand, requiredApprovers, ...)` | Amount determines required approver count |
| **Segregation of Duties** | `initiator != approver` | Initiator and approver must be different addresses |
| **Counterparty Confirmation** | `FHE.eq(senderAmount, recipientAmount)` | Both parties recorded the same encrypted amount |

> **Note on Counterparty Confirmation:** Only works when both sender and recipient are Complyr wallets. Define the external recipient UX separately (see Open Questions).

> **Note on Velocity:** Uses `block.number` as the time proxy. `block.timestamp` can be manipulated slightly by validators — document this limitation in the contract.

---

### Tier 2 — Escalation

Cannot run while data stays fully encrypted. Triggered when Tier-1 flag accumulation crosses a threshold.

| Test | What Requires Decryption | Off-chain Method |
|---|---|---|
| **Benford's Law** | Population of amounts for a category | Digit-frequency analysis |
| **Trend / Variance Analysis** | Period totals vs. baseline | Comparison against budget or prior-period average |
| **Ghost / Dormant Vendor** | Recipient history | Human review of decrypted recipient activity |
| **Fuzzy Duplicate** | Clustered near-duplicate amounts | Near-duplicate detection after decrypt |

Escalation flow:
1. Auditor requests escalation for a specific scope (category + time window)
2. `EscalationManager` checks flag count — rejects if threshold not met
3. Logs the request: auditor address, scope, block number
4. Calls `FHE.makePubliclyDecryptable()` on the approved handle set
5. Auditor uses active-pull to fetch KMS proof and receive cleartext
6. Off-chain analysis runs on decrypted population
7. Access is scoped by which handles are disclosed — there is no automatic revocation

---

### Document / Memo Layer

fhEVM has no encrypted string type. Document and memo handling is entirely off-chain.

- Hash documents client-side (SHA-256)
- Store hash in plaintext on-chain, linked to audit record by ID (hashes are not sensitive)
- Upload document ciphertext to IPFS, encrypted to auditor's public key
- Free-text memos: encrypted blob stored off-chain, IPFS hash linked on-chain
- Auditor decrypts memo locally — contract never touches memo content

---

## Key Flows

### Payment with Audit Record

```
Business (EOA)
 │
 ├─1─► Encrypt category + jurisdiction in browser via /api/fhe/encrypt-input
 │        Server uses @zama-fhe/relayer-sdk/node → returns {handles, inputProof}
 │
 ├─2─► ConfidentialUSDC.confidentialTransferAndCall(
 │         AuditRegistry,
 │         encCollateral, inputProof,
 │         abi.encode(encCategory, encJurisdiction, inputProof, referenceId)
 │     )
 │        Amount handle flows to AuditRegistry via IERC7984Receiver callback
 │        Business does not self-report the amount — it comes from the token
 │
 └─3─► AuditRegistry.onConfidentialTransferReceived(...)
           FHE.allow(amountHandle, address(this))
           FHE.allow(amountHandle, business)
           FHE.allow(amountHandle, auditor)    ← per access level
           Store encrypted record
           Update blind-accumulation rollups
           Call ReviewTestRegistry.evaluateAll(...)
```

### Auditor Creates a Test

```
Auditor (EOA)
 │
 ├─1─► Encrypt threshold in browser via /api/fhe/encrypt-input
 │
 └─2─► ReviewTestRegistry.createTest(
           testType, encThreshold, inputProof, scope
       )
           FHE.allow(encThreshold, address(auditRegistry))
           FHE.allow(encThreshold, address(reviewTestRegistry))
           Store test under auditor address
```

### Auditor Decrypts a Finding

```
Auditor (EOA)
 │
 ├─1─► AuditRegistry.getFindingHandle(findingId)
 │        Returns encrypted handle for this auditor
 │
 ├─2─► relayer-sdk.reencrypt(handle, auditorPublicKey, EIP-712 signature)
 │        KMS re-encrypts to auditor's ephemeral key
 │        No plaintext crosses the network
 │
 └─3─► Browser decrypts with auditor's private key
           Plaintext finding displayed client-side
```

### Unwrap cUSDC → USDC (Active-Pull)

```
User (EOA)
 │
 ├─1─► ConfidentialUSDC.unwrap(from, to, encAmount, inputProof)
 │        Emits UnwrapRequested(requestId)
 │
 ├─2─► Frontend polls /api/fhe/public-decrypt with requestId
 │        Proxies to Zama gateway until proof is ready (~10–30s)
 │        Shows visible progress — not a spinner
 │
 └─3─► ConfidentialUSDC.finalizeUnwrap(requestId, clearAmount, decryptionProof)
           FHE.checkSignatures(handles, encodedCleartexts, proof)
           Transfers plain USDC to recipient
```

---

## Type Sizing

Use the smallest encrypted type that fits the domain. FHE operations on smaller types cost less gas.

| Field | Type | Reason |
|---|---|---|
| Payment amount | `euint64` | Supports up to ~$18 trillion in smallest denomination |
| Category | `euint8` | 10 categories — fits in 8 bits |
| Jurisdiction | `euint8` | 13 jurisdictions — fits in 8 bits |
| Audit threshold | `euint64` | Must match amount type for `FHE.gt` comparison |
| Velocity counter | `euint32` | Counter per window — 32 bits sufficient |
| Approver tier | `euint8` | Small integer |

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
- [ ] Encrypted ledger entry struct (amount handle, category, jurisdiction, referenceId, timestamp)
- [ ] Blind-accumulation rollups for category and jurisdiction
- [ ] Recipient running totals
- [ ] Auditor access level management (Signal / Analytics / Full)
- [ ] `FHE.allow` management: document every grant in a comment block
- [ ] Hardhat tests: payment recorded, rollups updated, unauthorized address cannot decrypt

### Phase 3 — Test Registry and Tier-1 Tests

- [ ] `ReviewTestRegistry.sol`
- [ ] Encrypted threshold storage per auditor per test type
- [ ] `evaluateAll()` called by `AuditRegistry` on each payment
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
- [ ] Business dashboard: payment form, audit log view, category rollup view
- [ ] Auditor portal: test creation, finding queue, escalation request, finding decrypt
- [ ] wagmi hooks for all contract interactions (read from contract directly — no indexer)
- [ ] EIP-712 re-encryption flow for auditor client-side decrypt

### Phase 6 — Document Layer

- [ ] Client-side SHA-256 document hashing
- [ ] IPFS upload of encrypted document blob
- [ ] On-chain hash storage linked to audit record ID
- [ ] Auditor-side document retrieval and decryption

### Phase 7 — Gas and Performance

- [ ] Measure gas cost per Tier-1 test type
- [ ] Measure gas cost of blind-accumulation across all categories simultaneously
- [ ] Benchmark server-side encryption round-trip time
- [ ] Benchmark active-pull decryption end-to-end time
- [ ] Benchmark full Hardhat test suite run time — target under 60 seconds locally

---

## Open Questions

1. **ERC-7984 disclosure API** — verify actual method names before building `EscalationManager`
2. **External recipients** — a business may pay a vendor who is not a Complyr wallet. What is the UX for wrapping/unwrapping for external recipients? Does the payment auto-unwrap on receipt, or does the recipient need to interact with the protocol?
3. **Auditor key bootstrapping** — how does a new auditor establish their decryption key? EIP-712 flow must be designed before the auditor portal is built.
4. **`FHE.allow` and auditor revocation** — access grants are permanent at the cryptographic level. Revocation in the contract prevents future grants and new record access, but does not retroactively remove access to past handles. Document this as a known limitation.
5. **Counterparty confirmation scope** — the confirmation test only works if the recipient is also a registered Complyr wallet. Define behavior for external recipients explicitly before implementing this test.

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

---

*Complyr — Season 3*
