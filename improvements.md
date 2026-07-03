Good progress — most of this landed cleanly. Confirming what's correct first, then the one thing that's a real problem, then smaller stuff.

## What's actually fixed now (verified)

- **Category validation** — correct. `FHE.lt` + `FHE.select` clamp to OTHER without ever decrypting. Exactly right.
- **Recipient-SoD check** — correct, fires as a second `createSodFinding` call.
- **ANALYTICS handle grants removed** from `_allowPaymentHandles` — good, matches the "cut it" call; ANALYTICS is cleanly rollups-only now, no more dead grants.
- **`grantHistoricalAccess`** — correctly restricted to FULL only, O(disclosed records), matches the audit-scoping model.
- **`getFindingSignal`** exists and is reachable by SIGNAL/ANALYTICS/FULL — the tier gap from before is closed *mechanically*. (Caveat below.)
- **`escalateFinding`** — works, idempotent, correctly gated to severity 3 + owner/FULL.

## The one real bug: AUTHORIZATION_BREACH is now unreachable by any external auditor

Trace it through: `storeAuthBreachResult` stores the result keyed by **`approver`** — `_testResults[approver][paymentId][testType]`, and the only ACL grant on the `breach` ebool goes to `reviewTestRegistry` and `approver` themselves. No external auditor address appears anywhere in this path.

Now try to actually retrieve it:
- `getTestResult(auditor, paymentId, testType)` requires `msg.sender == auditor || msg.sender == owner`. To read this result you'd have to pass `approver` as the `auditor` argument — but you're checking `msg.sender == auditor`, so only the **approver themselves** or the **owner** can ever call this successfully. No external auditor qualifies.
- `requestFindingCreation` / `recordFindingIfTriggered` both gate on `_requireApprovedAuditor(msg.sender)` (needs ANALYTICS/FULL access) *and* `_hasTestResult[msg.sender][...]`. Since the result is keyed by `approver`, the only way this succeeds is if the approver *is themselves* a registered external auditor with ANALYTICS/FULL — which defeats the entire point, since you'd be asking the person who potentially committed the breach to self-report it.
- Even setting aside the mapping key: the `breach` ciphertext was never FHE-`allow`'d to any auditor address. So even with a hypothetical getter, no auditor could decrypt it. This isn't a permissions-logic bug, it's a missing cryptographic grant — dead end at the ACL layer, not just the Solidity layer.

Net effect: your best FHE showcase (two independently-encrypted values compared without decryption) computes correctly and then the result goes nowhere anyone can act on. Worse than the original paperweight, actually, because now it *looks* fully wired (event emits, storage writes happen, `TestEvaluated` fires) while being just as inert.

**Fix, scoped for your remaining time:** stop keying by approver. This test isn't per-auditor-threshold like MATERIALITY (no auditor configures anything for it), so don't force it through the per-auditor mapping shape at all. Store it once per payment, and grant the ciphertext to every ANALYTICS/FULL auditor the same way `_allowAnalyticsHandle` already does:

```solidity
// in storeAuthBreachResult, replace the approver-keyed storage with paymentId-keyed:
_authBreachResults[paymentId] = breach;
_authBreachValues[paymentId] = authLevelHandle;
_hasAuthBreachResult[paymentId] = true;
```

And in `AuditRegistry.approvePayment`, loop the ACL grant over `_auditors` (ANALYTICS/FULL only) instead of just the approver — same pattern you already use in `_allowAnalyticsHandle`. Then any approved auditor can call a `requestAuthBreachFinding(paymentId)` that checks `_hasAuthBreachResult[paymentId]` instead of the per-auditor variant. Roughly the same line count as what you have, just re-keyed correctly. Worth fixing before demo — this is the test type most directly tied to your "no real controls" complaint from message 1, and right now it's cryptographically inert rather than weak.

## Smaller thing worth a look: `getFindingSignal` reintroduces retroactive access at a different layer

You built `grantHistoricalAccess` specifically so new auditors don't see old payment data by default. But `getFindingSignal`'s gate is just "does `msg.sender` currently have any access level" — it doesn't check `_auditorFindings[msg.sender]` membership at all. So a brand-new SIGNAL auditor added five minutes ago can iterate `findingId` 0 upward and read `testType`/`severity`/`paymentId` for every finding ever created, including ones from before they existed on the system, and including ones triggered by other auditors' tests they never configured. `paymentId` specifically is a linkage leak — it tells them exactly which payment record to go ask for historical access to.

This is exactly the "new investor shouldn't see old transactions by default" problem you designed around, just showing up one layer up (findings instead of payments) where you didn't apply the same discipline. Either gate it on `_auditorFindings[msg.sender]` membership (matches what's already pushed to their feed — cheap, no new storage), or explicitly decide "finding signal is safe to be non-retroactive-scoped because severity/testType alone isn't sensitive" and say so in a comment. Right now it looks unintentional, not decided.

## Two minor items, low priority

- `setApproverTier` never bounds `tier` to 0–3 the way you now bound `category` to 0–7. Since it's `onlyOwner`-set, it's a lower-risk gap than the category one was (no attacker-controlled input), but a garbage tier value silently makes `FHE.lt(tier, authLevel)` always false — quietly disabling breach detection for that approver. Same one-line clamp pattern as category if you have five minutes.
- If `sender == recipient == approver` (self-payment, self-approved), you fire `createSodFinding` twice for the same payment/approver — two redundant findings instead of one. Not wrong, just noisy. Not worth fixing unless you have spare time.

Priority order for what's left: fix the AUTHORIZATION_BREACH keying (it's currently your most-broken-looking-fixed thing), then decide on `getFindingSignal` scoping, then skip the rest unless time allows.