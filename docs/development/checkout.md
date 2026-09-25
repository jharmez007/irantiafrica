# Checkout and inventory reservation

Phase 3F v1.0 — 2026-09-23. Phase 3E and A04 are approved. Implementation covers preparation, exact tax/delivery totals, snapshots and inventory holds. No order/payment/shipment/refund/return workflow is implemented. [ADR-014](../architecture/adr/014-checkout-before-orders.md) records the physical mapping; [tax](tax.md) and [delivery rates](delivery-rates.md) describe configuration.

## Storage and ownership

Migration `2026_09_23_000009_create_checkout_foundation.php` creates `checkout_configurations`, `addresses`, `checkout_sessions`, `checkout_lines`, and `checkout_addresses`. All core identities use UUIDs and real restrictive foreign keys. A session has exactly one owner (user or guest capability digest), source cart UUID/version, retry identity/hash, lifecycle/version, NGN subtotal/tax/delivery/total, configuration reference, calculation/fingerprint and expiry. Partial unique indexes enforce one active checkout/cart and account. Cart cleanup can null the optional cart FK without deleting checkout history; the historical source UUID grants no authority.

Checkout lines reference real variants and snapshot full requested quantities, price, name, SKU/options/media, catalog versions and tax category. Unique session/variant and checked integer line multiplication prevent duplicate rows/inconsistent bases. Quote tax snapshots preserve exact configuration/rate/basis/rounded amount/allocation. Checkout address/contact is copied independently of a saved address. No item or price is silently dropped. Unknown or invalid cart lines reject begin with owned-cart reconciliation details.

Guests use a **separate** encrypted HttpOnly, host-only, SameSite=Lax `iranti_checkout` capability cookie. Production Secure follows the existing enforced session setting. Its SHA-256 digest is stored, never the raw capability. Creation derives a 256-bit HMAC capability from the already-random guest cart capability and creation retry key, permitting an identical lost-response retry to reissue the same cookie. The application's secret key is not exposed. Browser retry metadata in sessionStorage contains only a creation key, version-body and identity scope, not authoritative prices/address or a capability. If browser storage is unavailable, in-page retries still work.

The checkout cookie is bounded by the attempt expiry plus a five-minute grace for displaying the expired outcome. Server ownership rejects guest access/replay beyond that grace; no mutation can reserve after attempt expiry. Reads never extend the database expiry. A successful reserve updates the cookie to the actual hold deadline plus grace. Account checkouts belong to the current authenticated user, retain MFA checks for staff and remain readable by their owner across sessions. UUID/email alone grants no access.

Logging in never silently transfers a guest checkout. If the cart merges, the old guest checkout requires review because its source changed; cancel/restart from the account cart. Possession of its separate guest cookie permits explicit cancellation during the access window, even while signed in. Starting an account checkout forgets the obsolete guest cookie. Existing cart merge/retention/pricing behavior is unchanged.

## Lifecycle

| State | Meaning and transition |
|---|---|
| DRAFT | Valid initial item snapshot; contact/configuration not fully quoted. Save address here; validate all requirements → QUOTED. |
| QUOTED | Complete server total and review fingerprint, no stock hold. Saving changed address → DRAFT, clearing calculated amounts; unchanged confirmation → RESERVED. |
| RESERVED | Exact immutable item set held through InventoryService; no order/payment authority. Address edits rejected; cancel before changing details. |
| REVIEW_REQUIRED | Source cart/catalog or selected configuration materially changed; release existing hold and preserve old snapshots for review. Explicit new attempt required. |
| EXPIRED | Attempt or linked hold expired/closed; no continuation or automatic reacquisition. |
| CANCELLED | Explicit idempotent cancellation; hold released and history retained. |

Checkout begin leaves the cart intact. DRAFT/QUOTED initially expire after the existing configurable inventory TTL interval (default 900 seconds); a successful reserve uses the Inventory service's actual expiry. This is an engineering default, not a permanent policy. Reads, repeated reserve requests and failed attempts do not extend it. New attempts require explicit action and a new creation key. One existing active attempt must be resumed/cancelled/expired before a different one can start.

Every owned read or command reconciles expiry and current cart/catalog/configuration. Reserved revalidation accounts for the attempt's own hold rather than rejecting it because cart availability now excludes those units. Cart views intentionally retain their approved availability-only behavior. Changed catalog/configuration does not rewrite an accepted snapshot: it requires review and releases the hold. No unconditional price/tax/delivery guarantee is introduced.

## Transactions and inventory binding

Orchestration lives in `CheckoutService`, not controllers. Lock order is owner (where applicable) → cart → checkout → shared configuration publication lock, followed by the existing Inventory reference/generation/product/variant/balance protocol. Configuration publication uses the corresponding exclusive lock; concurrent checkout reads use shared locks. Checkout does not introduce a global inventory lock or duplicate its locking logic.

Reserve requires the reviewed fingerprint/version and Idempotency-Key. A nested transaction invokes `reserveMany` with the complete snapshot item set, then verifies current price/catalog/configuration while the Inventory service's sorted product/variant locks are still held. A change or insufficient stock rolls back the full new hold. The parent transaction records a review outcome without preserving a partial reservation. Safe failures expose no internal reference/generation.

The session's unique reference FK points to `reservation_references`; `(current_reservation_id, inventory_reference_id)` references the existing composite reservation key, enforcing membership. Reserve uses generation one per attempt; retry returns the same hold/deadline. New attempts get new references. Checkout never calls consume. Future Phase 3G orders must uniquely bind the attempt/reference and verify full item-set equality before any subsequent payment authority exists.

Cancellation/expiry call the existing Inventory service. Nested expiry outcomes commit before returning a conflict, so late reserve/read cannot accidentally roll stock release back. PostgreSQL wall-clock time decides expiry after contested locks. The existing inventory scheduler can expire a hold independently; the next checkout read/command reconciles that status. Partial unique active-attempt constraints and stable caller-scoped creation/reserve keys prevent accidental duplicate holds. Operation fields/state/prices cannot be assigned through browser bodies.

## APIs

All routes start with `/api/v1`; success is a `data` envelope with server money strings. Mutations use existing same-origin cookie CSRF, trusted origins and current identity/MFA. Checkout rate limits are 40 principal / 100 network requests per minute through the existing limiter. Saved-address/configuration routes additionally require authentication, with owner configuration grants as documented in tax.md.

| Method/path | Input and behavior |
|---|---|
| GET /checkout/destinations | Controlled state/FCT codes and configured locality choices; no invented fees |
| GET /checkout/current | Most recent owned attempt/current guest capability, or null; reconciles status |
| POST /checkout | expected_version of owned cart + UUID Idempotency-Key; create/replay; HTTP 200 |
| GET /checkout/{id} | Owned snapshot/status read; UUID alone insufficient |
| PATCH /checkout/{id}/address | expected_version, email, and exactly one of address/saved_address_id |
| POST /checkout/{id}/validate | expected_version; calculate current complete quote, no hold |
| POST /checkout/{id}/reserve | expected_version, fingerprint, UUID Idempotency-Key; atomic reservation |
| DELETE /checkout/{id} | Explicit idempotent cancellation and release; returns retained attempt |
| GET, POST /addresses | Own saved-address list and explicit creation; no account/user ID accepted |
| DELETE /addresses/{id} | Own removal; prior checkout snapshot unchanged |
| POST /admin/checkout-configurations | Owner/MFA publication of complete reviewed immutable configuration |

Errors include structured safe codes for missing address/configuration/delivery, cart review, stale versions/fingerprints, conflicting retry keys, existing active attempts and expiry. Reconciliation can include only the caller's safe checkout/cart projection or attempt ID. No public endpoint exposes stock reference IDs/digests. Idempotent replay returns current authoritative lifecycle, not a stale successful reservation after expiry.

## Address and frontend behavior

Nigeria only. Required: recipient, bounded contact phone, street line1, city/town, controlled state/FCT, NG country and checkout contact email. Optional line2/postal code; optional configured locality code. Phone validation permits common separators and 7–15 digits without restricting to a guessed mobile-prefix list. Eleven-digit Nigerian national numbers beginning with zero normalize to +234; no SMS/phone-ownership assertion is made.

Users may select their own saved address or explicitly save a new one while entering checkout details. Guests do not acquire an address book. There are no default-address/label-management features; a minimal bounded 100-address engineering cap and own delete endpoint avoid unbounded storage. Address book edits/deletion do not rewrite checkout contact snapshots.

`/checkout` reuses the approved brand/components and displays contact/delivery, items, subtotal, product tax, delivery tax, total tax, delivery fee and total in NGN. The frontend never computes tax/totals. It shows DEVELOPMENT CONFIGURATION ONLY for sample bundles. A quote must be explicitly confirmed to reserve. Unsaved address/contact edits disable calculation/confirmation until saved; the old visible total cannot silently apply to changed delivery fields.

Loading/errors, missing rates, stale attempts, expiry and cancellation have explicit messages/actions. Checkout polls an active attempt every 30 seconds and displays the actual reservation deadline without an aggressive countdown. The server remains authoritative between refreshes. No payment action is available. Cart checkout links are enabled only when cart lines pass current review.

Inputs have labels and associated errors; state/error regions announce updates. Heading/error focus and stable form state support keyboard use. Responsive summary stays in document flow. Automated axe checks exclude color contrast; real-browser focus/reflow checks supplement them, but a live screen-reader/device certification is not claimed.

## Operations and limits

Apply additive migrations from backend with `/opt/homebrew/bin/php artisan migrate`; never reset `iranti_local`. The scheduler runs `checkout:expire` every minute, up to 500 candidates; retries and overlapping inventory expiry are safe. Manual command: `/opt/homebrew/bin/php artisan checkout:expire --limit=500` (1–10000). Keep the approved local queue/scheduler services; no dedicated checkout Redis store or queue system was introduced.

Configuration must be published explicitly before quoting. Actual tax/exemptions, delivery rates/provider/coverage, final production TTL/anti-abuse tuning, retention/anonymization, invoice content and operations monitoring remain business/production inputs. Attempt history is retained; no blind checkout PII purge or production retention period was invented. Logs include lifecycle event/attempt ID/status only, not contact/address/capabilities. Real external payment/carrier behavior remains unimplemented.

See [Phase 3F report](phase-3f-report.md) for executed tests, browser evidence and the approval boundary.

## Subsequent Phase 3G promotion

Phase 3F is approved. An explicit action can now promote a valid RESERVED checkout into an unpaid order. `order_id` in the projection identifies promotion; `promoted_at` transfers reservation orchestration atomically. A promoted checkout is a historical snapshot, excluded from cleanup/active-attempt uniqueness and blocked from further mutation. Use the order page for current reservation status/cancellation. Cart contents remain intact. An explicit new-checkout action supports a separate purchase; it does not retry payment. See [orders](orders.md) and [ADR-015](../architecture/adr/015-checkout-order-promotion.md).
