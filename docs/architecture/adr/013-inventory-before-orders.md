# ADR-013 — Inventory-owned reservations before order implementation

Date: 2026-09-22 · Revision 2 · Accepted and implemented: 2026-09-23

## Status
ACCEPTED AND IMPLEMENTED. The client approved revision 2 in principle and explicitly authorized implementation if its inventory-owned reference model was clean. It has real FK targets throughout and no material schema ambiguity, so that authorization was sufficient. The initial future-order UUID proposal was not implemented. Phase 3C.5 is approved and closed. Phase 3D implementation is ready for its separate phase approval; Phase 3E has not begun. No order/cart/payment implementation is authorized.

## Conflict to resolve
Architecture 08 defines reservations, reservation_items and inventory_movements with order/order-item foreign keys. Phase 3D requires working reservations but prohibits order/cart/payment tables. Revision 1 deferred those foreign keys while storing future-order UUIDs; the revised proposal instead gives every stored relationship a real inventory-owned target now.

## Revised physical mapping

- `inventory`: unchanged approved per-variant balance, low-stock threshold and version.
- **`reservation_references`**: one small inventory-owned row with UUID primary key and created_at. Its sole purpose is durable grouping and serialization of reservation generations. It is not a cart, order, customer identity, or payment record. Internal callers retain its UUID across retries.
- `reservations`: required `reference_id` FK to reservation_references, positive generation, approved ACTIVE/COMMITTED/RELEASED/EXPIRED state, expires_at/closed_at, unique reference/generation, and at most one ACTIVE generation per reference. The group row can be locked even before the first generation exists.
- `reservation_items`: required reservation FK, variant FK and positive quantity; one immutable item per variant per generation. Keep a unique (id, variant_id) key for movement integrity. Complete variant/quantity sets are immutable and must match on retries and later generations of the same reference.
- `inventory_movements`: preserve approved signed deltas, resulting balances, actor FK, nonempty reason, unique operation key and OPENING/RESERVE/RELEASE/SALE/ADJUSTMENT/RESTOCK vocabulary. Replace the future order reference with nullable `reservation_item_id`; enforce its composite FK with variant_id. Reservation movements reference a real item; opening/manual adjustments have no reservation item.

There are **no order_id or order_item_id columns, no missing foreign-key targets, and no polymorphic ownership table** in Phase 3D. Reference grouping adds exactly one inventory-owned table, justified by generation integrity and a narrow row lock. Movements, reservation items and reference identity are append-only; terminal reservation generations are immutable. Only internal application services may create or transition reservations. No public reservation mutation API or administrative override is added.

## Locking and future integration contract
Internal reserve uses the caller's stable UUID to insert the reference if absent and lock it, then locks distinct products, variants and inventory in sorted UUID order. It checks the complete item set and availability in one transaction. Release/consume/expiry lock the same reference, generation and sorted inventory rows. No inventory table lock or catalog-wide advisory lock is required. PostgreSQL wall-clock time is checked after all contested locks for deadline decisions.

Phase 3F must amend Architecture 08's physical mapping: a real order owns one unique `inventory_reference_id` FK to reservation_references; retries use generations within that group. The existing order/current-reservation relationship must enforce membership in the order's reference using a composite key. Real immutable order-item snapshots retain unique (order_id, variant_id). Placement validates exact equality of the complete order variant/quantity set and reservation items under the outer order-first transaction. No fake records are converted into orders and no missing FK is postponed. Any development-only test references remain test data. This binding design must be verified before checkout launches.

Phase 3H invokes consumption only after independently verified payment authority. A reservation reference proves neither customer ownership nor payment. COMMITTED replay is stock-idempotent; a closed/expired generation cannot consume again or silently reacquire stock. A failed payment attempt alone does not release stock.

## Confirmed policies and configurable values
The client has confirmed one shared stock pool and availability = on_hand − reserved. Listings, search, category results and sitemap hide a product if no active variant is available; published informational out-of-stock detail pages remain. Unavailable choices are disabled. Replenishment restores browsing visibility only while editorial publication conditions remain satisfied.

Phase 3D explicitly authorizes a configurable engineering TTL: 15 minutes per generation is implemented as the engineering default, with no in-place extension. A later authorized generation may be created after release/expiry only with the same item set and a fresh atomic availability check. TTL and low-stock threshold values remain operational configuration; no returns/restock workflow is introduced.

## Alternatives and tradeoff
Stub orders violate scope. Future-order UUID columns without FKs were not approved and are absent from this implementation. Nullable future-order fields would still need deferred relationships. An unbacked generic reference avoids one table but loses a natural first-generation row lock and a concrete target for future order binding. The extra grouping row provides those guarantees with a small, inventory-only schema change.

## Implemented contract and validation

Migration `2026_09_23_000007_create_inventory_reservations_and_ledger.php` implements this mapping. The service preserves COMMITTED as the existing architecture's consumed state; no new state vocabulary was introduced. DB constraints enforce movement effects, real/composite references, one active generation and immutable history/terminal states. Complete immutable item-set equality across generations is enforced by the service under the reference lock.

Callers supply an explicit reference UUID plus generation (default 1) and retain both for retries. Replays return the same generation/status, with due ACTIVE replays closed as EXPIRED. A new hold requires the next consecutive generation after release/expiry, the same item set and fresh availability. A stale generation never mutates its successor. Transition calls take the generation's reservation UUID and return an explicit outcome; a late consume commits expiry and returns RESERVATION_NO_LONGER_ACTIVE. Future outer transactions must not roll back that intended expiry while translating the failure outcome.

`INVENTORY_RESERVATION_TTL_SECONDS` defaults to 900 via `config/inventory.php`. An every-minute bounded expiry command invokes the same service; no queue-domain addition. Explicit top-level PostgreSQL 40001/40P01 retries are limited to three attempts with sanitized logging; nested callers own whole-operation retries.

Manual operation keys are bounded to 255 characters, movement reasons to 500 (matching the existing manual API), and kinds to 16. These physical bounds accompany the approved reference mapping; they do not introduce a business workflow. RESTOCK remains vocabulary only. API history omits internal reference/item identifiers and operation keys.

Real PostgreSQL tests passed for last-unit and multi-line competition, double release/consume, expiry versus consume, adjustment versus reserve, replay, archival, post-lock expiry, rollback, constraints and bounded retry injection. Full backend: 93 tests / 1,781 assertions. See [inventory contract](../../development/inventory.md), [concurrency evidence](../../development/inventory-concurrency.md), and [phase report](../../development/phase-3d-report.md). Future order binding and verified payment authority remain mandatory work in their authorized phases, not implemented here.
