# Product Recycle Bin lifecycle

Implementation date: 2026-11-10. This document describes local code only; it is not deployment approval.

## Lifecycle and retention model

`draft`, `published`, and `archived` retain their existing catalogue meanings. Recycling is orthogonal state stored on `products` through `removed_at`, `removed_by_user_id`, `recycle_expires_at`, `purge_status`, `purge_block_code`, `purge_block_reason`, and `purge_completed_at`.

A normal product can be moved to the Recycle Bin by an authorized owner. The operation keeps its existing status, UUIDs, variant UUIDs, SKUs, media metadata, inventory balances, movements, and transactional references. It immediately disappears from public catalogue reads, the normal Products table, active Inventory, stale cart eligibility, checkout, and new reservations. Inventory mutations through stale administration requests are rejected.

Recovery is available until the timezone-safe deadline 30 days after the recycle timestamp. Draft and Archived restore to their prior status. Published products are revalidated; a product that no longer meets publication requirements restores as Draft with an explanatory response. Restoration never recreates reservations or changes stock.

Permanent catalogue removal is manual or scheduled and uses the same locked service. It is not physical destruction of protected business history. An eligible product becomes a completed, non-public catalogue tombstone. Product and variant UUIDs, globally unique SKUs, categories/options, ledger history, order/payment relationships, and audit evidence remain. Media is retired; the existing idempotent media-maintenance task removes aged private objects later while retaining media metadata. Positive on-hand stock or an active/reserved hold produces a structured blocked state. No balance is set to zero automatically.

Legacy rows that already had `removed_at` before this migration receive `legacy_review`, no invented deadline, and no automatic purge. Archived products are not migrated into the Recycle Bin.

## Authorization, API, and audit

Owner-only permissions are `catalog.recycle.view`, `catalog.recycle.move`, `catalog.recycle.restore`, and `catalog.recycle.purge`. There is no role bypass. Existing staff MFA, CSRF, session, and API middleware remain in force.

- `GET /api/v1/admin/products/recycle-bin` lists and filters recycled products.
- `POST /api/v1/admin/products/{id}/remove` moves a product to the bin.
- `POST /api/v1/admin/products/{id}/restore-removal` restores within the recovery window.
- `DELETE /api/v1/admin/products/{id}` permanently removes a recycled product and requires current `content_version` plus exact confirmation `DELETE`.

Audit actions are `catalog.product_recycled`, `catalog.product_recycle_restored`, `catalog.product_purge_requested`, `catalog.product_purge_completed`, `catalog.product_purge_blocked`, and `catalog.product_purge_failed`. Automatic actions record `automatic: true`; failures and blockers also retain an outcome and reason. Logs contain product identifiers and exception class only, not customer or payment secrets.

## Scheduler and operational behavior

`catalog:purge-recycled` processes a configured bounded batch (default 50). The Laravel scheduler runs it hourly with single-server and overlap protection. It selects only products whose deadline has elapsed, skips restored/completed/legacy rows, and delays retries of a freshly blocked row for one day. The Recycle Bin exposes pending, blocked, and legacy-review states so operators do not need raw server logs.

The existing queue worker remains required for catalogue image processing and the existing scheduler remains required for both recycle expiry and delayed media cleanup. No Redis schema or new queue is introduced.

## Deployment safety (not authorization to deploy)

1. Take and verify a database backup before applying the migration.
2. Deploy the additive database migration before or with application code. Old application code ignores the nullable fields and continues honoring `removed_at`; new code accepts legacy rows.
3. Run `IdentityPermissionsSeeder` through the approved deployment procedure to replace the retired product-delete grant with the four owner-only recycle grants. Confirm no non-owner receives them.
4. Keep the expiry scheduler disabled until migration, RBAC reconciliation, UI/API smoke tests, and retention behavior are approved. Then enable the normal scheduler process and monitor command exit status, `product_purge_failed` audits, and blocked counts.
5. No cache keys or inventory balances require migration. Normal catalogue reads already derive visibility from the database; restart long-running workers after code deployment.
6. The migration rollback deliberately refuses once lifecycle deadlines or completion evidence exists. Rollback then requires an explicit data reconciliation plan; do not drop those fields or re-expose tombstones.
7. Application rollback before any recycle use is straightforward. After use, retain the new columns and deploy a forward fix so removed products remain hidden.

## Manual local UAT checklist

Use disposable local products only; never production records.

1. As owner, open Products and confirm the Products / Recycle Bin navigation and count.
2. Move one Draft, one Published, and one Archived fixture to the bin. Confirm each leaves Products, Inventory, public listing/search/category/related results, and cannot be newly reserved or checked out.
3. Confirm the modal states 30-day recovery and does not imply stock/history deletion. Double-click/retry once and confirm only one lifecycle transition/audit occurs.
4. Search the Recycle Bin by name and SKU; exercise previous-status, recent, expiring, pending, and blocked filters plus pagination.
5. Restore Draft and Archived fixtures. Confirm status, UUID, variants, SKUs, media, and stock are unchanged and no inventory movement is created.
6. Restore a previously Published fixture that still qualifies, then repeat after retiring its only image; confirm the latter returns as Draft with guidance.
7. Permanently remove a zero-stock/no-active-reservation fixture by typing `DELETE`. Confirm it disappears from the bin, remains unavailable publicly, and its protected tombstone/audits/SKU remain internally retained.
8. Try permanent removal with positive stock and with an active reservation. Confirm specific blockers, unchanged balances/holds, and no checkout/payment/order damage.
9. Advance only isolated test-fixture deadlines, run `catalog:purge-recycled --limit=…`, and confirm due eligible completion, no premature purge, bounded selection, blocked status, and legacy exclusion.
10. Sign in as Order Processing and Inventory staff. Confirm the bin and all recycle actions are absent/forbidden.
11. At 320, 375, 768, 1024, and 1440px, inspect horizontal table scrolling, modal focus/Escape/return-focus, visible focus, disabled submissions, countdown, empty/loading/error states, and no document overflow.

An Empty Recycle Bin bulk action is intentionally not implemented; it requires separate permission, partial-failure, and bulk-confirmation design.
