# 18 — REST/JSON contract inventory
**Design only; no endpoints implemented.** Trace: NFR09/01, approved functional journeys.

All application routes below use /api/v1. Same-origin cookie/CSRF authentication; webhook route is signature-authenticated and CSRF-exempt specifically, not the entire API. Sanctum's CSRF bootstrap is /sanctum/csrf-cookie outside versioned business API. JSON success uses data plus meta/links when needed. Error: error.code, safe message, field errors, request_id; never stack/provider secrets.

201 create, 200 read/update/result, 204 successful deletion/logout, 202 durable pending operation, 400 malformed input, 401 unauthenticated, 403 forbidden, 404 absent/inaccessible object where enumeration matters, 409 version/idempotency/state conflict, 422 field/domain validation, 429 throttled with Retry-After, 503 unavailable without accepted work. A durable order is recoverable even if payment dependency times out.

Cursor pagination for time-ordered orders/audit, bounded page/page_size for small catalog; maximum page size proposed 100. Stable secondary ID ordering. Allowlist sort/filter fields; search length/complexity limits, parameterized queries. Public catalog filters only supported category/options/availability/price semantics. Money values are decimal strings of kobo, timestamps ISO8601 UTC, explicit NGN currency; business date filters use approved timezone.

Idempotency-Key required for order placement, payment initialization, returns, refunds and stock adjustments; recommended for other nontrivial commands. Scope = actor/capability + method + route + key. Store canonical body hash and committed response/resource ID; same key/different payload →409. Concurrent same-key requests serialize/return pending. Financial business keys/receipt constraints remain durable beyond expiring generic response records. Correlation ID generated/validated at edge, propagated to providers/jobs where supported; never used as authorization. Rate limits by operation and principal/network are configurable and return consistent errors. Breaking changes require new API version or explicit migration contract.

| Area | Method / relative path | Authorization / notable contract |
|---|---|---|
| Auth | POST /auth/register; /auth/login; /auth/logout | Public validated registration/login; logout authenticated; CSRF writes |
| Auth | GET /auth/me | Current user/permissions summary, private |
| Auth | POST /auth/password/forgot; /auth/password/reset | Generic issuance; single-use reset |
| Auth | POST /auth/email/verification; /auth/email/verify | Throttled resend; signed/expiring proof |
| Auth | POST /auth/mfa/challenge; /auth/reauthenticate | Approved staff MFA/recent-auth scheme |
| Customer | GET /customer; PATCH /customer | Own minimal profile; no role/status assignment |
| Addresses | GET, POST /addresses; GET, PATCH, DELETE /addresses/{id} | Own saved addresses; snapshot unaffected |
| Catalog | GET /products; /products/{slug}; /categories | Public active/available catalog, safe query filters |
| Search | GET /search?q= | Public bounded catalog search |
| Cart | GET /cart; POST /cart/items; PATCH, DELETE /cart/items/{id} | Account/cart capability; positive bounded qty; cart version |
| Checkout | POST /checkout/quotes | Authoritative quote, no stock hold |
| Checkout | POST /orders | Idempotent place from cart/quote; snapshots/reservation |
| Orders | GET /orders; /orders/{id} | Account list only; own/scoped guest detail |
| Guest access | POST /guest/access-requests; /guest/access-exchanges | Generic issue; proof exchange; never email-only access |
| Payments | POST /orders/{id}/payment-attempts | Own/scoped order; idempotency, retry eligibility |
| Payments | GET /orders/{id}/payment-status | Own/scoped; no secret provider payload |
| Payments | POST /webhooks/paystack | Raw-body signature, inbox persistence, no session required |
| Shipping | POST /shipping/quotes; GET /orders/{id}/shipment | Quote through same contract; owned tracking |
| Returns | POST /orders/{id}/returns; GET /returns/{id} | Own/scoped order, policy and quantity checks |
| Admin catalog | GET, POST /admin/products; GET, PATCH /admin/products/{id} | Granular catalog permissions |
| Admin catalog | POST /admin/products/{id}/publication; /archive | Explicit state commands; historical rows retained |
| Admin variants/options | POST /admin/products/{id}/variants; PATCH /admin/variants/{id}; POST /admin/products/{id}/options | Same-product/completeness/version checks |
| Admin categories | GET, POST /admin/categories; PATCH /admin/categories/{id} | Catalog permissions; cycle checks |
| Admin media | POST /admin/media/uploads; /admin/media/{id}/complete; DELETE /admin/media/{id} | Presigned quarantine, validate then publish, soft retirement |
| Inventory | GET /admin/inventory; /admin/inventory/{variant}/movements; POST /admin/inventory/{variant}/adjustments | Scoped read; owner adjustment + idempotency/reason |
| Admin orders | GET /admin/orders; /admin/orders/{id}; POST /admin/orders/{id}/transitions | Expected version and allowed actor/state |
| Admin shipment | PUT /admin/orders/{id}/shipment; POST /admin/orders/{id}/delivery | Tracking validation; atomic order/shipment state |
| Admin returns | GET /admin/returns; POST /admin/returns/{id}/decisions; /receipts | Owner decision; physical receipt does not refund |
| Admin refunds | POST /admin/payments/{id}/refunds; GET /admin/refunds/{id} | Owner approval/recent auth/budget/idempotency |
| Admin payment | GET /admin/payment-exceptions; POST /admin/payment-exceptions/{id}/resolution | Owner only; validated resolution, no manual “paid” toggle |
| Admin staff | GET, POST /admin/staff; PATCH /admin/staff/{id}/roles; POST /admin/staff/{id}/disable | Owner, recent auth, last-owner guard |
| Admin config | GET, POST /admin/tax-rules; /admin/shipping-rates; /admin/shipping-zones | Versioned config; approved source required |
| Reports | GET /admin/reports/sales; /orders; /stock; /products | Granular basic reports; bounded dates, metric definitions |
| Audit | GET /admin/audit-events | Owner, bounded filters, masked details |

Return/refund/cancellation subcommands are only exposed once corresponding policy is approved. No wishlist/reorder/review/marketing/advanced-analytics routes. A later OpenAPI artifact will define exact schemas after contract review; this inventory does not claim a generated specification exists.

## Phase 3C implementation note — 2026-09-22
Catalog endpoints are now implemented as documented in [catalog.md](../development/catalog.md#api-contracts). Narrow supporting additions are GET /categories/{slug}, POST /admin/options/{id}/values, PATCH /admin/media/{id}, the local signed upload route and fixed-size controlled media reads. Public/API data remain no-store; only verified public immutable derivatives can be cached. A private Next-to-API renderer key selects a separate bounded read budget and grants no business/staff permission. Other inventory/commerce routes above remain future phase contracts.

## Phase 3E implementation note — 2026-09-23
Cart implementation follows the approved model and the client-confirmed A07 reconciliation/defaults. See [cart contract](../development/cart.md) for exact API request/version/response semantics, guest lifecycle and non-destructive merge behavior. The implemented cart endpoints also include DELETE /api/v1/cart for explicit clear. Checkout/quote/order sections remain architecture only; Phase 3F has not begun.

## Phase 3F physical/staging amendment — 2026-09-23
The latest client scope stages checkout preparation/reservations before Phase 3G orders. [ADR-014](adr/014-checkout-before-orders.md) is the current physical mapping: checkout session/line/address snapshots, real inventory reference/generation binding, minimal saved addresses and immutable effective-dated checkout configuration bundles. [Checkout API/operations](../development/checkout.md) describes implemented endpoints. A04 is approved; production rates remain external configuration. Historical order-placement/individual configuration-table sections above are future design, not executable Phase 3F order/payment functionality.

## Phase 3G implementation amendment — 2026-09-23

Phase 3F is approved. [ADR-015](adr/015-checkout-order-promotion.md) now defines the implemented checkout-to-order handoff: order-owned immutable snapshots, original reservation binding, atomic promoted marker, retained cart contents, separate neutral payment state, approved unpaid cancellation and scoped initial guest capability. Only PENDING_PAYMENT/CANCELLED are executable. [Orders](../development/orders.md) and [state machine](../development/order-state-machine.md) specify current schema/API and later Phase 3H guards. Earlier generic order/outbox/payment design remains future context where explicitly superseded; no provider, shipment, return or refund implementation is included.

## Phase 3H payment extension — 2026-09-23

Phase 3G is formally approved. Its NOT_STARTED-only executable boundary is extended by [Payments](../development/payments.md): separate attempts/verified receipts, PENDING_PAYMENT → PAID or PAYMENT_REVIEW, unchanged CANCELLED history, and financial hold for late/extra money. Cart retention, original reservation lifetime, immutable commercial snapshots and cancellation only before any payment activity remain unchanged. No shipping or refunds are implemented. See the [Phase 3H report](../development/phase-3h-report.md) for current validation and provider limitations.

## Phase 3I implementation amendment — 2026-09-24

Phase 3H is formally approved as an implementation baseline; actual external Paystack verification remains a production/UAT gate. The client explicitly authorized one shipment/order, provider-neutral manual fulfilment and staff-confirmed delivery. [Shipping storage/configuration](../development/shipping.md) and [fulfilment service/API](../development/fulfilment.md) are the executable contract: PAID → PROCESSING → SHIPPED → DELIVERED; PREPARED → SHIPPED → DELIVERED shipments; existing approved staff permissions; required saved carrier, tracking number and approved HTTPS link before dispatch; required internal staff delivery evidence. The API uses intent-specific processing/ship/deliver commands plus POST/PATCH shipment preparation, superseding the earlier conceptual generic transition/PUT paths for these operations.

Shipping never recalculates checkout delivery charges or consumes inventory again. Immutable shipment history and durable fulfilment event hooks extend the staged journal approach; no notification transport, carrier adapter, post-payment cancellation, return or refund action is added. Financial holds block preparation/dispatch, but do not erase or prevent recording a delivery fact for an already shipped order. No material architecture deviation or new ADR is required. The [Phase 3I report](../development/phase-3i-report.md) records actual verification separately from pending production logistics configuration.


## Phase 3J implementation refinement — 2026-09-24

The authorized partial-return implementation uses immutable numbered historical units, explicit return-policy versions, intent-specific commands and one safely fenced provider creation attempt per refund. Production policy defaults to unconfigured; delivery refunds remain disabled. See [ADR-016](adr/016-return-unit-allocation.md), [returns implementation](../development/returns.md) and [refund implementation](../development/refunds.md) for the current schema/API/state details. This records Phase 3J implementation for review and does not declare client approval.


## Phase 3L reporting implementation — 2026-09-24

GET `/admin/dashboard` composes only permitted sections. Dedicated read-only endpoints are `/admin/reports/sales`, `/orders`, `/stock`, `/products`, `/payments`, `/returns`, `/notifications`, under the same `/api/v1` prefix and staff MFA. [Reporting guide](../development/reporting.md) records exact grants, approved calendar/metric semantics, bounded validation and pagination. No new permission, command endpoint or export is introduced.
