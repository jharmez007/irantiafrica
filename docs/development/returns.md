# Returns — Phase 3J

Implementation baseline v1.0, 2026-09-24. Phase 3I is formally approved; its fulfilment behavior is preserved. This document describes the Phase 3J implementation, pending phase approval.

## Eligibility and policy

The approved business requirement is a same-day request window for damaged, wrong-delivered or defective products. Production clock semantics and physical-receipt requirements have not been approved. **The default is no published policy: requests fail closed with a readable explanation.** No guessed production policy is seeded.

A versioned policy explicitly supplies an anchor (`CREATED_AT`, `PAID_AT`, `SHIPPED_AT`, `DELIVERED_AT`), IANA timezone, `LOCAL_DAY_END` or `ELAPSED_24_HOURS` cutoff, `eligible_states: [DELIVERED]`, physical-receipt boolean, `partial_returns: true`, `delivery_refunds: false`, and the exact three reasons. LOCAL_DAY_END means before the next local midnight, exclusively; it is never interpreted as a rolling 24 hours. ELAPSED_24_HOURS is an explicitly selectable 24 elapsed hours from the chosen anchor, calculated in UTC. Publishing either mode requires an explicit owner policy choice; neither is silently enabled. The documented **development fixture only** uses delivery time, Africa/Lagos, next local midnight and mandatory receipt. Production excludes development-only policy versions.

The owner publishes through `POST /api/v1/admin/returns/policies` with `version_code`, `development_only`, `approval_reference`, and `policy`. Policy rows are immutable. The client must confirm clock/receipt semantics and supply a real approval reference before production activation. This is an activation configuration gate, not a need to invent business policy during implementation.

Stable reasons: `DAMAGED_PRODUCT`, `WRONG_PRODUCT_DELIVERED`, `DEFECTIVE_PRODUCT`. Partial quantities and multiple requests are expressly authorized by the Phase 3J instruction. A request claims numbered historical order units; active unit uniqueness prevents overlap across requests. Rejection and reduced approval release only the unapproved units. Approved claims remain claimed, including when a provider refund fails. No automatic replacement claim or refund retry is offered.

## Identity and endpoints

Authenticated customers use their existing session and can access only their own orders. Guests use the existing order-scoped HttpOnly capability, including its absolute 24-hour expiry and `/api/v1/orders/{id}` cookie path. Email/order number do not authorize access. Expired guest access/recovery remains the previously deferred security/notification task; staff handles operational assistance without weakening access checks.

- `GET /api/v1/orders/{id}/returns`: eligibility, remaining quantities and safe return/refund history.
- `POST /api/v1/orders/{id}/returns`: UUID `Idempotency-Key`, reason, optional explanation, distinct historical order-item IDs and positive JSON-integer quantities. Same key/input replays; changed input conflicts. No customer prices, totals, user ID or status fields.
- `GET /api/v1/admin/returns`: paginated operational queue; optional status filter.
- `GET /api/v1/admin/returns/{id}`: staff detail with allowed actions and internal history.
- `POST .../{id}/review`, `/approve`, `/reject`, `/receive`, `/inspect`, `/restock`: explicit intents, expected version and required evidence/note. Approval supplies every requested line's approved quantity (zero allowed); inspection supplies every approved line's disposition.

Customer and guest UI lives on their existing order detail. Staff uses `/admin/returns`, linked from the workspace and order detail. Financial actions require an explicit confirmation form and password and fresh TOTP reauthentication. No new modal or drawer is introduced.

## Lifecycle and duties

`SUBMITTED → UNDER_REVIEW → APPROVED → RECEIVED → CLOSED`, with direct submitted approval permitted and submitted/under-review rejection to `REJECTED`. An approved policy that does not require receipt may refund from APPROVED and close before physical receipt; subsequent receipt/inspection retains CLOSED. Closing means the refund succeeded, not that inventory was restored. Repeated completed intents are no-ops. Competing approval/rejection conflicts rather than replacing the first decision. Decision, policy, original request and histories cannot be rewritten.

The existing RBAC matrix is unchanged: owner decides, inspects, approves/submits refunds and restocks; Order Processing reviews/intakes and confirms physical receipt; Inventory/Store staff do not acquire extra return permissions. Staff requires completed MFA. Refund approval/submission/reconciliation additionally require authentication within five minutes.

Receipt confirms **all approved units** for this V1 return. Inspection assigns one disposition per approved return line: SALEABLE, DAMAGED, QUARANTINED or DISPOSED. Mixed dispositions for one line and split receipt are not implicit V1 features; staff must not label a mixed batch saleable. A later explicit correction/split workflow would need review. Reverse shipping remains manual; responsibility, costs and communication wording remain client decisions.

Restock is a separate explicit command after receipt and inspection. Only SALEABLE units enter stock through `InventoryService::restockReturn`; a unique `return:restock:{item}` operation creates a compensating immutable RESTOCK movement and audit. No request, approval or provider success automatically restocks. Original sale movements and delivery history remain intact.

## Integrity and evidence

Order locks serialize requests, decisions and refund actions. Active unit unique indexes, historical allocation checks, deferred allocation counts, immutable policy/history/events, quantity bounds and composite order/item foreign keys reinforce service checks. Refunds share the order/payment lock boundary with payment reconciliation. Whole-transaction retries handle deadlocks; no network refund creation is repeated by transaction retries.

ReturnRequested, ReturnReviewStarted, ReturnApproved, ReturnRejected, ReturnReceived, ReturnInspected, ReturnRestocked and ReturnClosed have immutable history/audit. Refund initiation/completion/failure create durable events in the same database transaction. Notification delivery remains Phase 3K. See [refunds](refunds.md), [design refinement](../architecture/adr/016-return-unit-allocation.md) and [verification report](phase-3j-report.md).
