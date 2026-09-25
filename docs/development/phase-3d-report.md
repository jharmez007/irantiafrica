# PHASE 3D FINAL INVENTORY REPORT

> Subsequent disposition — 2026-09-23: the client formally APPROVED Phase 3D and authorized Phase 3E cart implementation. The readiness/unstarted language below is retained as the historical approval submission. See [Phase 3E report](phase-3e-report.md) for current work.

**Implementation baseline: Phase 3D v1.0 — 2026-09-23. Status: READY FOR APPROVAL.** This supersedes the incomplete 2026-09-22 interim report. Phase 3C.5 Brand & UI Design remains formally approved and closed. Phase 3E Cart has not begun.

The latest client instruction approved ADR-013 revision 2 in principle and explicitly authorized implementation of its clean inventory-owned reference model. That condition was satisfied; no additional schema decision was needed. This report requests Phase 3D acceptance, not renewed ADR approval or authorization for later features.

| # | Required report item | Final implementation and executed evidence |
|---|---|---|
| 1 | Migrations finalized | Existing `2026_09_22_000006_create_inventory_balances.php` plus new `2026_09_23_000007_create_inventory_reservations_and_ledger.php`. Real PostgreSQL fresh/reset/reapply passes. New migration applied additively to verified local iranti_local after confirming zero prior balance rows. No local reset or stock seed. |
| 2 | Inventory tables | inventory, reservation_references, reservations, reservation_items, inventory_movements. UUIDs, restrictive real FKs, positive quantities, balance checks, unique generation/active-reference/operation identities, expiry index and history indexes. No carts/orders/order_items/payments/checkout tables. |
| 3 | Operation/reference strategy | Inventory-owned reference UUID groups explicit generations; the complete canonical variant/quantity set is immutable through service calls. Items reference real variants; movement item/variant composite FK prevents mismatches. Future real orders must bind reference and generation membership; the reference confers no ownership/payment authority. |
| 4 | Stock representation | Integer on_hand/reserved; available derived as on_hand − reserved. PostgreSQL authoritative; Redis never authorizes stock. One shared pool per variant, no catalog stock duplication. Bounds, nonnegative threshold and string-serialized bigint version retained. |
| 5 | Ledger model | Immutable OPENING/RESERVE/RELEASE/SALE/ADJUSTMENT/RESTOCK vocabulary; signed balance deltas, resulting balances, reason, actor when applicable, unique operation and timestamp. Kind/effect checks and append-only triggers. Corrections append ADJUSTMENT; RESTOCK remains vocabulary without a return workflow. Manual ledger + audit + balance writes are atomic. |
| 6 | Reservation lifecycle | Internal reserveMany/release/consume/expire methods. ACTIVE → COMMITTED (consumed), RELEASED or EXPIRED; no terminal mutation. Multi-line holds commit completely or roll back. Late consume commits expiry/release and returns RESERVATION_NO_LONGER_ACTIVE. No implicit stock reacquisition or public reservation mutation. |
| 7 | TTL configuration | `INVENTORY_RESERVATION_TTL_SECONDS=900` engineering default in config/inventory.php and .env.example. No in-place extension; explicit next generation only after release/expiry. Every-minute `inventory:expire-reservations` processes up to 500 candidates through the service; retry-safe and bounded. Final client TTL remains configuration. |
| 8 | Idempotency | Manual UUID key scoped to actor/kind/variant plus immutable input hash; exact replay before version check. Stable reference/generation and exact item sets for reserve; one closing operation key per generation/item. Repeated release/consume/expiry cannot duplicate stock or ledger effects. Old-generation calls cannot change new holds. |
| 9 | Locking strategy | Manual actor → variant → balance. Reserve reference → generation → sorted products → sorted variants → sorted balances. Transitions reference → generation → sorted balances. PostgreSQL wall clock checked after contested locks. No global inventory lock or inventory acquisition of catalog-wide advisory lock. |
| 10 | Deadlock strategy | At most three top-level attempts for SQLSTATE 40001/40P01, 10–30ms jitter, sanitized attempt/exhaustion logs. Nested inventory work is attempted once and outer callers own full retries. PostgreSQL fault injection proves success on attempt three, exhaustion at three, outer single attempt and atomic rollback. Natural lock-order races did not require an invented global lock. |
| 11 | Inventory APIs | Verified list, variant detail, opening stock, signed adjustment and paginated movement history under /api/v1/admin/inventory. Input allowlists, integer validation, UUID idempotency keys, reason/version requirements and conflicts tested. History omits operation keys and internal reservation/item IDs. No reservation routes. |
| 12 | Admin UI | Existing branded /admin/inventory controls now connect to operational storage: stock/read-only projections, opening, adjustment, reason, review/confirm, stable retry, conflict refresh, history, search/pagination and loading/errors. No redesign; only removal of an unused internal-reference response type/fixture. Component tests pass. |
| 13 | Storefront integration | Real service initialize/adjust/reserve/release/consume/expire exercised through catalog API reads. Sold-out browse/search entries disappear; published detail stays informational; replenishment restores eligible visibility without publication changes. Mixed variants, unavailable choices, price filters, archived products and no public quantity disclosure remain verified. |
| 14 | RBAC | Approved backend permissions unchanged: owner full inventory access; inventory/store staff quantities/history but no adjustments and no actor/reason disclosure; order-processing staff boolean availability only; customers denied. MFA, current identity and CSRF checks pass. No reservation authority delegated to customers/admin UI. |
| 15 | Domain tests | Four StockMath unit tests; 12 manual inventory/API tests; 16 reservation lifecycle/constraint/race/retry tests; six catalog-availability tests including real service lifecycle. Covers exact replay, invalid input, closed states, item equality, atomic failures and archival. |
| 16 | PostgreSQL concurrency | All mandatory A–F passed with real separate processes/connections: last unit, opposed multi-line, double release, double consume, expiry versus consume, adjustment versus reserve. Additional same-reference replay, release versus consume, archival, lock wait past TTL, opening/adjustment replay and bounded retry injection passed. Detailed final state observations in concurrency evidence. |
| 17 | Database constraints | Negative on_hand/reserved, reserved > on_hand, invalid threshold/version, zero/invalid movements, duplicate keys/generations/active-reference, invalid items and real/composite FK violations rejected. Ledger/items/references and terminal generations resist update/delete/truncate. Invalid domain transitions produce no second effect. |
| 18 | Frontend results | Clean lockfile npm ci in ignored verification copy; ESLint, full Prettier check, TypeScript and **74 Vitest tests in 9 files pass**. Final default Turbopack production build passes, including /admin/inventory. Existing running development dependencies were not replaced. |
| 19 | Full regression | Unfiltered backend **93 tests / 1,781 assertions pass**, including migration fresh/reset/reapply, identity/session/RBAC/MFA, Redis queue/cache, catalog/media, inventory and mandatory races. Pint and level-8 Larastan pass; Composer validate --strict passes. Read-only native backend, frontend proxy and pages were also checked as recorded below. |
| 20 | Dependency audits | Composer locked audit: **no security advisories**. npm audit: **0 vulnerabilities**. No dependency changes or resolver bypass. The existing approved temporary unsupported ESLint 9.39.5 exception remains under ADR-010; its npm ci warning is not a new inventory blocker. |
| 21 | Architecture deviations | Accepted ADR-013 revision 2 explicitly replaces order-owned physical reservation fields with inventory-owned references/items. Architecture 08/09 and decision register now point to the implemented mapping. COMMITTED retains approved consumed semantics. Bounded reason/key/kind columns and direct scheduled expiry are documented implementation details. No unapproved commerce or brand/RBAC change. |
| 22 | Remaining non-blocking decisions | Final TTL and low-stock thresholds; client launch SKU counts/product content; production scheduler monitoring, restricted runtime DB roles and retention procedures. Future order membership binding, payment authority, late-money reconciliation and return/restock policy belong to later authorized phases. No unresolved Phase 3D schema choice. |
| 23 | Readiness for Phase 3E Cart | Phase 3D is ready for approval. No technical inventory blocker remains for planning the next authorized phase, but **Phase 3E has not begun and requires explicit authorization after Phase 3D acceptance**. |

## Verification record

Executed on 2026-09-23 using PHP 8.5.8, PostgreSQL 18.6, Node 24.14.0/npm 11.9.0 and the existing lockfiles. Destructive tests used only guarded loopback **iranti_test on port 54320**, separate from persistent **iranti_local on 5432**. No production connection or real business stock was used. The isolated test PostgreSQL cluster started for this run was stopped after verification. The pre-existing PostgreSQL/Redis/application development processes were retained.

```sh
# backend; private .env.testing points exclusively at iranti_test
IRANTI_INFRA_TESTS=1 /opt/homebrew/bin/php vendor/bin/phpunit
/opt/homebrew/bin/php vendor/bin/pint --test
/opt/homebrew/bin/php vendor/bin/phpstan analyse --memory-limit=512M --no-progress
/opt/homebrew/bin/php /Users/chiefagu/.config/herd-lite/bin/composer validate --strict
/opt/homebrew/bin/php /Users/chiefagu/.config/herd-lite/bin/composer audit --locked

# frontend; executed in .runtime/inventory-verification/frontend
npm ci --no-fund
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm audit
```

Initial failures were corrected before final checks: repeat fresh migrations required CREATE OR REPLACE for PostgreSQL helper functions; the full suite exposed cached factory hashes from another bcrypt cost, resolved with explicit inventory fixture passwords. Authentication configuration was not weakened. Targeted tests first passed 34/833; the final unfiltered result is 93/1,781 after the API privacy assertions and fixture fixes.

Native local additive migration succeeded. `inventory:expire-reservations --limit=1` completed with zero due rows; `schedule:list` lists the command every minute; `migrate:status` shows all seven migrations applied. Read-only HTTP checks returned 200 for the backend `/api/v1/products`, frontend proxy `/api/v1/products`, `/admin/inventory` page and `/products` page. These page checks do not assert an authenticated browser workflow. No account or stock fixture was created locally. Browser-based visual QA was not repeated or claimed; the existing Phase 3C.5 human approval and design remain intact. Automated HTTP/component/database checks provide the Phase 3D integration evidence.

Supported by [inventory contract](inventory.md), [concurrency results](inventory-concurrency.md), and [accepted ADR-013](../architecture/adr/013-inventory-before-orders.md). No commit, push, deployment or Phase 3E implementation was performed.

**PHASE 3D READY FOR APPROVAL**
