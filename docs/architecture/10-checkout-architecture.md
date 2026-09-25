# 10 — Cart and checkout
Trace: FR-CART-001, FR-CHK-001, FR-ACC-005, FR-PRC-001, FR-TAX-001, FR-INV-003.

Guest carts are persisted in PostgreSQL, accessed through a high-entropy opaque cookie whose digest identifies the cart. Secure/HttpOnly/SameSite cookie, expiry and rotation prevent predictable cart IDs granting access. Authenticated carts belong to user IDs. Cart APIs require ownership and CSRF for cookie writes; a cart is not a reservation.

**Merge recommendation for Q12:** on login, lock guest and account carts, combine equal variants with bounded quantities, flag unavailable items, and show authoritative current prices for review. Do not drop lines silently, reserve inventory or place an order. Convert/retire the guest cart and rotate its token atomically. One active cart/user; repeated merge is idempotent. Persistence TTL is operational configuration; expired-cart cleanup does not send abandoned-cart messages.

## Quote and place
Quote accepts cart identity/version, selected destination and shipping selection; the server reads variant prices, validates quantity/status/stock, obtains a configured shipping quote and tax rules, then returns itemized totals, version fingerprints and expiry. Browser totals are ignored. A quote is not a stock hold.

Place-order requires a caller-scoped idempotency key and the reviewed quote fingerprint. In a transaction, lock relevant configuration/variant rows and cart, reject changed versions or invalid address/serviceability, reprice, lock inventory, reserve all units, write immutable order/items/addresses and durable OrderPlaced event. Mark cart CONVERTED and persist the replayable response. A changed price/tax/rate/stock yields a 409 with a fresh quote; customer explicitly reviews it. An idempotent replay returns the same order, never another one.

Payment initialization is a separate recoverable operation against the order. Its failure cannot roll back a committed reservation/order; frontend offers same-order retry/status lookup. Guest order access is issued through a scoped secure capability; account orders retain owner ID. Saved address updates never overwrite snapshots.

## Money contract
All NGN money uses integer kobo in bigint; JSON transmits minor units as decimal strings to avoid JavaScript unsafe-integer conversion. Quantities are bounded positive integers. Calculate in arbitrary-precision integer/decimal arithmetic and convert once using approved rounding; never binary float.

Per line: net = quantity × unit_price − discount; total = net + item_tax. V1 discount is exactly zero; store snapshot field for integrity without discount endpoints/rules. Order grand_total = sum(line net) + sum(item tax) + shipping_net + shipping_tax. Tax total = item tax sum + shipping tax. Reject negative amounts and arithmetic overflow. Tax/rounding policy and reference examples remain Q05/Q07 gates. Do not guess a legal tax rate.

No live carrier quote is required: local versioned rate adapter validates Nigerian location against supplied coverage/rates. Missing rate or tax configuration fails closed with a helpful unavailable message, not free delivery or zero tax.

Address/contact fields are allowlisted, length bounded and minimized; required fields and consent wording require policy review. No forced account creation or silently linked guest orders on matching email. Quote/cart/order state is private/no-store. Checkout is guarded against automated inventory hoarding with rate/quantity/active-reservation limits; approved limits must not discriminate by customer price.

## Phase 3E implementation note — 2026-09-23
Cart implementation follows the approved model and the client-confirmed A07 reconciliation/defaults. See [cart contract](../development/cart.md) for exact API request/version/response semantics, guest lifecycle and non-destructive merge behavior. The implemented cart endpoints also include DELETE /api/v1/cart for explicit clear. Checkout/quote/order sections remain architecture only; Phase 3F has not begun.

## Phase 3F physical/staging amendment — 2026-09-23
The latest client scope stages checkout preparation/reservations before Phase 3G orders. [ADR-014](adr/014-checkout-before-orders.md) is the current physical mapping: checkout session/line/address snapshots, real inventory reference/generation binding, minimal saved addresses and immutable effective-dated checkout configuration bundles. [Checkout API/operations](../development/checkout.md) describes implemented endpoints. A04 is approved; production rates remain external configuration. Historical order-placement/individual configuration-table sections above are future design, not executable Phase 3F order/payment functionality.

## Phase 3G implementation amendment — 2026-09-23

Phase 3F is approved. [ADR-015](adr/015-checkout-order-promotion.md) now defines the implemented checkout-to-order handoff: order-owned immutable snapshots, original reservation binding, atomic promoted marker, retained cart contents, separate neutral payment state, approved unpaid cancellation and scoped initial guest capability. Only PENDING_PAYMENT/CANCELLED are executable. [Orders](../development/orders.md) and [state machine](../development/order-state-machine.md) specify current schema/API and later Phase 3H guards. Earlier generic order/outbox/payment design remains future context where explicitly superseded; no provider, shipment, return or refund implementation is included.
