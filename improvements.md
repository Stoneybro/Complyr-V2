Both instincts are right, and both have clean fixes that actually make better hackathon demos than what you have now.

## Issue 1: The DoA/authLevel system

You're correct — it's dead weight, and here's specifically why: `_deriveAuthLevel` computes a real encrypted classification via `FHE.select`, but nothing ever *checks* it against anything. `approvePayment` only checks a flat boolean (`authorizedApprovers[msg.sender]`) — there's no concept of an approver's own authority tier, so a "manager" approver can rubber-stamp a BOARD-level payment and the contract has no way to know that's wrong.

The `AUTHORIZATION_BREACH` test makes it worse, not better. Look at when it fires: inside `_recordPayment`, synchronously, before approval could ever possibly have happened. `approved` is *always* false at that point by construction. So this test isn't detecting a breach — it's guaranteed to fire on every single non-ROUTINE payment, every time, with zero signal value. It's not a shaky control, it's a test that always returns the same answer.

There's also a deeper reason this is hard, not just unfinished: you can't cleanly gate a `revert` on an encrypted condition in FHEVM. Solidity control flow needs a plaintext bool, and getting one out of an `ebool` means a Gateway decrypt round-trip. So real *preventive* enforcement of encrypted thresholds is genuinely a multi-transaction, async pattern — not a quick fix. That's almost certainly why it landed as this half-built passive scaffold.

**Recommendation — reframe, don't half-enforce:**

Given your stated goal (auditability, not payment control), don't try to make this a control. Turn it into what it's actually good at: a confidential audit signal.

1. Add per-approver encrypted tiers (`setApproverTier(address, externalEuint8)`) — cheap, one FHE value per approver.
2. Move the check to `approvePayment`, *after* approval happens, where you finally have both values: compute `ebool tierSufficient = FHE.ge(approverTier[msg.sender], payment.authLevel)`. This is a genuine two-encrypted-values comparison — a much better FHE showcase than a static threshold check.
3. Feed that into a renamed test — `AUTHORIZATION_BREACH` now means "approved by someone whose confidential clearance didn't cover this payment's confidential risk tier," which is a real ISA Authorization assertion, computed entirely without ever revealing thresholds or tiers in the clear.

That's maybe 30–40 lines of change and it converts your weakest subsystem into your best "look what FHE lets you do" moment: two independently-encrypted values, never decrypted, compared to produce an audit-only signal.

If you don't have the runway for that: cut it entirely rather than ship it half-working. A judge who reads `AUTHORIZATION_BREACH` firing on literally every non-routine payment will clock it as broken faster than they'll clock it as absent.

One more thing while I'm being blunt: `requestFindingCreation` / `recordFindingIfTriggered` is also a stub — any approved auditor can call `recordFindingIfTriggered(paymentId, testType, true)` and it's just trusted, no actual decryption verification happens. That's a bigger integrity gap than the auth-level thing, sitting in the same "looks enforced, isn't" category. Worth knowing which stub you're more exposed on if a judge starts poking at the Gateway flow.

## Issue 2: Retroactive auditor access

Your architectural instinct (new investor ≠ retroactive visibility) is correct and shouldn't change. But you're solving the audit case with the wrong mental model. You don't need a scan over history — you need **targeted, bounded historical disclosure**, and FHE actually supports this cheaply because ACLs aren't fixed at creation time, they're just never re-granted in your current code.

`FHE.allow()` can be called on an *already-existing* handle at any later point, as long as the contract still has `allowThis` on it (which it does — you set that at creation and never revoke it). So you don't need to loop over all transactions; you need a function like:

```solidity
function grantHistoricalAccess(address auditor, uint256[] calldata paymentIds) external onlyOwner {
    for (uint i = 0; i < paymentIds.length; i++) {
        PaymentRecord storage p = _payments[paymentIds[i]];
        FHE.allow(p.amount, auditor);
        FHE.allow(p.category, auditor);
        FHE.allow(p.authLevel, auditor);
    }
}
```

Gas cost is O(records disclosed), caller-batched, not O(all history). This maps onto how external audits actually work in the real world, too — auditors don't get "everything since the beginning of time" by default, they work from engagement scope and sampling: a specific period, a specific category, a specific set of flagged transactions. You're not under-building by requiring the owner (or the auditor via a request-then-approve flow) to name specific `paymentIds` — you're matching real audit methodology. Building an efficient "scan everything" mechanism would actually be solving a problem real auditors don't have.

Two refinements worth considering:
- Make it a request/approve two-step (`auditor` requests IDs → `owner` approves) rather than pure owner-push, so the audit trail shows *who asked for what*, which is itself a nice compliance artifact.
- Note your rollup totals (`_categoryTotals`, `_recipientTotals`) already partially solve the "new auditor, current state" case — since `_allowAnalyticsHandle` re-grants on every update using the *current* auditor list, a newly added ANALYTICS/FULL auditor gets forward-looking rollup access automatically. The gap is purely at the individual payment-record level, and purely historical. So the fix is smaller than it might feel — you're not retrofitting the whole system, just the leaf records.

This keeps your "clean system" property (no loops, no cron, no scanning), closes the audit gap for the case that actually matters (targeted evidence requests), and is honestly a good FHE talking point in its own right — most people assume FHE ciphertext access is fixed at write time, and demonstrating that ACLs are mutable/re-grantable post-hoc is a detail judges familiar with fhEVM will appreciate.



Good, that's the right call on both. Here's the rest of the pass — bugs, one more paperweight item, and features ranked by whether they're worth your remaining time.

## Bugs/gaps I'd actually fix

**Category isn't range-validated.** `fields.category` is an encrypted `euint8` accepted from the sender with no bound check. Your rollup loop in `_updateRollups` only matches buckets 0–7 (`FHE.eq(category, FHE.asEuint8(i))` for i in 0..7). If a sender submits an encrypted category of, say, 200, it matches nothing — the payment silently vanishes from every category total and from `CATEGORY_CONCENTRATION` testing, while still being recorded as a valid payment. That's a completeness gap an auditor would care about a lot, and it's the same "encrypted input isn't enforced" flavor of bug as your authLevel issue.

Fix is cheap and doubles as a nice demo moment: compute `ebool valid = FHE.lt(category, FHE.asEuint8(8))`, then `category = FHE.select(valid, category, FHE.asEuint8(7))` (force invalid → OTHER) before storing. Validating an encrypted input against a bound *without ever decrypting it* is exactly the kind of thing judges want to see, and right now you're not doing it anywhere.

**Recipient self-approval isn't caught by SoD.** Your `SEGREGATION_OF_DUTIES` check is `sender == approver`. But nothing stops `recipient == approver` — someone approving a payment where they're the one getting paid. That's a real self-dealing/collusion pattern (Authorization + Existence assertions), not just a sender-side issue. Cheap fix, same pattern as existing SoD: add a second plaintext check in `approvePayment` and fire a distinct finding (or reuse SoD with a different narrative hash / a scope flag). I'd add this — it's maybe 5 lines and it's the kind of gap a real auditor would flag on your submission if they read the code closely.

**`escalated` is a second paperweight field.** `Finding.escalated` is declared, defaulted to `false`, and never set `true` anywhere. Same category of issue as authLevel — a field that *looks* like a control but is inert. Two options: implement a minimal `escalateFinding(findingId)` (owner or auditor with FULL access flips it, maybe requires `severity == CRITICAL`) — cheap, and gives you a real "auditor escalates to the board" beat in your demo narrative. Or drop the field. Given how cheap the fix is and how good "escalation path" sounds in a pitch, I'd implement it rather than cut it.

**`recordFindingIfTriggered` has no integrity binding.** Any auditor with an active test can call this with `triggered=true` for anything, with zero proof that a real Gateway decryption happened — it's pure self-report. I flagged this last message; I'd surface it explicitly in your demo/README as a named, intentional V1 limitation ("Gateway callback integration pending — auditor's decrypted result is currently trusted; production version binds this to Gateway's signed callback") rather than let a judge discover it and read it as an oversight. Framed as a known limitation with a clear V2 story, it's a non-issue. Left silent, it's the first thing a technical judge will poke at after your auth-level fix, because it's the same shape of gap.

## Worth flagging, not necessarily fixing

**FHE.allow fan-out cost.** `_allowAnalyticsHandle` and `_allowPaymentHandles` loop over all auditors on every single payment. With 5 auditors and 8 categories that's dozens of `FHE.allow` calls per payment before you even get to findings. Fine at hackathon scale, but if anyone asks about production gas costs, you should already have the answer ready: batching ACL grants, or moving to a pull-based access model where auditors request access to specific handles instead of getting pushed access to everything automatically. Have this in your back pocket for Q&A — don't build it now.

**Reentrant callback shape.** `onConfidentialTransferReceived` receives funds then calls back out to `confidentialTransfer` on the same token mid-callback. Your `nonReentrant` guard protects the registry's own entry point, but you're still doing a receive-then-forward inside someone else's callback context. Probably fine given the token is presumably also yours/well-behaved, but worth a one-line comment in the code acknowledging you've thought about it, since "pass-through custody inside a transfer callback" is exactly the shape auditors trained on DeFi bugs go looking at first.

## Features worth adding if you have time

1. **Encrypted category validation** (above) — do this, it's cheap and it's a real FHE showcase.
2. **Recipient self-approval SoD check** (above) — do this, it's cheap.
3. **Minimal `escalateFinding`** (above) — do this if you're keeping the field at all.
4. A short **README/demo narrative section** explicitly listing your known V1 limitations (Gateway trust, no retroactive default access, STRUCTURING deferred) as *intentional scoping decisions with a stated V2 path*. This matters more than it sounds — hackathon judges reward "I know exactly what I didn't build and why" way more than a system that pretends to be complete. You already write this instinct into your code comments (I can see it — "V1 known limitations" block in ReviewTestRegistry is good); just make sure it's visible in whatever you present, not buried in Solidity comments nobody reads during a demo.

## Skip these — not worth your remaining time

- Time-windowed rollups (daily/monthly totals) — nice dashboard fodder, not core to the FHE story, scope creep.
- Any kind of pagination/cleanup for the `_auditors`/`_findings` arrays — irrelevant at hackathon scale.
- Full Gateway integration for `requestFindingCreation` — genuinely hard, async, and you're better off naming it as a limitation than half-building it under time pressure.
- STRUCTURING — leave it exactly as it is (documented no-op). It's already handled correctly: an explicit, commented deferral is good engineering signaling, not a gap.

If I had to rank your remaining hours: category validation and recipient-SoD first (cheap, real, good FHE story), then the escalation field, then the README limitations section. The Gateway trust gap I'd handle with words, not code.


Short answer: the enum and the FHE ACL grants are real and correctly enforced at the cryptographic layer — but the Solidity getters needed to actually *use* two of the three tiers are missing or mis-gated. So functionally, only FULL works end-to-end today. SIGNAL and ANALYTICS are half-wired.

Walking through each tier against what actually happens:

## SIGNAL ("findings feed only, no handles")

The "no handles" half is real: in `_allowPaymentHandles`, the FHE ACL loop only grants `category`/`authLevel` to ANALYTICS/FULL and `amount` to FULL — SIGNAL auditors get zero FHE grants on individual payments. Correct.

The "findings feed" half is broken. `_createFinding` pushes the `findingId` into `_auditorFindings[auditor]` for anyone with `access != NONE`, so SIGNAL auditors do get IDs via `auditorFindingAt`. But to get the actual content — severity, testType — they need `getFinding()`, and `getFinding` is gated by `_canReadPayment`, which only accepts owner/sender/recipient/reviewTestRegistry/**FULL**. SIGNAL isn't in that list. So a SIGNAL auditor can enumerate finding IDs and read precisely nothing about them. The tier's entire stated purpose doesn't work through any exposed function.

## ANALYTICS ("rollup totals + category handles")

Rollup totals: fully functional. `_canReadAnalytics` correctly includes ANALYTICS, and `getCategoryTotal`/`getRecipientTotal` work as advertised.

Per-payment category handles: the ACL grant happens (`FHE.allow(payment.category, auditor)` for ANALYTICS in the loop) — that part's real. But there's no getter an ANALYTICS auditor can call to retrieve it. `getPaymentHandles` and `getPaymentMeta` both require `_canReadPayment`, which — again — excludes ANALYTICS. So you're granting decrypt permission on a ciphertext handle the auditor has no contract-level way to even look up. It's not a security hole (the grant is legitimate, and Solidity's `private` doesn't hide values from raw storage reads anyway, so no leak there), it's just dead: permission with no path to exercise it. Also inherits the same finding-feed gap as SIGNAL — they get IDs pushed via the `!= NONE` check but can't call `getFinding` either.

## FULL

This one's actually solid. `_canReadPayment` includes FULL, so `getPaymentMeta`, `getPaymentHandles`, and `getFinding` all work; ACL grants for amount/category/authLevel are all issued. End-to-end functional.

## The fix

You need a getter that matches SIGNAL's promise without requiring FULL:

```solidity
function getFindingSignal(uint256 findingId)
    external view returns (uint8 testType, uint8 severity, uint32 triggeredAtBlock)
{
    if (findingId >= _findings.length) revert PaymentNotFound();
    Finding storage f = _findings[findingId];
    if (auditorAccessOnRegistry(msg.sender) == AuditorAccess.NONE) revert Unauthorized(); // or check _auditorFindings membership
    return (f.testType, f.severity, f.triggeredAtBlock);
}
```

Gate it on "is this finding in `_auditorFindings[msg.sender]`" rather than tier level directly — that's actually the more correct check anyway, since it's per-finding visibility, not a blanket tier check. Keep `getFinding` (with the `flaggedHandle`) as FULL-only, since the handle is the "sensitive" part.

For ANALYTICS's dead category/authLevel grant, pick one: either add a `getPaymentCategoryHandle(paymentId)` getter gated at ANALYTICS+, or drop the grant from `_allowPaymentHandles` for ANALYTICS entirely and simplify the tier back down to "rollups only" — which honestly matches your V1 scope better and is less work. I'd cut it rather than build the getter; "rollups only" is a cleaner, more defensible tier boundary for a hackathon demo than "gets a handle to a value it has no way to read."

One more small inconsistency worth resolving either way: right now *both* SIGNAL and ANALYTICS silently get finding-feed entries via the `!= NONE` check, even though only SIGNAL's tier description mentions findings. Decide if that's intentional ("everyone above NONE sees findings exist, tiers only differ on handle depth") and say so, or restrict the push to SIGNAL/FULL only. Either is defensible — just don't leave it accidental, because right now it reads like nobody decided.