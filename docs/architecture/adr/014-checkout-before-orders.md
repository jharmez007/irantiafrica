# ADR-014 — Checkout preparation before orders and atomic configuration versions

Date: 2026-09-23. Status: **IMPLEMENTED under the client's authorized Phase 3F staging and approved A04 semantics.** Phase 3F was subsequently formally approved. No Phase 3G or payment work is authorized by this record.

## Context and authority

Architecture 10/32 originally coupled Phase 3F placement with order/items/outbox and reservation. ADR-013 therefore described an order-owned reference binding at that placement boundary. The latest Phase 3F instruction instead requests checkout sessions/snapshots/reservations preparing for later orders and prohibits beginning Phase 3G. The subsequent A04 approval explicitly directs resuming that scope. This record documents the material staging change; no fake orders, dangling order FKs or altered inventory lifecycle were introduced.

A04 now settles tax-exclusive pricing, per-line HALF-UP, sum of rounded line taxes, separate explicitly configured delivery taxability/rate, and deterministic historical per-unit tax allocation. Actual business rates/treatment remain configuration. The user permits secure database-backed configuration without unnecessary administration UI.

## Implemented physical mapping

Migration `2026_09_23_000009_create_checkout_foundation.php` creates:

- `checkout_sessions`: UUID, XOR current user/guest digest owner, nullable source cart FK plus historical source UUID/version, creation/reserve key/hash, status/version, immutable-version configuration FK, server monetary columns/calculation/fingerprint, expiry/timestamps. One active attempt/cart and account enforced by partial unique indexes. Guest-cart purge nulls the real FK without deleting checkout history; the historical UUID is data, not an ownership capability or deferred FK.
- `checkout_lines`: real checkout/variant FKs, unique variant/attempt, positive quantity, checked integer price/base columns, structured bounded catalog and tax snapshots. Full item sets are preserved; no extra order model or cart price authority.
- `checkout_addresses`: one contact/address snapshot per attempt, independent of the user's mutable saved address.
- `addresses`: minimal user-owned Nigeria fields and indexes supporting explicit save/select/delete. Optional labels/default-address management are omitted from this phase; no order history is implemented.
- `checkout_configurations`: complete immutable effective-dated version bundles holding bounded category tax rules, explicit delivery-tax treatment and bounded destination rate entries. Unique version/start, real approving-owner FK, production/demo flag and JSON object check. Published rows reject update/delete. Each version is effective until the next version start, eliminating overlapping active bundle intervals.

The configuration bundle deliberately replaces the original individually versioned tax_rules/shipping_zones/shipping_rates physical tables at this launch scale. Its validated entries retain category, exact rate, labels, destination, fee, source and active flags; the bundle retains version/effective time/approver. Atomic coordinated publication prevents a half-published product/delivery tax/rate combination. A protected existing-owner/MFA API publishes versions; no new permission or tax administration UI is added. Future granular configuration UI can edit a draft and publish a new complete bundle without rewriting historical accepted snapshots.

## Inventory binding and lock order

The checkout has a unique nullable `inventory_reference_id` FK to real `reservation_references`. Its current reservation and reference form a composite FK to existing `reservations(id,reference_id)`; both pointers are assigned together after a successful hold. Service orchestration passes exactly the checkout's full immutable variant/quantity set to reserveMany. It never creates/changes inventory balances or implements a second stock-locking algorithm.

Owner → cart → checkout → shared configuration lock precedes the approved Inventory reference → generation → sorted products → sorted variants → balances protocol. Configuration publication takes the exclusive counterpart after locking its actor. Distinct checkouts can take shared configuration locks concurrently. Reserve uses a nested transaction/savepoint so a post-lock catalog/configuration mismatch rolls back the entire new hold, while the outer checkout transaction can persist a review outcome. All outer transactions have bounded framework concurrency retry (three attempts).

Reserved revalidation distinguishes its own held units from ordinary available stock. It checks the actual reservation state/deadline and current catalog/configuration, retaining the approved cart's availability-only semantics. No code calls Inventory.consume in Phase 3F. Inventory expiry may run first; checkout reconciles it on the next read/command/scheduler pass. Expiry/release outcomes commit before returning a conflict, never get silently rolled back by an outer failure.

## Lifecycle and snapshot policy

DRAFT → QUOTED → RESERVED represents preparation, full reviewed calculation and a stock hold. QUOTED address edits reset it to DRAFT. REVIEW_REQUIRED, EXPIRED and CANCELLED require explicit restart; cancellation is idempotent and preserves history. No READY_FOR_PAYMENT label implies payment/order functionality exists.

Draft/quote attempts use the existing configured inventory interval from creation (900-second engineering default). A successful hold adopts the Inventory service's actual deadline. Reads/retries never extend it; no automatic reacquisition. New attempts get new reference groups. One active attempt/cart/account prevents accidental duplicate holds.

Current cart/version, catalog and configuration changes invalidate the old attempt, release any hold and preserve prior calculated snapshots. This is not an unconditional price/rate guarantee. Frontend unsaved contact/address edits cannot confirm an old quote. History is read from snapshots; no current tax recalculation rewrites it.

## Security and future boundary

A separate encrypted guest checkout capability and digest grants only its attempt. User IDs come from current authenticated identity, with approved staff MFA. Email matching and login never transfer guest ownership. A merged source cart requires explicit review/restart. Capability access is bounded to expiry plus a short five-minute outcome-display grace; expiration always prevents new holds. API bodies cannot assign ownership, status, price, tax, delivery fee or total. Existing CSRF/origin/no-store controls remain.

Phase 3G must create real order ownership with a unique accepted-checkout/reference association and exact order-item/reservation-item equality. It must revalidate eligible current state and deadline at handoff, and never double-reserve or treat the reference as payment proof. Once orders exist, hold orchestration ownership and expiry responsibility must transition atomically rather than leaving a checkout cleanup command able to release an order-owned hold. This future binding is not implemented or assumed complete here.

## Evidence and tradeoffs

The full regression includes real PostgreSQL last-stock competition, duplicate reserve, cancel versus independent inventory expiry, serialized configuration publication, guest/account isolation, saved-address ownership, MFA-protected publication, exact tax/history/allocation and missing-production-configuration failure. Browser QA exercises the production build and real session/API proxy. Detailed counts and limitations are in the [Phase 3F report](../../development/phase-3f-report.md).

Tradeoffs: complete configuration bundles favor safe coordinated publication over a granular rates UI; stale attempts require explicit restart rather than an implicit price guarantee; guest history has short capability access while account history remains owner-readable. Production retention, supplied rates/coverage, tax/accounting approval and later payment/fulfillment policy remain separate inputs.

## Subsequent Phase 3G handoff
The client has authorized Phase 3G. [ADR-015](015-checkout-order-promotion.md) implements the previously deferred reservation/order binding without changing the approved checkout state vocabulary.
