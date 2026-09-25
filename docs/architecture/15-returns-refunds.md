# 15 — Returns and refunds
Trace: FR-RET-001–004, FR-POL-001; Q11/Q26/Q32.

Both account owners and securely authorized guests may request returns. Approved reasons are DAMAGED, WRONG_ITEM and DEFECTIVE. **Same day** is confirmed; anchor event, timezone, cutoff and what must occur before cutoff remain undecided. Do not replace this with rolling 24 hours or assume delivery day.

ReturnPolicy is a versioned configuration document: anchor type, local calendar timezone, cutoff rule, eligible order states, accepted reasons, evidence requirements, outcome options and shipping/restock/refund rules. Save policy version and evaluated anchor/cutoff with each request. Before configuration approval, real submissions cannot be launched with guessed eligibility; sandbox fixtures explicitly label test policy. Policy structure can be implemented after approval without hardcoding a legal rule.

## Lifecycle
Request SUBMITTED → UNDER_REVIEW → APPROVED or REJECTED; approved request → RECEIVED (if physical receipt required) → CLOSED. Record requested items/quantities, customer reason, submission time and decision actor/reason. Owner refund approval is mandatory; return approval does not itself move money. Exchange, partial returns/refunds and customer cancellation flows remain policy gates, not newly approved features. Schema may represent quantities/amounts necessary for safe validation without enabling partial outcomes.

Authorize each item against the order. Under order/item locks, cumulative accepted/request-reserved quantities cannot exceed purchased quantity; reject duplicate active claims or require an explicit reviewed replacement. Guest route uses scoped access from [16](16-authentication.md), not order number plus email. Rate-limit access-token issuance and submissions; provide generic recovery responses to avoid enumeration.

Refund belongs to a verified Payment receipt, optionally a ReturnRequest. Amount may include approved item/tax/shipping components; calculation uses original snapshots. Owner reviews exact amount/reason/destination and reauthenticates. Transaction locks payment, reserves refundable budget and creates approved intent + outbox. Sum of successful and in-flight refunds cannot exceed verified receipt amount. No staff can change approved amount after dispatch; changes require new approval.

States: APPROVED → SUBMITTING → PENDING → SUCCEEDED; known rejection → FAILED; network/ambiguous response → UNKNOWN. UNKNOWN continues reserving budget until reconciled. Only verified provider outcome releases failed budget or marks success. Never blind-retry a refund POST after timeout; reconcile using merchant/provider reference and operator investigation where provider lookup is insufficient. Provider refund method/channel capabilities must be confirmed; no manual off-platform payment is silently introduced.

Return/restock is independent from refund. Inspect goods, record disposition, and post a unique inventory movement only for approved saleable quantity. Wrong/damaged/defective items are not automatically saleable. Refund success does not restore stock or rewrite order totals. Financial read model shows original paid amount, successful refunds and remaining net collection separately.

Client owns business outcome/shipping/cancellation/partial/restock decisions and legal sign-off. Developer drafts policy and implements configuration/audit/control. Required acceptance examples: boundary immediately before/after cutoff, guest access, wrong order item, repeated request, concurrent refund approvals, provider timeout, duplicate callback and refund-without-restock.


## Phase 3J implementation refinement — 2026-09-24

The authorized partial-return implementation uses immutable numbered historical units, explicit return-policy versions, intent-specific commands and one safely fenced provider creation attempt per refund. Production policy defaults to unconfigured; delivery refunds remain disabled. See [ADR-016](adr/016-return-unit-allocation.md), [returns implementation](../development/returns.md) and [refund implementation](../development/refunds.md) for the current schema/API/state details. This records Phase 3J implementation for review and does not declare client approval.
