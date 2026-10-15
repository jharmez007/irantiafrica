# Cart and persistence

Phase 3E implementation baseline v1.0, 2026-09-23. Phase 3D is approved. The client explicitly approved non-destructive quantity reconciliation and configurable defaults of 99 units per line, 100 distinct variants per cart and 30 days of guest inactivity. Phase 3F is not implemented or authorized by this document.

## Storage and ownership

PostgreSQL owns `carts` and `cart_items`, created by `2026_09_23_000008_create_carts.php`. UUID primary keys, real restrictive user/variant foreign keys, cascading cart-item cleanup, positive quantity/version checks, unique `(cart_id, variant_id)`, and a partial unique active-user index enforce the model. Each cart has exactly one owner: user ID or guest-token digest. There are no price snapshots or new order/payment tables. `converted` is reserved schema vocabulary, not an implemented checkout transition.

Guests get an implicit cart on GET. The capability is 32 cryptographically random bytes encoded as hex; only its SHA-256 digest is stored in PostgreSQL. Laravel encrypts the host-only `iranti_cart` cookie, which is HttpOnly and SameSite=Lax. Secure follows the existing session setting (required in production, false for local HTTP). Neither the raw token nor cart/user ownership IDs appear in cart JSON. Item UUIDs identify lines only within the server-resolved owner's cart.

Every guest read/write refreshes cookie lifetime and database inactivity expiry. An expired or invalid token on GET produces a fresh empty cart and capability; an expired mutation returns `CART_EXPIRED`, requiring a read before retry. A retired merge token cannot mutate its source cart. Losing the cookie loses access to the guest selection; it is not an account-recovery credential.

Accounts have one active cart, derived from the authenticated current identity. The user row serializes creation across devices. Logout preserves that cart; the next login restores it. Staff have no special authority over anyone else's cart and retain their existing MFA requirement. A non-expiring account uses the schema's required expiry field with a year-9999 sentinel; account carts are excluded from guest expiry/cleanup. Clear explicitly removes account items, not the user or cart record.

## Merge and reconciliation

Customer login/registration runs merge after session establishment; authenticated cart reads also reconcile an outstanding guest capability. Staff reconciliation waits until MFA permits cart access. A merge failure does not undo successful authentication: it logs only the exception class, retains the guest selection and prompts retry.

The transaction locks current user, account cart, then guest cart. Guest-only operations never acquire an account/user lock, avoiding an inverted lock dependency. Duplicate variants are summed into one line. The complete merge is checked against configurable hard quantity/line bounds before writing:

- Within bounds: preserve all requested quantities, including unavailable or now stock-limited items. Revalidate and return explicit suggestions. The customer must press the acceptance action or edit/remove the line; no automatic quantity reduction occurs.
- Above a hard bound: merge nothing, preserve both carts and the guest cookie, and return `REVIEW_REQUIRED`. Reduce account quantities/items and refresh the page to retry, or sign out to edit the preserved guest cart. No silent partial merge or discarded overflow.
- Successful merge retires the guest cart and forgets its cookie. Source rows remain until guest retention cleanup. Replaying the old token cannot merge twice.

Retirement and destination writes are atomic. Cookie expiry is delivered after success; a lost response does not restore merge authority. Merge notices remain available in the authenticated session so a later visit to `/cart` can show them.

## Quantities, concurrency and inventory

All add/update quantities must be JSON integers from 1 through `CART_MAX_QUANTITY` (default 99). Adding an existing variant increases its quantity; PATCH sets an absolute quantity. The result must fit currently available stock and the maximum. `CART_MAX_LINES` defaults to 100. These are configurable engineering bounds, not promotional or purchase-entitlement rules.

Mutations require the last returned integer `expected_version`. Cart rows serialize mutations; stale versions return HTTP 409 `CART_VERSION_CONFLICT`. Repeating an add with the same version cannot increment twice. The frontend refetches after failure and never blindly retries an increment. Unique line constraints provide a second safeguard. Database transactions use at most three framework attempts for concurrency failures.

Availability comes from the Inventory service's bulk read-only projection: on-hand minus reserved. Cart actions do not initialize/adjust balances, reserve, release, consume, append inventory movements or emit routine security audit events. Availability is advisory and can change immediately after validation. Checkout must later revalidate and reserve atomically under the approved inventory contract.

## Price authority and line states

Every response bulk-loads current variants, catalog publication eligibility, options/media and inventory availability. Browser prices, totals, cart IDs and user IDs are rejected by request allowlists. Pricing is current catalog NGN integer kobo; checked signed-bigint arithmetic rejects overflow. JSON money is decimal strings, never floating point. There is no authoritative browser/localStorage cart.

| State | Result |
|---|---|
| AVAILABLE | Valid current line, included in subtotal |
| QUANTITY_REVIEW | Requested quantity retained; positive stock-limited suggestion requires explicit acceptance |
| OUT_OF_STOCK | Requested quantity retained; no stock; customer can remove or wait |
| UNAVAILABLE | Retained line with generic name and no hidden catalog name/price/media; customer can remove |
| AMOUNT_REVIEW | Price multiplication exceeds supported amount; retain line and permit reduction/removal |

An archived/draft product or archived/missing variant does not crash or silently remove the line. Real variant FKs restrict physical deletion; revalidation also handles a missing projection defensively. Every successful mutation returns a fully revalidated cart, including unaffected lines.

Line subtotal shows requested quantity times current price when calculable. Cart subtotal includes only AVAILABLE lines; the UI explicitly labels a partial subtotal and explains excluded unresolved lines. Overflow on an existing cart yields a review state/null unsupported total; add/update that would overflow rolls back. Remove/clear remain available to repair it. No shipping, tax, payment fee, discount or final order total is calculated.

The UI announces a price change when it can compare two responses in the current mounted session. On a fresh visit it shows current prices; no historical price snapshot is stored, so it cannot promise a cross-session old-price comparison.

## API

All paths below start with `/api/v1`. Routes use the existing trusted-origin, Sanctum cookie/CSRF, current-identity/MFA and private no-store conventions. Guest access is allowed without bypassing identity checks for signed-in users. Cart throttling uses bounded principal/network rates (60/120 requests per minute); the existing limiter may use Redis, but cart persistence does not.

| Method / path | Allowed body |
|---|---|
| GET /cart | None; creates/resumes and revalidates |
| POST /cart/items | variant_id UUID, quantity integer, expected_version integer |
| PATCH /cart/items/{id} | quantity integer, expected_version integer |
| DELETE /cart/items/{id} | expected_version integer |
| DELETE /cart | expected_version integer |

Success returns HTTP 200 `{data: ...}` with version, currency, lines, item count, subtotal, review flags, configured limits and optional merge notice. Foreign item access is scoped and returns 404. Validation errors use 422; stale/expired/unavailable conflicts use explicit safe 409 codes/messages. No public endpoint accepts another user's/cart's ownership ID. Controllers delegate writes to `CartService`.

## Frontend

`CartProvider` is scoped to the current authenticated identity or guest and discards obsolete asynchronous responses. It loads authoritative data, refreshes on identity changes/window focus, serializes local mutations, and refetches conflicts without replaying writes. A version reset after guest expiry is accepted. Multiple tabs/devices reconcile on focus or mutation; there is no live cross-device push.

The approved product detail selector now enables Add to cart only for an available selected variant. `/cart` has current media/options/prices, quantity controls, remove/clear, explicit stock-reduction acceptance, merge/error/empty/loading states and a semantic summary. The header badge uses server item quantity, with visual 99+ truncation and a full accessible count. Mobile navigation includes the cart. At the Phase 3E baseline checkout was disabled; later approved phases implemented the checkout route and server state machine.

Current customer quantity controls use each public variant's available count minus the quantity already in the cart, capped by the configured per-line limit. Cart responses include `available_quantity` per line without exposing internal inventory columns. When stock falls below a requested cart quantity, the requested quantity remains untouched and the line says how many are available; the customer chooses “Update to X” or removes the line. Conflict responses refresh cart state without automatically replaying an add. A failed product-page add also refreshes that product's public availability and clamps the visible selector. These are UI guards only; transactional server validation, cart version checks and checkout reservations remain authoritative.

Phase 3N customer UX: a successful add opens a native dialog drawer containing the returned line's image, name, options, quantity and server price, with View bag, Checkout when the cart needs no review, and Continue shopping. The drawer does not redirect automatically; Escape and dismissal restore focus to Add to cart. A populated cart shows up to four complementary product cards below the main cart. Discovery is optional and cannot block cart mutation, price confirmation or checkout. It uses public catalogue reads and excludes every cart product. Cart totals, stock advice, version checks and reconciliation remain server-authoritative.

Labels and described error/state messages connect to quantity inputs; status changes use live regions. Controls are keyboard accessible, keep stable line keys/input focus, and move focus to the cart heading after removal/clear. Approved tokens, focus styles, reduced-motion rules and brand assets are retained.

## Operations and verification

From `backend`, apply additive migrations with `/opt/homebrew/bin/php artisan migrate`; never reset the development database. The migration was applied to guarded `iranti_local` on 127.0.0.1:5432 on 2026-09-23, without seeding business data.

`CART_GUEST_RETENTION_DAYS=30` controls guest inactivity. The scheduler runs `cart:purge-guests` hourly; a bounded 500-row batch uses `FOR UPDATE SKIP LOCKED`. Manual command: `/opt/homebrew/bin/php artisan cart:purge-guests --limit=500` (1–10000 permitted). Only expired user-less carts, including retired merge sources, are removed; items cascade. Account carts are never selected. Keep the existing scheduler running; no dedicated cart queue job or Redis store is introduced.

See [testing](testing.md) for isolated PostgreSQL guards and [Phase 3E report](phase-3e-report.md) for executed counts and browser evidence. Backend coverage includes ownership, merge/replay, exact arithmetic, expiry/constraints, current catalog/stock, MFA/CSRF and a real concurrent same-version mutation. Frontend coverage includes transport, state/identity changes, price feedback, focus, reconciliation, layout semantics and axe checks.

Remaining operational inputs are launch catalog/media, final retention-policy wording, production secure-cookie/domain/limiter/scheduler configuration and monitoring. Native screen-reader testing and physical-device testing were not performed in this phase. These do not replace the existing production/UAT gates. Tax/quote/order/reservation binding, guest order proof and payment/shipping policies remain later-phase work, not cart behavior.

## Unfinished-checkout recovery (2026-10-14)

Order placement retains the customer's bag, while its reservation subtracts from general available stock. A line may therefore appear out of stock for a **new** checkout even though an earlier order holds its units. The cart now projects an authorized linked order separately from stock availability, including its original amount, cart-version difference, payment-attempt state and reservation release status. A line is labelled as held by that order only when its own held quantity accounts for the requested quantity; unrelated shortages remain visible. The order's original item and money snapshot never changes when the bag changes.

The recovery panel appears above the bag. A still-eligible unpaid order can resume its existing hosted payment; an active or uncertain attempt is verified before any retry, and a pending hosted attempt reuses its existing authorization. Cancellation uses the owned-order endpoint and a confirmation dialog, and is offered only before payment activity. It never clears the bag. Paid orders direct the customer to the order confirmation; expired/cancelled holds permit a new checkout only after the existing release workflow is confirmed. The normal inventory expiry scheduler remains responsible for releases; the cart does not release stock or add an owner's hold back to public availability.

After an applied, verified payment, the server retires the purchased lines once and advances the cart version. An unchanged cart must exactly match the order snapshot before those lines are removed. If the cart changed, only matching original lines last touched strictly before order placement are removed; new or edited lines remain. A durable per-order reconciliation record prevents payment replays or later status checks from deleting a newly added item. Pending, failed, cancelled and unapplied/review payments never retire cart items. The payment-result page refreshes the server cart so the header count follows this committed state. The owned payment-status read also performs this guarded one-time repair for orders paid before the fix.

`CheckoutService::begin` also enforces this boundary for a fresh checkout key: a linked active hold, unresolved attempt or financial hold blocks another checkout. A confirmed expired/released hold without unresolved payment permits a new checkout, while an unchanged bag from a successfully paid order must be reviewed or edited before another purchase. Existing order/payment idempotency and reservation arithmetic remain authoritative.

Account cart responses include `linked_order`. Guest order capabilities remain HttpOnly and scoped to the order path; the browser stores only a non-secret order ID hint, then calls `GET /orders/{id}/cart-recovery`. That endpoint requires both the scoped order capability and the current guest cart capability, and verifies `source_cart_id`. It returns the linked-order projection and own held quantities without widening either cookie or exposing inventory balance fields. A lost or expired guest order capability cannot be recovered by guessing a reference or email. Cart availability refreshes while an order is pending and after recovery actions.
