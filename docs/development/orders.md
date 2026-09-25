# Orders — Phase 3G

Implementation baseline v1.0, 2026-09-23. Phase 3F is formally APPROVED. Phase 3G is authorized; Phase 3H is not. See [state machine](order-state-machine.md), [ADR-015](../architecture/adr/015-checkout-order-promotion.md), and [verification report](phase-3g-report.md).

## Creation, snapshots and reference

POST /api/v1/orders accepts only checkout_id, positive integer expected_version and the reviewed fingerprint, with a UUID Idempotency-Key. Checkout must belong to the current user or separate guest checkout capability, be RESERVED and still reconcile with its cart/catalog/configuration. InventoryService locks the existing hold and catalog sources, checks the wall-clock deadline and exact complete variant/quantity set; no second reservation or inventory consumption occurs. Full line sums/tax/delivery/total must match.

The transaction copies order-owned item name, SKU, selected options, image reference, quantity, unit/base/tax/line total and historical allocation, delivery/contact address, complete tax/delivery calculation/version, NGN currency and totals. Historical presentation does not join catalog, saved addresses, checkout or current policy. Actual variant/configuration FKs retain traceability and restrictive deletion. Database triggers protect immutable snapshots; no financial/PII purge or anonymization policy is guessed.

The public reference is IRA- plus 20 random uppercase hexadecimal characters (80 bits), generated server-side with cryptographic randomness and a unique database constraint. It is stable and readable for support, not sequential and not an authorization credential or legal invoice number. Internal UUIDs remain distinct. A random collision fails safely at database uniqueness rather than overwriting an order.

One order per checkout, one bound inventory reference/generation per order, caller-scope/key uniqueness and a canonical input hash protect retries. Same key with changed input fails; same checkout with identical confirmation returns the same order even if cancelled. No retry changes prices, creates a second hold or renews expiry.

## Reservation handoff and cart

`promoted_at` excludes checkout from active-attempt uniqueness/cleanup. Its historical state remains RESERVED, with order_id identifying the durable destination. Checkout read does not release on later catalog/config changes; mutation returns CHECKOUT_PROMOTED. This marker and order binding commit atomically. If expiry wins while waiting on inventory locks or before promotion completes, all partial order writes roll back and release/expiry commits correctly.

Orders own subsequent cancellation; inventory's existing minute scheduler still expires holds. Owned/admin detail reconciles expiry; lists calculate effective status using the clock even if the worker is late. Expiry leaves PENDING_PAYMENT and payment-ineligible, not cancelled. The 900-second default/actual original deadline is unchanged. The active cart and every item remain unchanged after placement/cancellation. Phase 3H must handle any successful-payment cart retirement with source/version checks, never blindly clear later edits.

## Ownership and approved cancellation

Account orders belong to the source checkout user. Matching a guest email during registration/login never attaches old guest orders. Own history is available across authenticated sessions; staff identities still require approved MFA.

The client explicitly approved initial guest access via an order-scoped HttpOnly capability and deferred email recovery. Placement derives a domain-separated 256-bit HMAC capability from secret key + placement scope/key so a lost-response retry can recover the same grant. Only a SHA-256 digest and absolute expiry are stored. The encrypted cookie is host-only, SameSite=Lax, production Secure and scoped to `/api/v1/orders/{uuid}`; each order has a distinct cookie. Raw capability never appears in a URL, API JSON, localStorage, logs or history. Reads never extend access. `ORDER_GUEST_ACCESS_SECONDS` defaults to 86400 (24 hours), bounded to 1..604800 by configuration validation. Cookie expiry rounding cannot extend database authorization.

Losing the cookie or exceeding the grant lifetime means that browser cannot retrieve the guest order. Email-link recovery is explicitly **not implemented** and no email/order-number-only lookup is exposed. Later guest returns still require the independently authorized recovery/entitlement workflow; no forced account creation or automatic email claiming is introduced.

The client delegated the unpaid cancellation choice; selected policy permits the owning account, its scoped guest or Super Admin to cancel only PENDING_PAYMENT with no payment activity. Other staff cannot cancel. Require expected version and bounded reason. Release at most once, retain immutable event/status/audit history, and never delete or reopen. In this phase `payment_state=NOT_STARTED` is constrained and no attempt/receipt tables exist. Phase 3H must extend that boundary and deny this cancellation path once initialization/receipt activity exists.

## API contract

Existing same-origin/CSRF/private-no-store/session/current-identity/MFA protections apply. Orders use the existing privacy-preserving principal/network rate-limiter pattern (40/100 per minute). Strict input allowlists reject owner IDs, totals, arbitrary state, tax/fees and unsupported filters.

| Method/path under /api/v1 | Authorization / behavior |
|---|---|
| POST /orders | Owned reserved checkout; idempotent placement/replay, HTTP 201 with safe current order projection |
| GET /orders | Authenticated own list, no guest email lookup |
| GET /orders/{uuid} | Owning account or that order's unexpired guest capability; inaccessible objects return 404 |
| POST /orders/{uuid}/cancel | Same ownership; expected_version and reason, approved unpaid-only transition |
| GET /admin/orders | Current staff MFA + orders.read; operational list |
| GET /admin/orders/{uuid} | Same permission; contact/delivery/items/totals/reservation and neutral payment summary |
| POST /admin/orders/{uuid}/transitions | MFA + orders.read + orders.cancel; only the explicit cancellation command, expected_version/reason; no arbitrary target status accepted |

Lists use cursor pagination of 20, stable created_at/id descending. Optional status PENDING_PAYMENT/CANCELLED and from/to YYYY-MM-DD dates, explicitly UTC, with inclusive day bounds. UI timestamps display Africa/Lagos (WAT), clearly labelled separately from filters. Customers never receive internal actors, cancellation reasons, creation hashes, capabilities, inventory IDs or audit data. Order Processing sees only operational contact/delivery and neutral paid/pending state, not payment provider secrets; Inventory staff are denied all order routes.

## Events and UI

OrderCreated/OrderCancelled are immutable transactional order_status_history entries with UUID, from/to state, actor/source, reason and timestamp; audit metadata records event ID/state. They are durable internal event facts, not proof of email dispatch. No external notification/payment/shipping side effects are triggered. A future relay must checkpoint delivery/dedupe by event ID as documented in ADR-015.

Checkout's final action creates an unpaid order and links its detail. `/account/orders` and `/account/orders/[order]` show own historical records; `/orders/[order]` uses scoped guest access. `/admin/orders` and its detail provide operational filtering/review and permitted cancellation. No payment success simulation or future refund/shipping controls. Retry keys in sessionStorage contain only a UUID, never contact, prices or capabilities; backend uniqueness remains authoritative.

Semantic lists/headings/totals, textual status, labelled filters/reason fields, keyboard buttons, associated error focus and responsive wrapping reuse Phase 3C.5 branding. Guest access limitations and pending-payment status are explicit. See the report for actual test/browser evidence rather than treating this design description as a PASS claim.

## Operations and remaining inputs

Apply only additive migrations using PHP 8.5. Never migrate:fresh the persistent development database. Existing inventory scheduler remains required; no new queue/Redis store or external integration. Locked PostgreSQL tests run only in guarded iranti_test, not iranti_local. Approved tax/rates remain operator configuration inherited from Phase 3F.

Non-blocking for this foundation: production invoice/retention/privacy inputs, final abuse/access TTL tuning, later email recovery delivery, paid-order cancellation, fulfillment evidence and payment late-money/retry policy. No production deployment, payment integration or legal policy approval is implied by Phase 3G acceptance.

## Phase 3H payment extension — 2026-09-23

Phase 3G is formally approved. Its NOT_STARTED-only executable boundary is extended by [Payments](../development/payments.md): separate attempts/verified receipts, PENDING_PAYMENT → PAID or PAYMENT_REVIEW, unchanged CANCELLED history, and financial hold for late/extra money. Cart retention, original reservation lifetime, immutable commercial snapshots and cancellation only before any payment activity remain unchanged. No shipping or refunds are implemented. See the [Phase 3H report](../development/phase-3h-report.md) for current validation and provider limitations.
