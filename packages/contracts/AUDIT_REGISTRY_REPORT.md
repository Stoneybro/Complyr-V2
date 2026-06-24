# Audit Registry Report

## Scope

This report covers the first production-shaped `AuditRegistry` implementation for Complyr V2. The work is focused on Phase 2 from `developmentplanV2.md`: encrypted audit record storage, auth-tier derivation, jurisdiction risk clamping, encrypted rollups, auditor access, document attachment, approval controls, and focused FHE tests.

Files added or changed:

- `contracts/AuditRegistry.sol`
- `contracts/ConfidentialUSDC.sol`
- `contracts/ReviewTestRegistry.sol`
- `test/AuditRegistry.ts`
- `test/ReviewTestRegistry.ts`
- `package.json`

## Contract Summary

`AuditRegistry` stores one encrypted audit record per business payment. The amount is an `euint64`, and the sensitive classification fields are `euint8` handles:

- `amount`
- `purposeCode`
- `riskTier`
- `counterpartyType`
- `authTier`

The plaintext fields are kept plaintext because they either come from transaction metadata or are not worth encrypting for this phase:

- `sender`
- `recipient`
- `approver`
- `referenceId`
- `docHash`
- `blockNumber`
- `jurisdictionCode`
- `requiresApproval`
- `approved`

The registry supports a direct `recordPayment` path for the current test scaffold and a token callback path through `onConfidentialTransferReceived`.

## FHE Design Decisions

### Amount Is Not Self-Reported

The direct path accepts an encrypted amount for tests and local development, but the callback path is designed to receive the amount from the token transfer callback. This is the right integrity model because the registry should not trust the business to report the payment amount separately from the actual token movement.

The callback integration test now passes. Audit-field proof conversion happens at the token entrypoint, then the token forwards already-validated encrypted handles to the registry callback with the actual transferred amount.

### `authTier` Is Contract-Derived

`authTier` is never accepted from the caller. The registry stores three encrypted thresholds:

- manager threshold
- director threshold
- board threshold

For every payment, `_deriveAuthTier` compares the encrypted amount against those encrypted thresholds and uses nested `FHE.select` calls to produce the encrypted tier:

- `BOARD` if amount is greater than board threshold
- `DIRECTOR` if amount is greater than director threshold
- `MANAGER` if amount is greater than manager threshold
- `ROUTINE` otherwise

This prevents the business from under-declaring authorization level.

### `riskTier` Is Jurisdiction-Clamped

The submitted risk tier stays encrypted, but the plaintext jurisdiction sets a minimum risk floor:

- `SANCTIONED` forces `WATCHLIST`
- `HIGH_RISK` forces at least `HIGH`
- `FATF_GREY` forces at least `MEDIUM`
- other jurisdictions allow `LOW`

The clamp uses:

```solidity
FHE.select(FHE.gt(floor, submittedRiskTier), floor, submittedRiskTier)
```

That stores the encrypted maximum of the submitted tier and the jurisdiction floor without decrypting either encrypted value.

### Jurisdiction Is Plaintext

I kept `jurisdictionCode` plaintext as specified in the plan. The reason is practical: the jurisdiction risk category is a public compliance rule input, and keeping it plaintext avoids blind accumulation across every jurisdiction bucket. The registry can update `jurisdictionTotal[jurisdictionCode]` with one encrypted addition.

### Rollups Use Blind Accumulation

The registry maintains encrypted totals for:

- purpose bucket
- risk tier bucket
- counterparty type bucket
- jurisdiction bucket
- recipient

For encrypted classifications, every bucket is updated every payment. The matching bucket receives the encrypted amount; every non-matching bucket receives encrypted zero through `FHE.select`. This hides which encrypted category matched.

Jurisdiction is plaintext, so it uses a direct mapping update.

### ACL Discipline

Every stored encrypted handle is granted to:

- `address(this)` so the registry can keep computing over it later
- the sender and recipient for their own payment record
- analytics/full auditors for aggregate or classification access
- full auditors for raw payment amount access

The code includes ACL comment blocks around threshold setup, payment-handle grants, and analytics-handle grants. This is intentional: FHE authorization is permanent enough that future maintainers need to see why every grant exists.

## Auditor Access Model

The registry has four access levels:

- `NONE`: no registry access
- `SIGNAL`: can receive plaintext finding metadata only
- `ANALYTICS`: can read encrypted aggregate handles and encrypted classifications
- `FULL`: can read full payment handles, including encrypted amount

The tests assert that an analytics-only auditor cannot call `getPaymentHandles`, but can read aggregate rollups.

## Findings

The registry includes the `Finding` struct from the plan and creates plaintext-control findings for:

- approval gap: `requiresApproval == true && approved == false`
- segregation of duties issue: `approved == true && approver == sender`

Encrypted threshold-triggered findings are not materialized in this contract because Solidity cannot branch publicly on an encrypted boolean. That belongs in the next `ReviewTestRegistry` layer, where findings should either store encrypted trigger handles or use a gateway/decryption flow to materialize public finding rows.

## Review Test Registry

`ReviewTestRegistry` now implements the first concrete Tier-1 encrypted test engine:

- approved auditors only: test creation requires `AuditRegistry.auditorAccess(auditor)` to be `ANALYTICS` or `FULL`
- bounded active auditor set with `maxActiveAuditors`
- validated test type, scope, priority, and monitoring frequency
- encrypted threshold storage per auditor and test type
- encrypted boolean result storage per auditor, payment, and test type
- monitoring cadence based on plaintext recipient evaluation counters
- result reads restricted to the owning auditor or contract owner

Implemented tests:

- `LARGE_PAYMENT`
- `PURPOSE_EXPOSURE`
- `RISK_TIER_SPIKE`, using `HIGH + WATCHLIST` totals
- `JURISDICTION_EXPOSURE`
- `RECIPIENT_EXPOSURE`
- `COUNTERPARTY_PATTERN`

The registry deliberately stores encrypted result handles instead of creating public findings directly. An encrypted boolean cannot safely drive a public branch on-chain. Turning encrypted results into plaintext finding rows needs a public decrypt or auditor decrypt workflow.

## Token Scaffold Change

The original `ConfidentialUSDC.sol` imported `@openzeppelin/confidential-contracts`, but that package is pinned to `@fhevm/solidity@0.7.0`. The installed Hardhat FHE plugin requires `@fhevm/solidity@0.11.1`.

To make the project compile and test with the installed plugin, I replaced the token with a minimal local demo token:

- encrypted balances
- owner-only encrypted mint
- encrypted transfer
- encrypted transfer-and-call
- audit-aware transfer-and-call helper

This token is a scaffold, not a complete ERC-7984 implementation. A later token phase should either use versions of OpenZeppelin confidential contracts compatible with the active FHE plugin, or pin the entire FHE stack to the older compatible version.

## Tests

`test/AuditRegistry.ts` covers:

- payments are rejected until encrypted auth thresholds are configured
- encrypted payment fields are recorded
- `authTier` is derived from encrypted amount
- sanctioned jurisdictions clamp submitted low risk to `WATCHLIST`
- encrypted purpose, risk, counterparty, jurisdiction, and recipient rollups update correctly
- analytics-only auditors cannot read full payment handles
- document attachment is sender-only and one-time
- approvals reject self-approval and record the designated approver

Current verification:

```text
15 passing
```

The full suite now covers both audit storage and review-test evaluation.

## Dependency Note

`package.json` now declares `@fhevm/solidity@0.11.1` to match `@fhevm/hardhat-plugin@0.4.2`.

Because `pnpm` was not available through Corepack on this machine, I manually retargeted the local pnpm junctions from `@fhevm/solidity@0.7.0` to the already-installed `@fhevm/solidity@0.11.1` package so Hardhat could run. A future clean install should regenerate the lockfile and node_modules layout properly.

## Remaining Work / Input Needed

The following items need product or FHE architecture decisions before they should be implemented:

- Public finding materialization: decide whether encrypted test results become findings through public decrypt, auditor-side decrypt plus signed attestation, or a gateway callback.
- Standard priority gate: the plan says Standard tests run when amount exceeds a plaintext gate, but amount is intentionally encrypted. Decide whether to accept a plaintext coarse gate, run Standard every payment, or add a separate encrypted gate.
- Active auditor cap: `maxActiveAuditors` defaults to `32`. This should be set from expected gas budgets before deployment.
- Remaining Tier-1 tests: velocity, structuring/tolerance-band, reserve/liquidity, authorization-tier policy tests, approval-gap timing windows, segregation-of-duties escalation, and counterparty confirmation still need dedicated contract design.
- Historical backtesting: not implemented yet. It needs pagination/batching rules to avoid gas-limit failures.

The demo token remains a scaffold. A production cUSDC should use a version-compatible ERC-7984 implementation once the OpenZeppelin confidential contracts package is aligned with the active FHE plugin version.
