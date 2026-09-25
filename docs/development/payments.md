# Payments — Phase 3H

Baseline: implementation candidate, 2026-09-23. Phase 3G is formally approved. This extends its neutral payment boundary; cart retention, immutable commercial snapshots, guest capability and cancellation policy remain unchanged. No shipping, return, refund, promotion or loyalty workflow is implemented.

## Domain and storage

Migration `2026_09_23_000011_create_payments.php` adds payment-owned records and extends the existing order lifecycle guards:

- `payment_attempts`: immutable intent UUID, order FK, server reference, idempotency key, expected integer-kobo total, NGN, selected hosted method. Evolving state, encrypted authorization URL and leased reconciliation metadata. Unique provider/reference and order/request key; partial unique index allows one INITIALIZING/PENDING/UNKNOWN intent per order.
- `payments`: append-only verified receipt facts, transaction ID stored as a string (including unsigned 64-bit provider IDs), received money/currency/channel/source, application timestamp or exception. Composite attempt/order FK, unique provider transaction and reference, at most one applied receipt per order.
- `webhook_inbox`: authenticated minimal event type/reference/transaction ID, raw-body checksum, dedupe key, receipt time, leased bounded processing/recovery state. No raw authorization, card, bank or customer payload.
- `payment_reconciliation_records`: append-only normalized observations, source, prior/new attempt state, outcome, optional admin actor. Conflicting provider identities remain here; they cannot steal another attempt's receipt.
- `payment_events`: durable, unique business-event journal for future consumers. PaymentSucceeded is unique per order; review event unique per attempt. No notification consumer or email is implemented.

Receipt evidence, attempt identity, order snapshots and status history have database immutability guards. Empty payment tables can roll back for engineering verification; populated attempt/inbox tables refuse rollback. Do not delete financial evidence to force a rollback. Use reviewed data migrations or a verified backup recovery plan.

## Explicit states

| Domain | States and meaning |
| --- | --- |
| Attempt | INITIALIZING (persisted intent), PENDING (provider interaction unresolved), UNKNOWN (timeout/unrecognized or malformed response), FAILED, ABANDONED (only provider-declared), SUCCEEDED (verified and applied), REQUIRES_REVIEW |
| Order payment summary | NOT_STARTED, PENDING, FAILED, ABANDONED, SUCCESSFUL, REQUIRES_REVIEW |
| Order lifecycle | PENDING_PAYMENT → PAID on applied verified receipt; PENDING_PAYMENT → PAYMENT_REVIEW on anomaly/late receipt; existing CANCELLED never reopens; PAID with additional money keeps its lifecycle plus financial hold |

Unresolved/uncertain attempts block fresh attempts. Provider-confirmed FAILED/ABANDONED permits a new attempt on the same still-eligible order and original hold, with a new reference/key. No browser abandonment inference, new reservation, extended deadline, automatic reacquisition, automatic refund or manual paid toggle exists. Once any attempt exists, approved pre-payment cancellation is unavailable, even if all attempts failed.

## Authoritative flow and concurrency

1. Authenticate the account or the order's existing HttpOnly capability. Lock the user (where applicable), then order; recheck ownership/status/configuration and inventory expiry using the existing service.
2. Persist server-generated intent and idempotency binding before network I/O. Derive money, email, currency, reference and callback from stored order/configuration. Reject extra input fields.
3. Call the gateway outside database locks. Never retry an uncertain initialize POST automatically. Same key/method replays its intent; key/method conflict is 409. A concurrent fresh key cannot create a second active intent.
4. Server verification claims a fenced 45-second lease, calls the provider outside database locks, then uses the shared finalizer. Scheduler jobs recheck due time/state when executing, so queued duplicates do not multiply provider calls.
5. Finalization serializes provider transaction identity, then locks order → attempt → the inventory service's reference/reservation/balance locks. Verify reference, expected amount, NGN, environment and supported channel. Never bind by email or browser metadata.
6. For an eligible success, call `InventoryService::consume`. Its database-clock expiry check is authoritative after stock locks. Insert the applied receipt, transition to PAID (never PROCESSING), append immutable history/audit and unique internal event in one transaction. Rollback cannot leave partial stock/order effects.
7. A late success retains an unapplied receipt and review state. Expiry releases stock in the same committed transaction. Extra payments preserve the original paid milestone and set a financial hold. Conflicting identities/mismatches cannot apply money or stock. Replays retain observations without duplicating business success.

## APIs and access

All paths start `/api/v1`. Customer endpoints use existing trusted-origin cookie/CSRF identity and 12 requests/minute per principal plus 40/IP; webhook signature authentication has no customer throttle.

| Method/path | Contract |
| --- | --- |
| POST `/orders/{id}/payment-attempts` | `{method: card|bank_transfer}`, UUID Idempotency-Key; 201 intent plus safe redirect when eligible |
| GET `/orders/{id}/payment-status` | Owned/scoped order summary and latest 50 safe attempts; no raw payload or redirect token |
| POST `/orders/{id}/payment-attempts/{attempt}/verify` | Empty input; verifies stored reference belonging to this owned order |
| POST `/webhooks/paystack` | Exact raw-body signature ingress, durable acknowledgement |
| GET `/admin/payments` | Cursor-paginated attempts; owner `payments.reconcile` and staff MFA |
| GET `/admin/payments/{attempt}` | Safe receipts and latest 100 historical observations |
| POST `/admin/payments/{attempt}/reconcile` | Same verification/finalization, audited actor; no manual success override |

Verification stays under the order path so the approved guest cookie's path restriction continues to work. Guessing an attempt UUID, reference, order number or email grants no access. Absolute guest expiry is unchanged; email recovery remains deferred. Order Processing staff receive only a paid/pending payment summary through their authorized order view; inventory staff have no payment access.

## Frontend

Existing order detail offers hosted card/transfer selection when eligible, displays safe attempt history, and blocks duplicate payment prompts while active. `/orders/{id}/payment-return` ignores query-string success/reference and verifies the latest owned stored attempt. An old return may therefore display a newer attempt; webhook/reconciliation still process every reference independently. Recheck is explicit, not an unbounded polling loop. PAID messaging confirms payment without claiming shipment; pending/failure/review are textual live-region states. The owner workspace is `/admin/payments`.

The app has no card form or provider secret/public-key JavaScript. Authorization URLs are only returned to the authorized initialization caller, checked against HTTPS `checkout.paystack.com`, encrypted at rest and omitted from logs/admin lists. Normalized evidence excludes raw card/authorization/customer fields.

## Verification and operations

See [Phase 3H report](phase-3h-report.md), [Paystack setup](paystack.md) and [reconciliation runbook](payment-reconciliation.md). Production activation requires verified merchant configuration and operational readiness; local fixture success is not external provider certification.
