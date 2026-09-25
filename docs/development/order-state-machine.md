# Order state machine — Phase 3G

Baseline v1.0, 2026-09-23. Phase 3F is approved. Phase 3G implements only the pre-payment part of architecture 11.

| From → to | Actor / guard | Transactional effect |
|---|---|---|
| No order → PENDING_PAYMENT | Owned current RESERVED checkout; reviewed version/fingerprint; complete active unexpired matching hold and snapshots | Copy immutable order/items/address/calculation, bind existing inventory reference/generation, append OrderCreated/status/audit, mark checkout promoted. Keep cart unchanged. |
| PENDING_PAYMENT → CANCELLED | Owning customer/scoped guest or Super Admin; expected version; no payment activity (`NOT_STARTED`) | Release remaining active hold once, set cancelled_at/version, append OrderCancelled/status/audit. Preserve commercial records/cart. |
| CANCELLED → CANCELLED | Authorized cancellation replay | Return existing order, no extra history or release. |
| PENDING_PAYMENT + reservation expiry → PENDING_PAYMENT | Inventory scheduler or owned/admin read; database clock | Hold becomes EXPIRED and ineligible; order/history/totals retained. No automatic new hold. |

Cancellation policy was selected under the client's explicit delegation on 23 September 2026. Order Processing staff can read operational orders but cannot cancel; Inventory staff have no order access. Staff MFA and current permissions remain mandatory. Customer ownership does not grant administrative access.

Payment is separate: `payment_state=NOT_STARTED`, `payment.available=false`. There is no payment_failed order state or simulated paid result. PAID/PAYMENT_REVIEW/PROCESSING/SHIPPED/DELIVERED are architecture states for future phases; the current database/API rejects assigning them. Cancellation reasons are bounded printable input; internal actor/reason/audit details are not included in customer status history.

An order-owned hold is no longer controlled by checkout mutations. A promoted checkout remains a frozen historical RESERVED snapshot with order_id, not a promise that its hold is still active. The order projection reads current reservation status/deadline. Every future payment operation must check actual state under locks, not rely on a previously rendered page.

## Phase 3H contract

Before any provider request, atomically record payment activity and make unpaid cancellation ineligible; extend the neutral state/schema intentionally. Serialize cancellation, initialization and settlement on the order. A payment success must be verified server-side against immutable expected amount/currency/reference and the correct reservation generation. Only approved payment application may call inventory consume. Expired/cancelled/unallocatable or mismatched/duplicate money is a durable financial exception; never blindly mark paid or reopen a cancelled order. Retry requires the same order, unchanged totals and explicitly approved reservation-reacquisition policy. No provider behavior is implemented here.

## Phase 3H payment extension — 2026-09-23

Phase 3G is formally approved. Its NOT_STARTED-only executable boundary is extended by [Payments](../development/payments.md): separate attempts/verified receipts, PENDING_PAYMENT → PAID or PAYMENT_REVIEW, unchanged CANCELLED history, and financial hold for late/extra money. Cart retention, original reservation lifetime, immutable commercial snapshots and cancellation only before any payment activity remain unchanged. No shipping or refunds are implemented. See the [Phase 3H report](../development/phase-3h-report.md) for current validation and provider limitations.

## Phase 3I extension — 2026-09-24

The approved payment baseline now feeds authorized manual PAID → PROCESSING → SHIPPED → DELIVERED transitions. See [fulfilment.md](fulfilment.md) for current actor/state/version guards, event names, API and replay rules. The earlier phase-boundary statements above remain historical. Post-payment cancellation, review resolution, refunds and returns remain unavailable. `paid_at` persists across every later milestone and extra-payment review. Shipment PREPARED/SHIPPED/DELIVERED state commits consistently with its order; stock and commercial/address snapshots stay unchanged.
