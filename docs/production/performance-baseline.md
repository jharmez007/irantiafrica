# Local performance baseline — 2026-09-24

Repeatable opt-in workload in `ReportingTest::test_opt_in_representative_hardening_workload`; run only with the existing isolated test PostgreSQL 18 target at127.0.0.1:54320, DB`iranti_test`:

```sh
cd backend
IRANTI_INFRA_TESTS=1 IRANTI_HARDENING_PROFILE=1 LOG_CHANNEL=null php vendor/bin/phpunit --filter test_opt_in_representative_hardening_workload
```

**This test recreates the isolated test database. Never point it at retained development or production data.** It refuses another DB name/host and explicitly asserts port54320. Fixed state distribution with generated UUIDs/current relative dates:150 products/variants/balances,120 orders/items,360 inventory movements,90 applied payments,10 returns,5 refunds,235 notification deliveries. Provider HTTP is faked, email array/queues isolated, rate budgets raised only inside profile. This is deterministic in counts/behavior, not byte-identical identifiers/timestamps. It exceeds the initial20–50 product catalog but is not a long-term large-history benchmark.

20 sequential in-process HTTP/kernel samples per endpoint, warm local PostgreSQL, no network/provider latency or concurrency. Representative SQL captured with bound values then EXPLAIN(ANALYZE,BUFFERS); plans and results in ignored `.runtime/hardening-verification`.

| Endpoint | Median ms | p95 ms | SELECT queries, first sample |
|---|---:|---:|---:|
| Products |12.45|13.14|10|
| Search |14.73|15.19|10|
| Cart |6.51|6.87|14|
| Customer order history |12.05|13.15|64|
| Admin inventory |4.63|5.26|7|
| Admin orders |20.88|22.05|85|
| Dashboard |11.74|12.31|34|
| Admin payments |12.31|12.84|65|
| Admin returns |52.21|53.71|221|

Slowest individual SQL execution1.746 ms (search); total explained selects per endpoint≤2.899 ms. Catalog uses eager loading and bounded pagination. Order/payment/return detail projections issue repeated per-row queries (N+1 pattern), most pronounced in returns. This matters when DB is remote and history larger; staging latency/load must be measured before capacity claims. Retain as a performance risk; no speculative indexes added because these plans do not justify one. Small-table sequential scans are not intrinsically a defect. A future batch-projection optimization must preserve role redaction/historical money and pass regression.

Local values are below the proposed catalog500 ms p95 target but **do not satisfy** its30-minute concurrent representative load conditions. Checkout/provider latency and Nigerian mobile field Core Web Vitals remain unverified. No production SLA/capacity claim.

Frontend: production Webpack build, static/dynamic route boundaries retained; responsive pre-generated WebP320/640/1280 sources, intrinsic dimensions, lazy cards/eager selected hero; no original-image storefront serving or arbitrary remote optimizer. CDN cache/real network performance needs staging. See final phase report for browser and build evidence.

Local Chrome375 px cold-cache spot checks (no CPU/network throttling): products TTFB17.6 ms/LCP208 ms; detail18.3/144 ms; login7.1/52 ms. CLS0, no horizontal overflow or CSP violations for these three observations. JavaScript transfer approximately161–175KB per route. These are single lab observations, not mobile field p75 or INP evidence.
