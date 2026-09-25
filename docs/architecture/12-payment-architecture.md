# 12 — Payments and provider boundary
Trace: FR-PAY-001–004, FR-INV-003, NFR02/03/09; ADR-004. **Paystack is the required initial provider.** Card and gateway-confirmed bank transfer are V1; manual proof-of-transfer approval is not the chosen process.

## Contracts and records
PaymentGateway exposes initialize(attempt), verify(reference), parseAuthenticatedWebhook(raw request), queryRefund and requestRefund. Typed results separate known failure, pending, verified success and unknown outcome. PaymentService owns attempts, idempotency and settlement; WebhookHandler authenticates/normalizes inbound events. Orders accepts verified settlement commands and never imports vendor SDK types.

Order is a commercial obligation; PaymentAttempt is one attempt/reference; Payment is a verified external receipt, including excess/anomalous funds. Every attempt has a unique server-generated reference and immutable expected NGN amount. Provider transaction ID and provider/reference are unique. One normal applied receipt/order; duplicate collections are retained as exceptions, not discarded or counted as second sales.

```mermaid
sequenceDiagram
  participant C as Customer
  participant F as Frontend
  participant B as Backend
  participant O as Order / Database
  participant P as Paystack
  participant W as Webhook worker
  C->>F: Confirm reviewed checkout
  F->>B: Place order + idempotency key
  B->>O: Atomic snapshots + reservation + outbox
  O-->>B: Stable order ID
  B-->>F: Order pending payment
  F->>B: Initialize attempt for same order
  B->>O: Persist reference / expected amount
  B->>P: Initialize hosted payment
  P-->>B: Authorization URL or uncertain outcome
  B-->>F: Redirect URL or pending status
  C->>P: Pay by card or gateway transfer
  P->>B: Signed webhook
  B->>O: Durable authenticated inbox
  B-->>P: 200 after durable acceptance
  W->>P: Verify reference server-side
  P-->>W: Status / amount / currency / transaction ID
  W->>O: Lock order; apply receipt + stock once
  P-->>F: Browser return (not proof)
  F->>B: Read authorized order/payment status
  B-->>F: Authoritative status
```

## Initialization, retry and reconciliation
Only order owner/scoped guest can initialize; state, expiry and amount are rechecked. A unique active initialization intent prevents parallel payment windows where possible. Repeated same idempotency key/payload returns the same attempt; changed payload returns 409. A failed attempt can create a new reference against the **same order** after eligibility/stock review. Do not mutate totals of an existing order on retry; stale pricing/retry policy requires client confirmation.

If initialization times out, mark UNKNOWN and verify/query the original reference before creating a replacement. Never assume a timeout means no charge. Customer can close one payment tab and still pay in another; controls cannot prevent all external duplicate collections. Record each receipt and alert owner; only one is applied to fulfillment.

```mermaid
sequenceDiagram
  participant F as Frontend
  participant B as Backend
  participant P as Provider
  participant O as Order / Inventory
  F->>B: Retry existing order
  B->>P: Reconcile earlier unknown attempt
  P-->>B: Confirmed failure / pending / success
  alt Earlier success
    B->>O: Idempotent settlement or exception
    B-->>F: Existing order status
  else Still pending or unknown
    B-->>F: Pending; do not blindly initialize again
  else Confirmed retry eligible
    B->>O: Validate / reacquire reservation if approved
    B->>P: New reference, same order and snapshot total
    B-->>F: New payment handoff
  end
```

## Webhook and application rules
Verify HMAC-SHA512 of **raw body bytes** with gateway secret and constant-time comparison against x-paystack-signature; enforce body limit before processing. Signature failure is rejected. Persist dedupe identity/payload digest and minimal protected normalized fields before 200; if durable persistence fails return retriable 5xx. A request's mere presence or browser redirect cannot fulfill an order.

Deduplicate provider event identity where stable; otherwise digest + provider transaction/reference/type. Receipt uniqueness is final defense across different webhook envelopes. Verify server-side status, expected reference, provider transaction identity, exact integer amount and NGN currency. A valid signature with wrong amount/currency still goes to review. Unmatched reference is quarantined and investigated, never attached by email matching. Outgoing transfer events are not automatically customer payment receipts.

Application locks order, then stock using [09](09-inventory-architecture.md). If reservation is valid, commit receipt application/order/stock/outbox atomically. Expired/unavailable, cancelled, mismatched and extra payments create durable financial exceptions. No webhook retry can deduct stock twice. Avoid automatic late allocation/refund policy until Q10 is approved.

Reconciliation periodically queries pending/unknown attempts, missing webhooks and refund outcomes; worker outage can be recovered from inbox/outbox and reference lookup. Bounded exponential backoff with jitter, retry-after handling and dead-letter/operator alerts. Compare gateway settlement exports against receipt ledger under restricted operator access; reconcile disputes/chargebacks as exceptions, not destructive order edits. Merchant channel availability, limits and responsibility need confirmation before live use.

No card PAN/CVV or reusable payment credentials stored. Hosted gateway UI handles payment entry. Redact authorization URLs/tokens and payload secrets. Refund requests use owner-approved durable intent; unknown provider outcome is reconciled before another POST. Do not assume provider-wide idempotency semantics absent an explicit supported contract.

Sources: [Paystack webhooks](https://paystack.com/docs/payments/webhooks/), [server verification](https://paystack.com/docs/payments/verify-payments/), [refund API](https://paystack.com/docs/api/refund/). Provider retries are useful but not a substitute for our durable inbox/reconciliation.
