# Basic operational reporting

Phase 3L v1 — 2026-09-24. Trace: FR-RPT-001, US-A04, architecture 17/18/22. The client explicitly approved Q14/A09 definitions on 2026-09-24: Africa/Lagos days, applied receipts, successful refunds by completion date, net collections, historical item performance, and separately labelled unapplied receipts/financial holds. This is operational reporting, not statutory accounting or profit analysis.

## Metric definitions

| Metric | Source and exact interpretation |
| --- | --- |
| Gross paid receipts (gross paid revenue) | Sum `payments.amount_minor` where `applied_at IS NOT NULL`, by application date. One applied receipt per order is already enforced by PostgreSQL. Includes historical item value, delivery and tax. Pending/failed/abandoned attempts and unapplied extra receipts never count as sales. |
| Item value / delivery / tax | Sum immutable order subtotal, delivery charge excluding tax, and combined item/delivery tax for those applied receipts. No join to multiple payment attempts. |
| Paid orders | Count of those applied receipts/orders in the application-date window, irrespective of current fulfilment state. |
| Successful refunds | Sum `refunds.amount_minor` where status SUCCEEDED, by `completed_at`, not request/approval/creation date. |
| Net collections (net paid revenue) | Gross paid receipts minus successful refunds in the same reporting window, computed in PostgreSQL numeric/integer arithmetic. A refund of an earlier-period sale may produce negative net collections. This is not tax-exclusive merchandise net sales, accounting profit or recognized revenue. No accounting meaning is invented. |
| Financial holds | Applied receipts on orders whose **current** financial_hold is true remain in gross and appear as a separately labelled included amount/count. Unapplied receipts are counted separately by verification date, excluded from gross; currencies/provider payloads are not mixed into NGN totals. |
| Order states | Orders **created** in range grouped by their **current** state. PENDING_PAYMENT, PAID, PAYMENT_REVIEW, PROCESSING, SHIPPED, DELIVERED, CANCELLED. Not historical status-at-cutoff reconstruction. |
| Current backlog | All current pending-payment/paid/review/processing/shipped counts, independent of selected dates. No invented ageing/SLA breach rule. |
| Payment operations | Attempts created in range grouped by current state. Reconciliation-needed includes INITIALIZING/PENDING/UNKNOWN/REQUIRES_REVIEW. Recent issue rows are bounded and omit references, provider payloads, credentials and customer PII. |
| Inventory | Current active variants in non-archived products, from `inventory`; available = on_hand − reserved. Uninitialized balances are counted separately with null quantities, never represented as known zero. |
| Low / out of stock | Low means available ≤ that balance's `low_stock_threshold`, including zero; out means available = 0 on an initialized balance. Existing per-variant schema default is 0; no permanent business threshold is invented. Threshold launch values remain configuration. |
| Product performance | Historical variant + snapshot name + snapshot SKU groups, ranked by paid item subtotal. Units and value exclude tax/delivery and use receipt application date. Names/SKUs/prices are not read from current catalog. A renamed variant may have multiple historical groups; no misleading retroactive rename. |
| Product refund adjustments | Expand immutable successful refund unit allocations, by completion date; show refunded units, item base and tax separately against historical line groups. May relate to sales outside the selected period. No fan-out of receipt amounts. |
| Returns/refunds | Requests submitted in range grouped by current state; all-date open return count/queue excludes CLOSED/REJECTED. Owner sees refund intents created in range grouped by current status and an all-date follow-up queue (APPROVED/SUBMITTING/PENDING/UNKNOWN/FAILED). Successful refunded money remains completion-date based in sales. |
| Notification health | Owner-only current status counts and PENDING rows with attempts > 0, plus enablement flag. All dates; no recipients/bodies. SIMULATED is not sent, SENT is transport acceptance, UNKNOWN needs investigation. |

## Date, currency and consistency

Storage stays UTC. Business dates use approved `config/reporting.php` Africa/Lagos, independent of browser timezone or host timezone. Today/7d/30d include today; custom inclusive calendar dates become `[local midnight from, local midnight after to)` converted to UTC. Maximum custom interval is 366 inclusive days, ordered valid dates, with no future end. Client timezone/sort/extra parameters, arrays, malformed dates and oversized pages are rejected server-side. Detail pages are 25 rows, page 1–10000; queue previews are 10 rows. Daily aggregates are bounded by the date window and list only days with receipts.

Money fields remain decimal strings of kobo. PostgreSQL `sum(bigint)` uses numeric, avoiding fixed-width aggregate overflow. Net subtraction stays in PostgreSQL. The backend supplies exact signed NGN display strings without floating point; the frontend neither totals nor subtracts amounts. Counts are separate from monetary values.

Each response reads a REPEATABLE READ, READ ONLY database transaction with a 5-second per-statement timeout and read timestamp. No report changes orders, stock, payments, returns or notification state. No report-view audit spam or editable reporting settings were introduced. HTTP response is private/no-store; there is no report cache or cache invalidation dependency. The existing authentication middleware may update its normal session activity outside the read-only report transaction.

## API and permission scope

All endpoints use the existing `/api/v1` response envelope, trusted-browser/session middleware, current identity, mandatory staff MFA, staff-access gate and existing admin rate limit. Query parameters: `range=today|7d|30d|custom`, custom `from`/`to` YYYY-MM-DD, `page`, and stock filter `stock=all|low|out|uninitialized`. Unknown parameters are rejected. The approved `/stock` route is retained rather than introducing a second `/inventory` alias.

| GET endpoint | Existing grant / data |
| --- | --- |
| `/admin/dashboard` | Only sections allowed by current user's grants; no missing section is represented as zero |
| `/admin/reports/sales` | reports.sales (owner) |
| `/admin/reports/products` | reports.products (owner) |
| `/admin/reports/orders` | reports.orders (owner/order processing) |
| `/admin/reports/stock` | reports.stock (owner/inventory store) |
| `/admin/reports/payments` | reports.sales + payments.reconcile (owner) |
| `/admin/reports/returns` | reports.orders + returns.read; refund details additionally require reports.sales |
| `/admin/reports/notifications` | audit.read (owner) |

The 31-permission model is unchanged. Order staff see paid/pending payment summary only, with permitted order states; they do not receive sales totals, refund sums, detailed payment exceptions, stock quantities or notification health. Inventory staff receive stock only, with no customer/order/payment facts. No customer email/address/phone, staff adjustment note/actor, reset token or provider body appears in reporting responses. Opaque order/variant references support follow-up in existing authorized tools.

## Query strategy and measured performance

Dedicated `App/Reporting` services perform bounded aggregate and paginated reads; the controller only authorizes/composes results. Applied receipt uniqueness prevents double counting; sales and refunds aggregate independently before combination. Product facts use separate sold/refunded branches and group after UNION ALL. Stock uses current balances and indexed variant/catalog joins. No N+1 per-row lookups or whole-table PHP collections; all-date operational aggregates are explicit, with bounded detail output.

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) was executed for 23 queries on a **small isolated integration fixture**, covering every report section. Combined recorded query time was about 20.6ms; maximum measured plan execution time 0.061ms. Plans use existing primary/FK-related indexes for joins where appropriate; PostgreSQL reasonably chooses sequential scans for tiny relations/whole-scope counts. This is not production-volume capacity certification. Evidence: ignored `.runtime/reporting-verification/query-plans.json`.

**No indexes or migrations added. No cache added.** Current evidence does not justify either. Existing applied-receipt uniqueness, order status/date, return queue, refund status/due and inventory variant indexes are retained. Monitor latency/timeout and volume; paid application-date and refund completion-date indexes are candidates only if larger representative EXPLAIN evidence supports them. Do not force indexes or hide slow plans behind a cache. At larger volume, remeasure product allocation expansion and all-date queues before production scaling.

## Operations and deferred scope

No new service, queue worker, provider, dependency, or local startup command is required. Open `/admin` using a staff account with completed MFA. Existing native PostgreSQL/Redis/Laravel/Next launcher remains authoritative. No real customer/provider operations occur when reading reports.

Client responsibilities: configure launch thresholds through the approved controlled inventory process, validate representative operational totals in UAT, and name monitoring owners. Developer/deployment responsibilities: enforce grants/MFA, monitor SQL latency, keep timezone/date semantics stable, and repeat plans with representative scale. Threshold editing is not part of this read-only phase; no new unaudited setting endpoint exists.

Deferred: advanced analytics, BI/warehouse/OLAP, segmentation/cohorts, prediction/recommendations, marketing attribution, abandoned-cart reporting, advanced accounting, CSV/PDF exports, new SLAs/alerts/ageing rules, decorative charts and custom report builders. Existing Paystack/refund and email provider production/UAT gates remain unchanged. See [dashboard guide](admin-dashboard.md) and [phase report](phase-3l-report.md).
