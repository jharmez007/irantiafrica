# Payments — Phase 3H

## Local initialization follow-up — 2026-10-15

A local order's hosted initialization did not return an authorization URL and was stored as UNKNOWN. Its reservation later expired; the order remains blocked from a new payable attempt pending safe reconciliation. The original Paystack HTTP response was not retained, so its precise failure cannot be reconstructed. A separate TEST-mode diagnostic initialization with the current key, a valid `.com` inbox, NGN amount and the configured channels returned HTTP 200 and a valid hosted URL. No payment was completed by that probe.

The adapter now distinguishes Paystack's definitive 400/401/403/422 initialization rejection from an uncertain timeout, rate limit, server error or malformed response. A definitive rejection records a FAILED attempt and safe HTTP status (never provider body or credentials), allowing a new attempt only while the original reservation remains active. Uncertain responses still block a second attempt. This change is not applied retroactively to existing UNKNOWN intents. The affected local order and cart were not modified.

## Direct checkout handoff — 2026-10-14

Checkout initializes the existing payment service immediately after idempotent order promotion. The additive `2026_10_14_000021_allow_hosted_payment_channel_choice.php` migration permits a `hosted` attempt method so the Paystack page offers the two already-supported channels, card and bank transfer, without another in-app selection. The backend sends only the stored order's NGN integer-kobo amount and approved channel list. The old per-channel Order details recovery controls remain available. The authorization URL remains encrypted at rest, is returned only to an authorized caller, and is checked again by the browser before same-tab navigation. Callback/result presentation is compact and never trusts a query-string success flag; webhook and server verification remain authoritative.

## Local Paystack TEST exercise — 2026-10-14

The untracked local backend environment has `PAYMENTS_ENABLED=true`, `PAYSTACK_MODE=test`, a private `sk_test_` key, and both LIVE approval flags false. Hosted checkout requires no browser public key. For an isolated loopback browser run, `FRONTEND_URL` was temporarily set to `http://127.0.0.1:3000`; restore the normal `http://localhost:3000` after the test. No Render/Resend or LIVE configuration was changed. Paystack rejected a synthetic `.test` email before creating a provider reference; server verification returned “reference not found,” so the first local attempt correctly remained UNKNOWN and must not be called paid. A second order using a syntactically accepted `.com` test address reached Paystack's hosted **TEST** checkout for the exact stored ₦66,112.50 total. Payment completion, callback and reconciliation are recorded separately once observed; a hosted page by itself is not receipt evidence.

Plain localhost cannot receive provider webhooks. Without an approved HTTPS tunnel, use the existing server-side verification/reconciliation path for actual provider outcome and label locally signed duplicate-webhook exercises as simulation, not provider delivery. Keep signature validation enabled.

Baseline: implementation candidate, 2026-09-23. Phase 3G is formally approved. This extends its neutral payment boundary; cart retention, immutable commercial snapshots, guest capability and cancellation policy remain unchanged. No shipping, return, refund, promotion or loyalty workflow is implemented.

## Domain and storage

Migration `2026_09_23_000011_create_payments.php` adds payment-owned records and extends the existing order lifecycle guards:

- `payment_attempts`: immutable intent UUID, order FK, server reference, idempotency key, expected integer-kobo total, NGN, selected hosted method. Evolving state, encrypted authorization URL and leased reconciliation metadata. Unique provider/reference and order/request key; partial unique index allows one INITIALIZING/PENDING/UNKNOWN intent per order.
- `payments`: append-only verified receipt facts, transaction ID stored as a string (including unsigned 64-bit provider IDs), received money/currency/channel/source, application timestamp or exception. Composite attempt/order FK, unique provider transaction and reference, at most one applied receipt per order.
- `webhook_inbox`: authenticated minimal event type/reference/transaction ID, raw-body checksum, dedupe key, receipt time, leased bounded processing/recovery state. No raw authorization, card, bank or customer payload.
- `payment_reconciliation_records`: append-only normalized observations, source, prior/new attempt state, outcome, optional admin actor. Conflicting provider identities remain here; they cannot steal another attempt's receipt.
- `payment_events`: durable, unique business-event journal for future consumers. PaymentSucceeded is unique per order; review event unique per attempt. No notification consumer or email is implemented.
- `cart_payment_reconciliations`: one row per paid order records the guarded source-cart retirement. It is not an inventory movement or a second payment event. Guest cart expiry remains possible because its historical source-cart identifier has no restrictive cart FK.

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
| POST `/orders/{id}/payment-attempts` | `{method: card|bank_transfer|hosted}`, UUID Idempotency-Key; 201 intent plus safe redirect when eligible |
| GET `/orders/{id}/payment-status` | Owned/scoped order summary and latest 50 safe attempts; no raw payload or redirect token |
| GET `/orders/{id}/payment-attempts/{attempt}/resume` | Owned/scoped same-order attempt; returns an existing hosted authorization only while that pending attempt and reservation remain eligible; creates no attempt |
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
