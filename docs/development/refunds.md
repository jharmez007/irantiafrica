# Refunds — Phase 3J

Implementation baseline v1.0, 2026-09-24. Provider execution remains disabled by default. **PAYSTACK REFUND PROVIDER FLOW NOT VERIFIED.** Synthetic HTTP responses and signed webhook tests do not establish real provider capability or production readiness.

## Calculation and financial control

Only the owner can approve a current approved return, after physical receipt if its immutable policy requires it. The order must have its original applied NGN payment, SUCCESSFUL payment state and no financial hold. Amount is server-calculated from approved historical unit price plus the exact original per-unit tax allocation. Current catalog prices and current tax configuration are never consulted. No floating point is used.

For historical quantity 3, unit price 335 and line tax 101 kobo, the assigned taxes are 34, 34 and 33. Successive single-unit refunds are **369, 369 and 368**, totaling 1,106 kobo. Unique active unit ordinals prevent reusing the higher-tax units across claims. Multi-unit refunds sum those same allocations. Delivery and delivery tax remain excluded; an approved delivery-refund policy would require a reviewed implementation extension before activation.

Approval reserves budget on the original applied receipt. Nonfailed refunds, including UNKNOWN, cannot exceed captured money. A return has one refund intent and one provider creation attempt. Approved amount/allocation and attempt evidence are immutable. Failed and successful observations remain in append-only refund history; failed evidence is never overwritten to retry. An independently reviewed new-attempt workflow is required if the business later wants resubmission of verified failed refunds. No manual off-platform payment workflow is introduced.

## State and provider boundary

`APPROVED → SUBMITTING → PENDING → SUCCEEDED`; ambiguous responses enter UNKNOWN; a verified failed outcome enters FAILED. PENDING/UNKNOWN can be reconciled. Terminal results cannot regress. Return and order status are separate: successful refund closes its return, leaves DELIVERED history and original totals intact, and does not move inventory.

`PaymentGateway::refundPayment` and `verifyRefund` isolate the Paystack HTTP adapter. Production needs both existing payment configuration and `REFUNDS_ENABLED=true`; live mode additionally requires `PAYSTACK_REFUNDS_LIVE_APPROVED=true` after real UAT. No credentials belong in tracked configuration.

The adapter uses the documented [Paystack refund API](https://paystack.com/docs/api/refund/) and [refund lifecycle](https://paystack.com/docs/payments/refunds/). It sends the original transaction reference, integer subunit amount, currency and an opaque internal merchant reference. Creation is followed by a fresh server GET before completion. Provider ID, original transaction ID, amount, NGN currency, test/live domain and merchant reference must all match. Browser assertions and webhook statuses never directly finalize money.

Paystack's documented creation interface does not establish an idempotent POST replay guarantee. Therefore a committed attempt precedes the external call, and a timeout/crash never triggers another POST. A timeout retains reserved budget in UNKNOWN. An owner may supply a candidate provider refund ID for server verification; it cannot bind unless every identity field matches. If the provider cannot be identified safely, the refund remains under manual investigation with its budget reserved. No guessed lookup or email-based matching is used.

## Operations

- `POST /api/v1/admin/returns/{id}/refund/approve`: expected return version and approval note; server derives amount.
- `POST .../{id}/refund/submit`: no amount or provider payload accepted.
- `POST .../{id}/refund/reconcile`: optional numeric provider refund ID for an otherwise unlinked attempt. Existing provider identity cannot be replaced.
- `php artisan refunds:reconcile`: bounded scan dispatches verification jobs; `--inline` verifies directly. Existing queue worker and scheduler run these jobs. No creation retries.

Leases fence stale workers, with bounded backoff and 12 scheduled observations before operator review. Signed refund events enter the existing durable webhook inbox; processing triggers server GET verification for associated in-flight refunds. Duplicate/reordered events are harmless. Scheduler recovery survives Redis outages because intents/inbox live in PostgreSQL. Unknown unlinked attempts require provider investigation. Staff can explicitly verify again after scheduled checks are exhausted.

`refund_attempts` records immutable creation intent, original payment reference, amount and timestamp. Its one-to-one refund links provider identity/current status and all normalized observations in `refund_status_history`. No raw provider body, credential or card data is stored. Durable RefundInitiated, RefundSucceeded and RefundFailed events feed the future notification phase.

Before real execution the owner/provider must confirm supported original payment methods, actual test/live refund outcomes, merchant-reference round-trip behavior, signed refund event shapes, timing/failure behavior and operational reconciliation procedure. Unexpected provider shapes fail closed to UNKNOWN. This remains a production/UAT gate separate from internal implementation approval.
