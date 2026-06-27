# Complyr Design Source of Truth

This document pins down Complyr's product, audience, interface posture, and visual direction. It should be treated as the design brief future agents and contributors must read before changing the app UI.

The goal is not to make Complyr look like a generic crypto dashboard. Complyr should feel like private financial control infrastructure: audit-grade, precise, calm, and operational.

## 1. Product Definition

Complyr is a privacy-preserving, automated financial audit platform for businesses using on-chain payments.

It lets businesses make auditable payments without exposing raw payment amounts, sensitive thresholds, GL-category totals, or detailed ledger activity to the public chain or to every auditor. Audit tests run on encrypted data using FHE through Zama's fhevmlib/fhEVM stack.

In one sentence:

> Complyr is an on-chain compliance layer for business payments: it enforces and audits financial controls using FHE so audit assertions can be proven without exposing sensitive payment data.

The product should make this mental model clear:

- The business moves money.
- The payment automatically creates an audit record.
- Sensitive financial values remain encrypted.
- Controls and tests run against ciphertext.
- Auditors receive findings and scoped access, not an unrestricted plaintext ledger.

## 2. Audience

### Primary Users

**Business finance operators**

People who initiate payments, attach evidence, select GL context, and need confidence that payments are compliant before and after execution.

Likely roles:

- Finance manager
- Controller
- Treasury operator
- Operations lead at an on-chain business
- Founder or CFO at a crypto-native company

Their needs:

- Send payments without creating a separate audit spreadsheet.
- Understand what audit metadata is required.
- Know when approval or evidence is needed.
- See payment status clearly: drafted, encrypting, signing, submitted, recorded, tested, flagged.
- Avoid accidentally exposing confidential financial data.

**External auditors and compliance reviewers**

People who monitor findings, configure thresholds, request decryptions, and confirm whether a control exception is real.

Likely roles:

- Audit partner or audit manager
- Internal audit lead
- Compliance monitor
- Regulator with scoped access
- Institutional investor with audit rights

Their needs:

- Receive a clear findings feed.
- Distinguish encrypted signal from confirmed exception.
- Understand which ISA assertion each finding maps to.
- Request or review decryption only when necessary.
- Trust that payment records came from the actual token callback, not business self-reporting.

### Secondary Users

**Business administrators**

People who deploy a business registry, manage auditor access tiers, configure Delegation of Authority thresholds, and govern users.

**Hackathon judges and technical evaluators**

People evaluating whether the system is credible: Zama hackathon judges, protocol reviewers, ecosystem partners, and security-minded customers.

For V1, the primary demo audience is Zama hackathon judges. The product experience must make the FHE value legible in three minutes:

- Payment amount and audit metadata are encrypted before on-chain submission.
- Audit tests run against ciphertext.
- Auditor thresholds are encrypted and not visible to the business.
- Findings can be confirmed through gateway decryption without exposing the whole ledger.

## 3. Product Promise

Complyr's promise:

**Your auditor gets findings. Not access.**

The interface should reinforce this promise everywhere. Users should see that Complyr is built around scoped disclosure, encrypted computation, and evidence-backed controls.

Avoid making the product feel like:

- A generic wallet
- A consumer crypto portfolio
- A speculative DeFi app
- A colorful analytics toy
- A marketing-heavy SaaS landing page

Prefer making the product feel like:

- A control room for financial operations
- A private audit workpaper system
- A secure payment console
- A compliance evidence register
- A ledger that reveals only what each role is allowed to know

## 4. Design Principles

### 1. Privacy Is Visible, But Not Theatrical

The UI should show when data is encrypted, when a handle is being used, and when a decryption is requested. It should not overuse lock icons, hacker aesthetics, neon code effects, or vague "military-grade" language.

Good patterns:

- Small encrypted badges beside sensitive fields.
- Masked values with handle IDs.
- Clear access-tier labels.
- Decryption request states.
- Event timelines showing when encrypted tests ran.

### 2. Audit Concepts Should Be First-Class

Complyr is differentiated by bringing real audit concepts on-chain. The UI should use audit vocabulary directly when it helps the user.

Important terms:

- Payment Record
- Audit Test
- Finding
- Assertion
- Authorization Level
- Evidence
- Spend Category
- GL Category
- Recipient Concentration
- Category Concentration
- Materiality
- Segregation of Duties
- Delegation of Authority
- Gateway Decryption
- Signal, Analytics, Full access

Avoid replacing these with generic labels like "alerts", "items", "rules", or "stats" when the audit term is more precise.

Primary UI vocabulary:

- Use **Spend Category** in payment forms, table headers, filters, and business-facing copy.
- Use **GL Category** in audit-specific screens, tooltips, and technical references.
- Do not use "Purpose Code" in the UI.

### 3. Show The Chain Of Custody

The central trust story is that records are created from the token transfer callback, not self-reported by the business. The UI should make that provenance legible.

Every payment detail should be explainable as:

1. Payment initiated.
2. Amount encrypted.
3. Audit metadata attached.
4. Token callback recorded the payment.
5. Audit tests evaluated encrypted state.
6. Findings requested through gateway confirmation when needed.

### 4. Dense, Calm, Operational UI

This is a repeated-use business tool. It should prioritize scanning, comparison, and decision making.

Use:

- Tables for ledgers, findings, access grants, and test registries.
- Compact panels for current payment status and approval state.
- Sidebars for navigation and contextual details.
- Timelines for audit event history.
- Badges for severity, access tier, test status, and encryption state.
- Monospace only for addresses, hashes, handles, tx IDs, and contract references.

Avoid:

- Oversized hero treatment inside the app.
- Floating marketing cards in operational screens.
- Decorative gradients as a primary visual language.
- Unnecessary animations around sensitive financial operations.

## 5. Visual Identity From Complyr's World

Complyr's visual identity should come from the actual environment it lives in: audit workpapers, encrypted ledgers, payment controls, evidence files, threshold registers, and on-chain execution traces.

### Source Materials

Use these as visual references:

- Audit workpapers with tick marks, references, assertion labels, and evidence IDs.
- Internal control matrices.
- Delegation of Authority tables.
- General Ledger category schedules.
- Bank payment approval screens.
- Secure document registers.
- Transaction receipts and block explorer traces.
- Ciphertext handles and hash identifiers.
- Zama/FHE mental model: compute on hidden values, reveal only scoped results.

### Interface Vernacular

The app should borrow structure from:

- Workpaper indexing: `WP-4.2`, `FND-0017`, `PAY-0042`.
- Ledger rows: date, recipient, category, evidence, status, control result.
- Audit flags: exception, pending confirmation, cleared, confirmed.
- Access stamps: Signal, Analytics, Full.
- Control language: authorized, missing evidence, threshold exceeded, concentration risk.

### Visual Motifs

Use motifs sparingly and functionally:

- Thin ruled lines, table grids, and ledger separators.
- Small reference tags for hashes, handles, tx IDs, and evidence IDs.
- Status stamps that feel like audit annotations, not gamified badges.
- Layered visibility states: hidden value, encrypted handle, decrypted value.
- Event trails showing custody from payment to test result.

Do not make the design depend on generic blockchain imagery, abstract purple gradients, floating coins, cyberpunk visuals, or "AI dashboard" styling.

## 6. Color Direction

Current UI tokens are mostly grayscale. That is directionally appropriate for audit-grade software, but Complyr needs a more deliberate set of semantic colors so every color has a job.

### Recommended Palette Intent

- **Base surfaces:** off-white, white, cool gray, near-black text.
- **Primary action:** black or deep graphite for final actions like confirm payment.
- **Encrypted/private state:** muted blue or blue-gray.
- **Verified/cleared state:** restrained green.
- **Finding/warning state:** amber.
- **Critical exception:** red.
- **Pending gateway/decryption state:** violet or indigo only as a functional state, not a dominant brand wash.
- **Evidence/document state:** slate or neutral.

### Rules

- The app should not become a one-color gray interface. Use semantic accent colors for state, risk, and access.
- Use color plus text/icon, never color alone.
- Reserve red for confirmed or high-risk exceptions, not normal warnings.
- Avoid large purple-blue gradients as the main brand identity.

## 7. Typography

Use a clean enterprise sans-serif for the main UI. The current Aptos/Segoe UI stack is acceptable and fits the operational tone.

Use monospace for:

- Wallet addresses
- Transaction hashes
- Ciphertext handles
- Contract addresses
- Payment IDs
- Workpaper references
- Evidence hashes

Do not use monospace for large marketing headlines or general body copy.

## 8. Core Information Architecture

Complyr V1 exposes both the Business Console and the Auditor Portal. The two workflows must be clearly separated, wallet-gated, and scoped to a specific `AuditRegistry`.

### Business Console

Primary sections:

- Payments
- Payment Records
- Findings
- Approvals
- Evidence
- Auditors & Access
- Controls / DoA Settings
- Deployment / Registry

Routing rule:

- A connected wallet that owns a known registry enters the Business Console through `ComplyrFactory.getRegistry(connectedWallet)`.
- The Business Console always represents one business registry pair.

### Auditor Portal

Primary sections:

- Findings Feed
- Audit Tests
- Rollups
- Payment Handles
- Decryption Requests
- Evidence Review
- Access Scope

Routing rule:

- The Auditor Portal is reached with a registry-scoped URL such as `complyr.xyz/audit?registry=0x...`.
- The app reads `auditRegistry.auditorAccess(connectedWallet)` on that registry.
- If access is `NONE`, render Access Denied.
- If access is `SIGNAL`, `ANALYTICS`, or `FULL`, render only the fields that tier allows.
- A multi-business auditor uses one isolated session per registry URL. A local registry picker may remember previous registry addresses by wallet, but each view remains scoped to one registry.

### Admin / Onboarding

Primary sections:

- Business setup
- Registry deployment
- Auditor invitations
- Threshold setup
- User roles
- Contract status

V1 must include a Delegation of Authority setup screen. It is a demo centerpiece, not a secondary settings page.

## 9. Screen Design Requirements

### 9.1 Business Payment Screen

Purpose:

Allow a business user to send one or many payments while attaching audit metadata that will be encrypted and bound to the transfer.

Required elements:

- Recipient address or saved contact.
- Amount.
- Spend Category.
- Recipient/counterparty type.
- Jurisdiction.
- Risk tier.
- Client-side evidence hash.
- Approval requirement/state.
- Encryption status before wallet signing.
- Final confirmation state.

Design direction:

- Treat the payment form like a payment instruction plus audit workpaper.
- Group fields into `Payment`, `Audit Record`, `Evidence`, and `Approval`.
- Mark encrypted fields explicitly.
- Show a compact chain-of-custody preview before submission.
- Make batch rows dense but readable.

Locked V1 category set:

| Index | Contract Name | UI Display Name |
|-------|--------------|-----------------|
| 0 | OPEX | Operating Expenses |
| 1 | CAPEX | Capital Expenditure |
| 2 | PAYROLL | Payroll |
| 3 | PROFESSIONAL | Professional Services |
| 4 | INTERCOMPANY | Intercompany Transfer |
| 5 | TAX | Tax Payments |
| 6 | DEBT_SERVICE | Debt Service |
| 7 | OTHER | Unclassified |

Index 7 must display as **Unclassified**, never "Other".

Evidence rule:

- V1 does not upload or store files.
- The browser hashes the selected evidence file with SHA-256.
- The on-chain field stores only the resulting `bytes32` evidence hash.
- The UI must tell users to retain the original document because Complyr only records the fingerprint.

### 9.2 Payment Records / Audit Ledger

Purpose:

Show the immutable payment records created through the token callback.

Required elements:

- Payment ID.
- Date/time.
- Recipient.
- Amount state: encrypted, decrypted if authorized, or unavailable.
- Spend Category / GL Category state.
- Authorization level.
- Evidence hash.
- Approval status.
- Test evaluation status.
- Finding count.
- Transaction hash.

Design direction:

- Use a dense table.
- Each row should disclose only what the current role can see.
- Side panel opens to show event history and FHE handles.
- Emphasize provenance: "recorded via ConfidentialUSDC callback".
- Business owners see decrypted amounts for their own payments.
- Auditors see only the fields allowed by their access tier.
- If a field exists but the wallet lacks access, render an encrypted badge instead of a blank cell or "N/A".

### 9.3 Findings Feed

Purpose:

Show audit tests that fired and guide the user through confirmation, review, and resolution.

Required elements:

- Finding ID.
- Test type.
- ISA assertion.
- Severity.
- Payment reference.
- Encrypted result status.
- Gateway confirmation status.
- Business response/resolution status.
- Evidence link/hash.

Design direction:

- Findings are not generic alerts. They are audit exceptions or signals.
- Separate `Signal Detected`, `Gateway Pending`, `Confirmed Finding`, `Cleared`, and `Resolved`.
- Severity should be visible but restrained.

Locked V1 lifecycle:

`Signal Detected -> Confirmed (Gateway) -> Management Response -> Cleared`

Only the auditor who confirmed a finding can clear it. The business can acknowledge and provide a response or evidence hash, but cannot unilaterally clear a finding.

### 9.4 Audit Test Registry

Purpose:

Let auditors configure and monitor encrypted audit tests.

Required elements:

- Test name/type.
- ISA assertion mapping.
- Encrypted threshold handle.
- Scope: payment, category, recipient, authorization.
- Priority/severity.
- Active/inactive status.
- Last evaluation.
- Findings generated.

Design direction:

- Show the plaintext concept of the test without revealing encrypted thresholds.
- Thresholds should display as encrypted handles unless the user has explicit authority.
- Each test should explain what it monitors in plain audit language.
- Auditor-configured materiality and concentration thresholds must appear as encrypted handles after submission.

### 9.5 Auditor Access Management

Purpose:

Let the business grant and revoke auditor access tiers.

Required elements:

- Auditor wallet.
- Organization/name.
- Access tier: Signal, Analytics, Full.
- Scope.
- Date granted.
- Granted by.
- Revocation state.

Design direction:

- Access tier should be a core visual system.
- Explain each tier in terms of what the auditor can see.
- Never imply that all auditors get full ledger access.
- After granting access, the business UI must generate a shareable registry-scoped auditor URL.

### 9.6 Decryption Request Flow

Purpose:

Handle two-phase gateway confirmation before a finding is written or reviewed.

Required elements:

- Request ID.
- Requested value/result.
- Requesting wallet.
- Reason.
- Gateway status.
- Callback status.
- Final confirmed value/result if allowed.

Design direction:

- Make this flow procedural and auditable.
- Show that decryption is exceptional, scoped, and logged.
- Avoid making decryption feel like a casual reveal button.

### 9.7 Delegation of Authority Setup

Purpose:

Let the business configure encrypted approval thresholds and make the FHE privacy model concrete.

Required elements:

- Three threshold tiers: Manager, Director, Board.
- Threshold input before save.
- Encrypted handle display after save.
- Authorization required toggle/state.
- Approval workflow column.
- Plain note: auditors can see the authorization level required, not the plaintext threshold that created it.

Design direction:

- Use a table that mirrors a real internal control matrix.
- Treat this screen as a primary demo surface.
- Do not bury DoA configuration under generic settings.

## 10. Component Rules

### Badges

Use badges for:

- Encrypted
- Handle
- Signal
- Analytics
- Full
- Pending Gateway
- Confirmed Finding
- Cleared
- High / Medium / Low severity

Badges should be compact and readable in tables.

### Tables

Tables are primary UI, not secondary UI.

Rules:

- Keep row height compact.
- Use sticky headers where useful.
- Use monospace for hashes and addresses.
- Provide filters for severity, test type, access tier, and status.
- Open details in a side panel rather than navigating away for every row.

### Side Panels

Use side panels for:

- Payment record details.
- Finding details.
- Audit test configuration.
- Access grant details.
- Decryption request review.

### Empty States

Empty states should be operational and specific.

Good:

- "No findings confirmed yet."
- "No audit tests are active for this registry."
- "No payment records have been recorded through the token callback."

Avoid:

- "Nothing here yet!"
- "Start your journey."
- Generic marketing copy.

## 11. Copy Tone

Complyr should sound precise, calm, and audit-literate.

Use:

- "Finding"
- "Audit test"
- "Encrypted threshold"
- "Payment record"
- "Evidence hash"
- "Gateway confirmation"
- "Access tier"
- "Authorization level"
- "Spend Category"
- "GL Category" in technical/audit contexts

Avoid:

- "Magic"
- "Super secure"
- "AI-powered" unless an actual AI feature exists
- "Alerts" when the concept is a finding
- "Transactions" when the concept is specifically a payment record
- "Reveal" when the action is a formal decryption request
- "Purpose Code"

## 12. Current App Notes

Observed current app structure:

- Root homepage exists in `apps/web/src/app/page.tsx`.
- Protected payment route exists at `apps/web/src/app/(protected)/payments/page.tsx`.
- Payment form exists at `apps/web/src/components/payment-form/PaymentForm.tsx`.
- Sidebar currently exposes Transactions and Contacts.
- Public brand assets exist in `apps/web/public`.
- UI system uses Tailwind, shadcn/ui, and mostly grayscale tokens.

Current design risk:

- The protected app currently looks closer to a generic payment form than a compliance control console.
- Audit metadata exists in the form, but the hierarchy should more clearly communicate that every payment creates an encrypted audit record.
- The "audits" tab is currently empty and should become either Findings, Audit Ledger, or Auditor Portal depending on product scope.
- The current payment form still uses "Purpose Code" language. V1 UI must rename this to "Spend Category" and reserve "GL Category" for audit or technical contexts.

## 13. Product Decisions


---

### 13.1 Product Surface: Both Consoles, Registry-Scoped Routing

Complyr V1 exposes both the Business Console and the Auditor Portal. Access is wallet-gated and registry-scoped.

**The core constraint**: auditor access is not global — it is per-business, per-`AuditRegistry` contract. An auditor wallet can hold FULL access on Business A's registry and ANALYTICS access on Business B's. There is no single on-chain source that maps a wallet to all its access grants across all businesses.

**How routing works**:

1. The **Business Console** is reached by connecting a wallet that is the `owner` of a known `AuditRegistry` contract. The app looks up `ComplyrFactory.getRegistry(connectedWallet)` to find the business's registry pair.

2. The **Auditor Portal** is reached by connecting a wallet AND specifying which registry to audit. The URL carries the registry address as a query parameter:
   ```
   complyr.xyz/audit?registry=0x57ad6b95508a96dfc6e17efd702360b5124f4680
   ```
   The app reads `auditRegistry.auditorAccess(connectedWallet)` on that specific registry. If `> NONE`, the portal renders scoped to that registry and access tier. If `== NONE`, the app shows an Access Denied state.

3. **The business generates the access link** after calling `setAuditorAccess`. The UI shows a shareable URL encoding the registry address. The auditor receives the link, connects their wallet, and the on-chain access mapping determines what they can see.

4. **Multi-business auditors**: an auditor registered with two businesses holds two separate sessions — one per registry URL. The app can optionally track previously used registries (stored in `localStorage`, keyed by wallet address) and show a registry picker. Each session is strictly isolated to one registry.

Routing logic:
```
connect wallet →
  ComplyrFactory.getRegistry(wallet).active == true?
    → Business Console (owner flow)

  URL has ?registry=0xABC...?
    auditRegistry.auditorAccess(wallet) > NONE?
      → Auditor Portal (scoped to this registry, scoped to access tier)
    else
      → Access Denied state

  else
    → Landing / Connect prompt with option to enter a registry address
```

The auditor sees **only** what their access tier allows on the specified registry. They cannot navigate to any other business's data. The registry address in the URL is the complete scope boundary.

---

### 13.2 Primary Demo Audience: Hackathon Judges

The demo is built for Zama hackathon judges. They are evaluating:

1. Whether FHE is doing meaningful computation, not cosmetic encryption.
2. Whether the real-world use case is coherent.
3. Whether the demo can be understood in 3 minutes.

The demo flow must make FHE visible and legible. The critical moments to show:

- A payment is made. Amount is encrypted. The user never pastes a raw amount into a visible field on-chain.
- Audit tests run against ciphertext. The auditor configures a materiality threshold — it is encrypted, so the business cannot read it.
- A finding fires. The auditor sees it. The business sees a finding ID and status, not the threshold that triggered it.
- The auditor requests gateway confirmation. The decryption result confirms the finding.

These four moments must be demonstrable end-to-end in 3 minutes with no explanation of what FHE is.

---

### 13.3 Vocabulary: "Spend Category" in the UI, "GL Category" in Technical Contexts

The primary UI label for payment classification is **Spend Category**. This is immediately understood by anyone familiar with corporate card tools, expense management software, or financial operations platforms.

- In form labels, column headers, and filters: **Spend Category**
- In tooltips and help text: "Mapped to General Ledger (GL) account for audit purposes."
- In audit-specific screens (Audit Test Registry, Findings): **GL Category** is acceptable as a secondary label.
- In contract-level references (handle IDs, technical documentation): **GL Category**.

Never use "Purpose Code" — it is banking/wire-transfer language that does not map cleanly to the audit use case.

---

### 13.4 Final 8 Spend Categories

These are fixed in the `AuditRegistry.sol` contract as a `uint8` enum (indices 0–7). They must match exactly in both contract and UI.

| Index | Contract Name | UI Display Name | Notes |
|-------|--------------|-----------------|-------|
| 0 | OPEX | Operating Expenses | Day-to-day business costs |
| 1 | CAPEX | Capital Expenditure | Long-term asset purchases |
| 2 | PAYROLL | Payroll | Employee compensation — high SoD sensitivity |
| 3 | PROFESSIONAL | Professional Services | Legal, audit, consulting fees |
| 4 | INTERCOMPANY | Intercompany Transfer | Related-party transactions — audit scrutiny required |
| 5 | TAX | Tax Payments | Government remittances |
| 6 | DEBT_SERVICE | Debt Service | Loan repayments, interest, bond coupons |
| 7 | OTHER | Unclassified | **UI label is "Unclassified"** — never "Other". Signals that this payment requires follow-up classification. |

The UI label for index 7 is **Unclassified**, not "Other". "Other" creates an audit escape hatch. "Unclassified" communicates intent: this payment is pending proper classification and an auditor may flag it.

---

### 13.5 Field Visibility by Access Tier

These rules are enforced on-chain via FHE ACL grants. The UI must reflect exactly what the connected wallet can and cannot read. Never show a placeholder that implies access to data the user is not entitled to.

| Field | Business Owner | Signal Auditor | Analytics Auditor | Full Auditor |
|-------|---------------|----------------|-------------------|--------------|
| Payment ID | ✅ | ✅ | ✅ | ✅ |
| Date / Block | ✅ | ✅ | ✅ | ✅ |
| Sender address | ✅ | ✅ | ✅ | ✅ |
| Recipient address | ✅ | ✅ | ✅ | ✅ |
| Invoice hash | ✅ | ✅ | ✅ | ✅ |
| PO hash | ✅ | ✅ | ✅ | ✅ |
| Approval status + approver address | ✅ | ✅ | ✅ | ✅ |
| Amount (decrypted) | ✅ own payments | — | — | ✅ |
| Amount (encrypted handle) | — | ✅ handle only | ✅ handle only | ✅ (+ decrypted) |
| Spend Category (decrypted) | ✅ | — | — | ✅ |
| Spend Category (encrypted handle) | — | — | ✅ handle only | ✅ (+ decrypted) |
| Authorization Level (decrypted) | ✅ | — | — | ✅ |
| Authorization Level (encrypted handle) | — | — | ✅ handle only | ✅ (+ decrypted) |
| Category rollup totals (encrypted handle) | — | — | ✅ | ✅ |
| Category rollup totals (decrypted) | — | — | — | ✅ |
| Per-recipient totals (encrypted handle) | — | — | ✅ | ✅ |
| Findings — signal only (finding ID, test type, severity) | ✅ (own registry) | ✅ | ✅ | ✅ |
| Findings — full detail (gateway result, flagged handle) | ✅ (own registry) | — | — | ✅ |
| Audit test configs + thresholds | — | — | ✅ own tests | ✅ |
| Gateway decryption results | — | — | — | ✅ |
| Raw FHE handles for all amounts | — | — | — | ✅ |

UI rendering rule: when a wallet lacks access to a field, render an **encrypted badge**. Never render a blank cell or "N/A" — the badge communicates that data exists but is access-controlled.

---

### 13.6 Business User Sees Decrypted Amounts

The business wallet decrypts its own payment amounts in the UI. Showing encrypted handles to the initiating business would be unusable. The privacy model does not require hiding payment data from the payment sender.

Implementation rule: decrypt amounts for the business wallet automatically using `userDecryptEuint`. Display the plaintext amount in the Business Console. 

---

### 13.7 Evidence: Client-Side File Hashing in V1

V1 accepts evidence as a `bytes32` SHA-256 hash stored on-chain. No file is uploaded or stored by Complyr. The hash is generated **in the browser, client-side**, from a file the user selects.

**UX flow**:
1. User clicks "Attach Evidence" in the payment form.
2. Native file picker opens (PDF, image, spreadsheet — any file type).
3. Browser reads the file into an `ArrayBuffer` and computes SHA-256 using `crypto.subtle.digest('SHA-256', buffer)`. No network call. Typically completes in under 200ms for invoice-sized files.
4. UI shows the selected filename, a truncated hash preview (`0x3f2a...b91c`), and a copy-to-clipboard button for the full hash.
5. A persistent note renders: *"Your document is not uploaded or stored by Complyr. Only the SHA-256 hash is recorded on-chain. Keep a copy of the original document — the hash proves it existed at payment time."*
6. The `bytes32` hash populates the `invoiceHash` or `poHash` field and is submitted with the payment.

**Implementation** (can run in-browser with no dependencies):
```typescript
async function hashFile(file: File): Promise<`0x${string}`> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}` as `0x${string}`;
}
```

The file never leaves the user's machine. The hash is the on-chain evidence fingerprint. This is consistent with how real audit evidence systems work — e-signature platforms and audit confirmation tools store document hashes on ledgers without storing the document.

**Why this is a better demo moment**: the judge sees a file being "attached", the UI visibly computes and displays the hash, and the payment is submitted with the hash on-chain. That is a concrete and legible demonstration of client-side privacy preservation — the document exists only with the user, yet the hash creates an immutable on-chain proof of its existence.

Future: IPFS-backed upload will compute the hash locally, upload to IPFS, and store the CID as the evidence reference. The hash-first model is compatible with this path — the hash is always the stable identifier regardless of storage backend.

---

### 13.8 Delegation of Authority Setup Screen is Required in V1

The DoA setup screen is not a settings page. It is a **demo centerpiece**.

It must show:
- Three threshold tiers: Manager, Director, Board.
- The threshold amounts rendered as encrypted handles after submission (not plaintext).
- A note that auditors cannot read the exact thresholds — only that a payment exceeded a given tier.
- A visual DoA table that mirrors a real internal control matrix.

This is where Complyr demonstrates something no standard ERP does: DoA thresholds are private even to the auditor. The auditor knows an authorization level was required. The threshold that defined it is encrypted. This is the FHE story made concrete for a non-technical judge.

Screen layout: a table with three rows (Manager / Director / Board) and columns for threshold (encrypted after save), authorization required (yes/no toggle), and approval workflow.

---

### 13.9 Findings Lifecycle: Resolve Inside Complyr, with Export in Future

Findings have a four-state lifecycle inside Complyr V1:

```
Signal Detected → Confirmed (Gateway) → Management Response → Cleared
```

- **Signal Detected**: RTR evaluated the encrypted test and a result was stored. Auditor sees the finding type and severity. No plaintext data revealed.
- **Confirmed**: Auditor submitted gateway confirmation. The encrypted result was verified. The finding is now a confirmed audit exception.
- **Management Response**: Business has acknowledged the finding and provided a written response or additional evidence hash. This is stored on-chain as a hash of the response.
- **Cleared**: Auditor reviewed the management response and cleared the finding. Or escalated it to a persistent exception.

The business should never be able to unilaterally clear a finding. Only the auditor who confirmed it can clear it.

Export (PDF/JSON workpaper format) is deferred to V2. The status lifecycle is V1.

---

### 13.10 Brand Assets Required for V1

Minimum brand assets for a credible demo:

| Asset | Status | Notes |
|-------|--------|-------|
| Logo (SVG) | Existing | Confirmed final |
| Favicon (`.ico` / `.png` 32×32, 16×16) | Required | Always noticed when absent |
| Color token system | Required | Must be in CSS variables / Tailwind config, not just in this doc |
| Typography: primary font | Required | One clean enterprise sans-serif from Google Fonts (Inter recommended). Load it. Define it as a CSS variable. |
| OG / meta image (1200×630) | Required | For X article and link previews |
| Access tier badge designs | Required | Signal (slate), Analytics (blue), Full (violet) — designed once, used everywhere |
| Finding severity badge designs | Required | Low (amber), Medium (orange), Critical (red) — consistent across tables |

A full brand identity system, custom illustrations, and a marketing site are not required for V1.

---

## 14. V1 Implementation Priority

The next design and build pass should follow this order:

1. Define app routing and role gates for Business Console and Auditor Portal.
2. Build the semantic color tokens, typography token, access-tier badges, and finding-severity badges.
3. Redesign the Business Payment screen around `Payment`, `Audit Record`, `Evidence`, and `Approval`.
4. Add client-side SHA-256 evidence hashing and hash preview.
5. Add the Delegation of Authority setup screen with encrypted threshold handles.
6. Build the Payment Records / Audit Ledger table with role-aware field visibility.
7. Build the Findings Feed with the locked lifecycle.
8. Build Auditor Access Management with registry-scoped share links.
9. Build the Auditor Portal route with access-tier-specific views.
10. Build the Gateway Confirmation / Decryption Request flow.

Any future agent changing the app should start from this order unless the user explicitly reprioritizes.
