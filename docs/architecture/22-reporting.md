# 22 — Basic operational reporting
Trace: FR-RPT-001, US-A04; Q14. V1 uses bounded PostgreSQL queries/read models against operational tables. No warehouse, analytics microservice, BI tool, marketing attribution, cohort analysis or prediction.

| Report | Proposed metric definition | Integrity / access |
|---|---|---|
| Sales totals | Applied verified receipt value by paid_at; show item net, shipping and tax separately; successful refunds by refund completion date; net collections = receipts minus refunds | Exclude pending/failed/unapplied duplicate receipts from normal sales; show exceptions separately; owner |
| Orders | Counts/list by created_at and current fulfillment state; paid and unpaid distinguished | No joining multiple attempts to inflate order count; owner/order staff |
| Order status | Current backlog by PENDING_PAYMENT/PAID/PROCESSING/SHIPPED/DELIVERED/CANCELLED/REVIEW | Snapshot as-of display; do not imply historical state-at-date without audit reconstruction |
| Inventory / low stock | on_hand, reserved, available per active SKU; available ≤ configured threshold | No summing product and variant stock twice; owner/inventory role |
| Basic product performance | Sold units and item net totals from successfully applied order items in paid_at range; returned/refunded adjustments shown separately when allocated | Snapshot SKU/name for history; no advanced analytics; owner |

Q14 must approve metric labels, date basis, timezone (recommend Africa/Lagos for business presentation; store UTC), refund attribution and low-stock threshold. Reports are operational summaries, not statutory accounting statements. Overpayments/financial holds should be visibly excluded or separately labeled so totals remain explainable.

Queries use pre-aggregated subqueries per order/payment/refund to avoid fan-out. Bound date range/page sizes, authorize before aggregation, index paid_at/order state/variant and monitor query plans. V1 can query primary database at this scale; no read replica until measured need. Optional short cache keyed by permission scope and filters only after profiling; stock reports should show read timestamp. CSV/export is not assumed required; if added, approve data access/escaping and scope first.

Test known fixture ledger with two failed attempts, one applied payment, a duplicate receipt, refund and cancelled order; totals must reconcile exactly with integer money. Validate timezone boundaries and zero-stock/low-stock conditions. Customer PII is absent from aggregate product/stock views.


## Phase 3L approved implementation definitions — 2026-09-24

The client explicitly approved Q14/A09: Africa/Lagos calendar dates with UTC storage; gross paid receipts include items/delivery/tax by payment application date; successful refunds use completion date; net collections subtract these refunds. Historical product performance uses item value excluding tax/delivery, with refund allocations separately labelled. Unapplied extra receipts are excluded and financial holds separately labelled. [Reporting definitions](../development/reporting.md) specify the exact denominator, bounds, current-state distinction and permissions. The existing per-variant threshold is used; launch values remain non-blocking tuning. No new grants, reporting database, cache, exports or advanced analytics. No material architecture deviation or new ADR is required.
