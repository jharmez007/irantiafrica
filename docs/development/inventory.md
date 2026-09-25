# Inventory implementation and service contract

Phase 3D implementation baseline v1.0 · 2026-09-23 · ready for approval. [ADR-013 revision 2](../architecture/adr/013-inventory-before-orders.md) is accepted and implemented under the client's latest authorization. Phase 3C.5 remains approved and closed; Phase 3E has not begun.

## Source of truth and schema

PostgreSQL is authoritative. One shared saleable stock pool exists per ProductVariant, including the default variant of a simple product. Redis is never consulted to authorize stock changes. `available = on_hand - reserved` is derived in SQL/read projections and `Inventory::available()`, not stored.

| Table | Responsibility and integrity |
|---|---|
| `inventory` | Unique restrictive variant FK; integer on_hand/reserved/low_stock_threshold; positive bigint version. Checks enforce `0 <= reserved <= on_hand <= 2147483647`. Immutable identity; no delete/truncate. |
| `reservation_references` | Inventory-owned UUID and timestamp. Durable grouping/serialization across generations. Append-only identity with a real future FK target. |
| `reservations` | Reference FK, positive generation, ACTIVE/COMMITTED/RELEASED/EXPIRED, expiry/closure/creation/update timestamps. Unique reference/generation, at most one ACTIVE generation per reference, unique id/reference for future membership binding. Trigger permits only ACTIVE → terminal; terminal rows cannot change or disappear. |
| `reservation_items` | Reservation FK, variant FK, positive integer quantity, unique reservation/variant and unique id/variant. Existing rows cannot be updated/deleted/truncated; the service creates the entire item set once and forbids later additions or changed sets. |
| `inventory_movements` | UUID, variant FK, optional actor FK, unique operation key, kind, signed on-hand/reserved deltas, resulting balances, reason and creation time. Optional item/variant composite FK prevents mismatched reservation movements. Append-only triggers and kind/effect checks. |

Migrations `000006` and `000007` create the balance and reservation/ledger structures respectively. No carts, orders, order_items, payments or checkout tables were introduced. Fresh/reset/reapply was tested on isolated PostgreSQL 18. The additive `000007` migration was also applied to `iranti_local` after confirming it had zero balance rows; no local stock was seeded or modified. An installation with pre-ledger stock data needs an explicitly reconciled opening history, not an invented backfill.

Uninitialized variants have no balance and are unavailable. Opening stock is positive; zero-effect movements are invalid. Threshold defaults to zero; threshold management, forecasting and low-stock notifications are outside this phase. Version is serialized as a string to preserve bigint precision.

## Sole application mutation boundary

Controllers, schedulers and future modules call `App\Inventory\InventoryService`; they never write balances directly. Read-only projections can query PostgreSQL. Direct inserts/updates in tests are isolated fixtures or deliberate constraint tests, not application paths.

| Service method | Contract |
|---|---|
| `initializeStock(variantId, quantity, reason, key, actor)` | Create one balance and OPENING movement; positive integer quantity; cannot overwrite an existing balance. |
| `adjustStock(variantId, delta, reason, key, actor, expectedVersion)` | Apply nonzero signed integer delta; preserve reserved units and bounds; create ADJUSTMENT movement. |
| `reserveMany(referenceId, items, generation = 1)` | Internal atomic full-set reservation; returns a Reservation whose status must be inspected on replay. Each item has only variant_id and positive integer quantity. Duplicate variants are rejected, not silently combined. |
| `release(reservationId)` | Release an active generation once. Due generations close as EXPIRED. |
| `consume(reservationId)` | Consume a valid active generation once; COMMITTED is the approved architecture's term for consumed. |
| `expire(reservationId)` | Release an active generation only when due; return NOT_DUE otherwise. |

Human mutations require a current active actor with `inventory.adjust`. Reasons contain 1–500 printable characters after trimming. Quantity strings, floats and booleans are rejected. A manual operation's UUID key is scoped to actor/kind/variant; its immutable audit payload hash rejects changed input. Exact retries return the prior movement before checking the now-stale version. Balance, movement and human audit event commit or roll back together. Corrections are new ADJUSTMENT movements, never edits to history.

## Internal reference and generation contract

The caller retains a stable UUID reference and explicit generation across retries. This UUID is not an order, customer identity, ownership grant or payment authority. There are no dangling future-order UUIDs or polymorphic owner fields.

The service canonicalizes the complete variant/quantity set in UUID order. Replay, including a request using a different input order, returns the original generation and never extends TTL. A changed set conflicts. If an ACTIVE replay is already due, it closes as EXPIRED before returning that terminal status.

The first generation is 1. After RELEASED/EXPIRED, an explicit next consecutive generation can obtain a fresh hold with exactly the same item set and a new availability check. An ACTIVE generation must be closed (including through `expire`) before requesting its successor. COMMITTED references cannot acquire another generation. Old generation identifiers cannot release or consume a newer hold. New item sets require a new reference, with future orchestration responsible for any replacement workflow.

Fresh reservations require published products satisfying existing category/media conditions, active variants and sufficient available stock under locks. One unavailable line rolls back the reference creation, generation, items, movements and all balance changes.

## Lifecycle, ledger and late consumption

| Transition | Ledger kind | on_hand delta | reserved delta |
|---|---|---|---|
| New ACTIVE hold | RESERVE | 0 | +quantity |
| ACTIVE → COMMITTED | SALE | −quantity | −quantity |
| ACTIVE → RELEASED | RELEASE | 0 | −quantity |
| ACTIVE → EXPIRED | RELEASE | 0 | −quantity |

Transition methods return `ReservationOutcome { code, reservation }`. Exact terminal replay returns that terminal code without another movement. Incompatible terminal requests return `RESERVATION_NO_LONGER_ACTIVE`. `expire` returns NOT_DUE for an unexpired ACTIVE generation. Consuming after the deadline **commits expiry and releases stock**, then returns `RESERVATION_NO_LONGER_ACTIVE`; it does not throw inside that transaction and roll back the expiry. The same failure code accompanies a late explicit release whose actual status becomes EXPIRED.

Future callers must inspect the outcome and must not treat receipt of a Reservation object as success. An outer transaction also owns committing the expiry outcome: throwing/rolling back the outer transaction would undo its nested inventory work. Future payment handling must independently establish payment authority and route late money to its approved revalidation/reconciliation policy. Inventory never automatically reacquires stock. A failed payment attempt alone must not release a hold. No payment workflow is implemented.

OPENING/RESERVE/RELEASE/SALE/ADJUSTMENT/RESTOCK retain the approved vocabulary. RESTOCK is reserved for future authorized return/restock work; there is no callable restock/return workflow now. Automated changes use the immutable ledger rather than duplicating human audit events. Application-service transactions maintain ledger/balance equality; constraints alone cannot prove aggregate equality or defend against a database administrator disabling triggers. Production runtime roles must not own the schema or have DDL/trigger-bypass privileges.

## TTL and expiry operations

`backend/config/inventory.php` reads `INVENTORY_RESERVATION_TTL_SECONDS`, default **900 seconds (15 minutes)**. This is a configurable engineering default, not a final client policy. Values must be positive integers within the signed 32-bit seconds range. There is no in-place extension.

PostgreSQL `clock_timestamp()` after contested row locks determines expiry. A caller that started before the deadline but waited past it cannot consume. The scheduler runs `inventory:expire-reservations` every minute with a five-minute overlap-lock expiry. It selects up to 500 due generations, then invokes the service separately for each. Retry or overlapping execution is stock-idempotent. `--limit` accepts 1–10000; a failure propagates so monitoring sees it and the next run can retry.

```sh
cd backend
/opt/homebrew/bin/php artisan inventory:expire-reservations
/opt/homebrew/bin/php artisan schedule:work
```

The command uses the established scheduler directly; no extra queue or Redis instance is introduced. Delayed expiry conservatively keeps stock reserved; consumers still check the deadline. Monitor scheduler failures and overdue ACTIVE generations before launch. Production must run the approved scheduler infrastructure; `schedule:work` is the local command.

## API, authorization and existing admin UI

All routes below are under `/api/v1`, with trusted-browser checks, cookie sessions, mutation CSRF, current identity, mandatory staff MFA and rate limiting. **No reservation API exists.**

| Route | Permission / purpose |
|---|---|
| GET /admin/inventory | inventory.read; bounded q/page/per_page search and pagination |
| GET /admin/inventory/{variant UUID} | inventory.read; authorized stock projection |
| POST /admin/inventory/{variant UUID}/opening | inventory.adjust; quantity + reason + UUID Idempotency-Key |
| POST /admin/inventory/{variant UUID}/adjustments | inventory.adjust; delta + reason + expected_version + UUID Idempotency-Key |
| GET /admin/inventory/{variant UUID}/movements | inventory.movements.read; bounded history |

Owner/Super Admin can read full stock/history/actor data and perform manual mutations. Inventory/store staff can read quantities/history but cannot adjust; actor fields are omitted and free-text reasons redacted. Order-processing staff get catalog identity and availability boolean only, without counts/thresholds/version/initialization state/history. Customers have no inventory management access. Backend gates enforce the unchanged approved RBAC matrix.

The existing branded `/admin/inventory` UI now has an operational backend: search/pagination, quantities/history, positive opening, signed adjustment, reason, reviewed confirmation, stable retry keys, conflict refresh, and role-aware loading/error states. Internal reference/item IDs and operation keys are omitted from API history; no reservation controls are exposed. The UI design has not changed.

## Storefront and future binding

Listings, search, categories and sitemap product reads require at least one available active variant and existing editorial conditions. Mixed products remain visible when another variant is available. Public projections expose availability booleans, not quantities. Unavailable option choices remain disabled. Published informational out-of-stock detail pages and media remain accessible. Stock changes never publish or unarchive a product.

Tests exercise real service initialization, adjustment, reserve, release, consume and expiry through storefront API reads, plus mixed/archived variants and price filtering. Backend HTTP tests verify MFA, CSRF, RBAC, history and manual APIs; frontend component tests verify the existing admin controls and unavailable selections. No new browser/human visual sign-off is claimed in this phase; Phase 3C.5 human approval remains intact.

Future order implementation must bind a unique real order inventory_reference_id FK, enforce current-generation membership with a composite FK, and validate exact full immutable order-item/reservation-item equality under its outer order-first transaction. No order association or payment authority is inferred from a reference today. See [ADR-013](../architecture/adr/013-inventory-before-orders.md).

Final TTL, low-stock thresholds, launch counts, scheduler monitoring/retention and future payment/return policies remain phase-appropriate configuration or operations inputs. See [concurrency evidence](inventory-concurrency.md) and [Phase 3D report](phase-3d-report.md).
