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
![ISO 20022](https://img.shields.io/badge/ISO%2020022-Payment%20Standards-0066CC?style=flat-square)

</div>

---

## What Complyr Is

Complyr is onchain business payments with a built-in encrypted compliance layer.

Every payment permanently attaches encrypted audit records directly to the transaction. External auditors — investors with contractual audit rights, institutional counterparties requiring AML/CFT attestations, or compliance monitors — run active tests against those records without the data ever being decrypted. The contract evaluates audit logic directly on ciphertext using Fully Homomorphic Encryption. **Auditors get findings. The business's financial details stay private.**

The payment token is a confidential ERC-7984 token (cUSDC). The audit record's encrypted amount is pulled directly from the token transfer callback — not self-reported by the sender. This cryptographically ties the audit record to the actual movement of funds. You cannot fake compliance by reporting a different number than what moved.

---

## The Problem

Regulated businesses — DAOs with investor audit rights, payment processors needing AML attestations from banking partners, DeFi protocols making operational payments — face compliance obligations from external parties who have a right to audit them but not an unconditional right to see everything.

The current options are:

- **Hand over your entire financial history.** This exposes every vendor relationship, salary, and spending pattern. It is a competitive liability and an operational risk.
- **Refuse and lose the institutional relationship.** No institutional partner, regulated bank, or serious investor will accept "trust us" without audit access.

Complyr gives a third option: an external party runs real, meaningful compliance tests against your payment history and only ever sees the specific records that actually fail a test.

Traditional finance doesn't have this problem because regulators compel full access under law. In crypto, where you're already on a public chain, the problem is worse — you can't selectively disclose, you're either fully public or on a privacy chain with its own trust problems. FHE on a public chain is what closes that gap.

---

## How It Works

### 1 — Payment with Encrypted Audit Record

When a business sends a payment, three audit fields are encrypted client-side before the transaction is submitted:

| Field | Standard | What it encodes | Source |
|---|---|---|---|
| `purposeCode` | ISO 20022 | Why the payment was made (SALA=payroll, CONS=consulting, GDDS=goods...) | Business-declared |
| `riskTier` | FATF risk-based approach | LOW / MEDIUM / HIGH / WATCHLIST | Business-submitted, **clamped upward** by contract |
| `counterpartyType` | AML/KYC classification | Vendor, Contractor, Employee, Intercompany, Government | Business-declared |
| `authTier` | Internal approval policy | Which authorization band governs this payment | **Contract-derived** — never caller-supplied |

The payment amount flows from the token contract into the audit record via an `IERC7984Receiver` callback — the sender never self-reports it. The jurisdiction risk region and reference ID are stored in plaintext.

The three encrypted fields (`purposeCode`, `riskTier`, `counterpartyType`) are covered by a single input proof, encrypted together in one server-side call. `authTier` is absent from the calldata — the contract computes it.

### 1a — Control Integrity: What the Business Cannot Game

A fundamental design principle: the entity being audited must not be able to self-certify the fields that gate audit tests.

**`authTier` is contract-derived** from the encrypted amount using auditor-set encrypted thresholds. The contract runs a nested `FHE.select` tree at payment time:

```solidity
// Contract computes this — business cannot supply it
euint8 derivedAuthTier = FHE.select(
    FHE.gt(amount, _encBoardThreshold),       // > threshold → BOARD
    FHE.asEuint8(uint8(AuthTier.BOARD)),
    FHE.select(
        FHE.gt(amount, _encDirectorThreshold), // > threshold → DIRECTOR
        FHE.asEuint8(uint8(AuthTier.DIRECTOR)),
        FHE.select(
            FHE.gt(amount, _encManagerThreshold), // > threshold → MANAGER
            FHE.asEuint8(uint8(AuthTier.MANAGER)),
            FHE.asEuint8(uint8(AuthTier.ROUTINE))
        )
    )
);
```

The band boundaries are auditor-encrypted — the business never sees them. A $500k payment cannot route through the ROUTINE band to skip board approval.

**`riskTier` is clamped upward** by a floor derived from the plaintext `jurisdictionCode`. The business can declare a higher tier than required, but not a lower one:

- `SANCTIONED` jurisdiction → always stores as `WATCHLIST` regardless of submission
- `HIGH_RISK` jurisdiction → minimum `HIGH`
- `FATF_GREY` jurisdiction → minimum `MEDIUM`

A payment to a sanctioned territory cannot be laundered into the LOW risk accumulator to evade the Risk Tier Spike test.

**`purposeCode` and `counterpartyType`** remain business-declared. Misclassification is possible and is a documented limitation — see Limitations below.

### 2 — Auditor Deploys Tests

The auditor creates compliance rules with encrypted thresholds. The business never sees the thresholds — they cannot tune payments to stay just under detection limits.

Each test has a **priority level**:

| Level | When it runs |
|---|---|
| **Critical** | Every payment, unconditionally |
| **Standard** | When payment amount exceeds a base threshold |
| **Monitoring** | Every Nth payment to a given recipient (sampling) |

### 3 — Contract Evaluates Tests, Never Decrypts

On every payment, `ReviewTestRegistry` runs all active tests directly on ciphertext. No decryption occurs. The contract produces an encrypted finding — a boolean result — and writes it to the auditor's finding queue.

```solidity
// Example: Large Payment test
ebool triggered = FHE.gt(amount, test.threshold);
// Neither amount nor threshold was decrypted. The contract compared them homomorphically.
```

### 4 — Auditor Decrypts Only Flagged Records

Findings arrive in the auditor portal sorted by plaintext severity (Critical first — visible without decryption). When the auditor chooses to investigate, they re-encrypt the finding handle to their own key via the Zama KMS and decrypt client-side. They see the specific payment amount that triggered the rule. They do not see the rest of the ledger.

### 5 — Tier-2 Escalation (Optional)

If flag accumulation crosses a threshold, the auditor can request a scoped escalation — public decryption of a specific category's totals for a specific time window. Every escalation request is logged immutably on-chain: who requested it, what scope, at what block. The auditor gets the data for off-chain statistical analysis. The log is permanent.

---

## Audit Tests

### Tier 1 — FHE-Native (no decryption)

| Test | What It Catches |
|---|---|
| **Large Payment** | Single transaction exceeding auditor's limit |
| **Recipient Exposure** | Cumulative spend to a single counterparty |
| **Purpose Exposure** | Total spend in an ISO 20022 payment category |
| **Risk Tier Spike** | Total value of HIGH/WATCHLIST-rated payments |
| **Jurisdiction Exposure** | Total spend into a risk region (FATF grey, sanctioned, etc.) |
| **Counterparty Pattern** | Contractor or vendor spend ceiling |
| **Velocity** | N payments to same recipient within a block window |
| **Structuring** | Payments clustering just under an approval threshold |
| **Reserve / Liquidity** | Wallet balance below an auditor-set floor |
| **Authorization Gap** | Payment claimed a lower approval band than its amount requires |
| **Approval Gap** | Payment marked as requiring approval but none was received |
| **Segregation of Duties** | Payment initiator and approver are the same address |
| **Counterparty Confirmation** | Both Complyr wallets recorded the same encrypted amount |

### Tier 2 — Escalation (scoped decryption required)

| Test | Method |
|---|---|
| **Benford's Law** | Digit-frequency analysis on a decrypted population |
| **Trend / Variance** | Period totals vs. budget or prior-period average |
| **Ghost / Dormant Vendor** | Human review of decrypted recipient activity |
| **Fuzzy Duplicate** | Near-duplicate detection on decrypted amounts |

---

## Privacy Model

| Party | What they can see |
|---|---|
| **Business wallet** | Their own payment amounts. That findings were triggered. NOT the auditor's thresholds. |
| **Auditor (Signal access)** | Finding count, severity. NOT payment amounts or unflagged records. |
| **Auditor (Full access)** | Finding amounts after decryption. Still cannot see unflagged records. |
| **Public / chain observers** | Encrypted ciphertexts. Jurisdiction risk region (plaintext). Transaction graph. |
| **The contract itself** | Operates on ciphertexts. Never holds plaintext amounts during computation. |

---

## Document Attachment

Every payment can carry a supporting document — an invoice, purchase order, contract, or memo. The flow is designed as a single user action:

1. User selects a document before submitting payment
2. Client hashes it SHA-256 (instant, local)
3. In parallel: FHE encryption of audit fields + IPFS upload of encrypted document
4. When both complete: transaction submitted with `docHash` already in calldata
5. Frontend shows `[✓ Hashed] [⏳ Encrypting] [⏳ Uploading]` — "Sign & Send" activates when done

The document hash is stored on-chain linked to the payment record. The document content is encrypted to the auditor's public key and stored on IPFS. The auditor decrypts locally. The contract never touches document content.

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
│  AuditRegistry (FHE core)        │
│  ReviewTestRegistry              │  ┌──────────────────────────────┐
│  EscalationManager               │  │   /api/fhe/public-decrypt    │
│                                  │  │   Zama KMS gateway proxy     │
└──────────────────────────────────┘  └──────────────────────────────┘
```

**`AuditRegistry.sol`** is the FHE core. It receives the encrypted amount handle from the token contract via `IERC7984Receiver`, stores `PaymentRecord` structs, maintains blind-accumulation rollups by payment purpose and risk tier, and manages auditor `FHE.allow` grants.

**Blind accumulation** prevents observers from learning which category a payment belongs to by updating all category totals simultaneously on every payment — real amount to the matching bucket, encrypted zero to all others. All ciphertexts update at the same time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chain | Ethereum Sepolia + Zama fhEVM coprocessors |
| FHE library | `@fhevm/solidity` |
| Confidential token | `@openzeppelin/confidential-contracts` (ERC-7984) |
| Contract toolchain | Hardhat + `hardhat-deploy` + TypeChain |
| FHE test harness | `@fhevm/hardhat-plugin` (local mock) |
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
NEXT_PUBLIC_AUDIT_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_REVIEW_TEST_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_ESCALATION_MANAGER_ADDRESS=0x...

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
│       │   ├── ConfidentialUSDC.sol      # ERC-7984 confidential USDC wrapper
│       │   ├── AuditRegistry.sol         # FHE audit core + PaymentRecord storage
│       │   ├── ReviewTestRegistry.sol    # Tier-1 test evaluation engine
│       │   └── EscalationManager.sol     # Tier-2 scoped decryption manager
│       ├── test/                         # TypeScript FHE mock tests
│       └── deploy/                       # hardhat-deploy scripts
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

**Payments require audit data.** Every payment in Complyr carries encrypted audit context atomically — there is no plain transfer path.

**Audit thresholds are encrypted end-to-end.** Auditor test criteria are encrypted in the auditor's browser before submission. The business is never granted `FHE.allow` on threshold ciphertexts and cannot read the auditor's rules.

**`authTier` is contract-derived, never caller-supplied.** Authorization bands are computed by the contract from the encrypted amount using auditor-set encrypted thresholds. The business cannot under-declare a payment's approval band. The band boundaries are encrypted — the business doesn't know where the cutoffs are.

**`riskTier` is clamped by geography.** The contract derives a minimum risk floor from the plaintext jurisdiction code and clamps the business's submitted value upward. A payment to a SANCTIONED jurisdiction always records as WATCHLIST. The business cannot launder a high-risk payment into a low-risk accumulator.

**Jurisdiction is plaintext by design.** The risk region (FATF-compliant, grey-listed, sanctioned) is not sensitive — the set of dangerous jurisdictions is public knowledge. Encrypting it would cost ~1.56M extra gas per payment in blind-accumulation rollups with no meaningful privacy gain. It also serves as the deterministic input for `riskTier` floor derivation.

**ISO 20022 purpose codes.** Payment categories map to the ISO 20022 standard used by global AML platforms (SALA, CONS, GDDS, etc.), not arbitrary integers. Auditor tooling can import these codes directly.

**Findings are masked when not triggered.** `AuditRegistry` stores findings using `FHE.select(triggered, value, asEuint(0))`. An auditor who decrypts a non-triggered finding receives zeros — no information about payments that did not meet the criteria is revealed.

**`FHE.allow` is documented at every callsite.** Every function that creates or receives an encrypted handle has a comment block listing exactly which addresses receive access and why. This is enforced at code review.

---

## Limitations

- **Testnet only.** Deployed on Ethereum Sepolia, not audited for production use.
- **Auditor revocation.** Removing an auditor revokes future access and new record grants, but does not retroactively remove cryptographic KMS access to past handles. This is a known FHE property, not a bug.
- **No automated regulatory reporting.** Complyr provides private audit infrastructure. It does not natively enforce tax withholding or file regulatory reports.
- **Counterparty confirmation requires both Complyr wallets.** The confirmation test only works when both sender and recipient are registered Complyr users.
- **Reference IDs are plaintext.** Invoice numbers and reference IDs are stored as plaintext `bytes32` hashes. Encrypting dynamic strings is non-trivial with the Zama type system, which supports fixed-size numeric types only.
- **`purposeCode` and `counterpartyType` are self-reported.** The business declares payment purpose and counterparty classification with no on-chain enforcement. Misclassification is possible. The consequence: cumulative exposure tests on these fields are only as reliable as honest reporting. However, misclassification patterns become visible during Tier-2 escalation and are themselves audit evidence.

---

<div align="center">

Built for the [Zama Developer Program — Season 3](https://www.zama.ai/).

</div>
