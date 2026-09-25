# PHASE 3L ADMIN DASHBOARD & BASIC REPORTING REPORT

Implementation baseline **v1.0 — 2026-09-24**. Phase 3K is formally approved; external email delivery/sender/DNS/bounce/mailbox gates remain. The client explicitly approved Q14/A09 operational metric and timezone definitions during this phase. No Phase 3M work is included.

Client disposition: **Phase 3L formally APPROVED**, 2026-09-24. Subsequent production-hardening findings and fixes are recorded in [Phase 3M](phase-3m-report.md); the original implementation evidence below is retained.

| # | Required topic | Implementation / evidence |
| --- | --- | --- |
| 1 | Reporting endpoints | GET `/api/v1/admin/dashboard`; `/api/v1/admin/reports/{sales,orders,stock,products,payments,returns,notifications}`. Existing envelope, authentication/MFA/admin rate limit, strict validated filters and private/no-store response. |
| 2 | Query/read model | Dedicated `App/Reporting` services; REPEATABLE READ, READ ONLY response transaction; 5-second statement timeout. No domain commands or mutation from reporting. |
| 3 | Dashboard metrics | Applied receipts, receipt components, successful refunds, net collections, paid orders, current order states/backlog, current stock, historical product values, payment issues, returns/refunds and email health, restricted by grant. |
| 4 | Sales definition | Only successfully applied verified receipts, by application date. Failed/pending/abandoned attempts and unapplied extra receipts excluded. Counts cannot fan out through multiple attempts. |
| 5 | Net/gross | Gross includes historical items/delivery/tax; net collections subtract successful refunds by completion date. Integer/numeric kobo arithmetic and backend-formatted signed NGN strings; not accounting profit. Current financial-hold subset separately labelled. |
| 6 | Orders | Created-in-range counts/list by current state, including PAYMENT_REVIEW; current all-date backlog separately labelled. No invented historical state reconstruction or SLA breach logic. |
| 7 | Payments | Owner attempt-state counts, bounded issues, reconciliation-needed count; order staff receive only paid/pending payment summary within permitted order reports. No raw provider data. |
| 8 | Inventory | Current balances for active variants in non-archived products; on-hand/reserved/available, bounded recent adjustments, and explicit uninitialized balances distinct from zero. |
| 9 | Low stock | Existing per-variant threshold, available ≤ threshold, includes zero availability. Existing schema default 0 preserved; no new permanent launch number or editable reporting-setting endpoint. |
| 10 | Product performance | Historical variant/name/SKU groups, sold units and item subtotal excluding tax/delivery by application date; separately allocated successful refund units/base/tax by completion date. Current catalog changes do not rewrite history. |
| 11 | Returns/refunds | Submitted-in-range current status counts, current all-date open queue; owner refund state/follow-up queue. Closed/rejected requests excluded from open count. Success amounts are completion-date based. |
| 12 | Notification health | Owner-only current outcome counts, pending retries and enablement flag. No recipient/bodies; SIMULATED and SENT meanings remain explicit. |
| 13 | Dates/timezone | Approved Africa/Lagos days, UTC storage, half-open UTC interval; today/7d/30d/custom, maximum 366 inclusive days, valid ordered dates, no future end or client timezone override. |
| 14 | Permissions | Existing 31-permission matrix unchanged. Owner all reports; order processing orders/permitted return intake only; inventory stock only. Full endpoint matrix and missing-MFA/customer/guest denials tested. |
| 15 | Admin UI | `/admin` replaces the staff landing placeholder with the branded operational dashboard; existing AdminShell and components retained. Filters, permission-aware tools/sections, loading/error/retry/empty/denied states and pagination. |
| 16 | Charts/tables | Text cards and captioned tables; optional daily receipts disclosure. No decorative charts. Detail tables scroll in labelled keyboard-focusable regions where necessary. |
| 17 | Performance | 23 read queries profiled with PostgreSQL EXPLAIN ANALYZE/BUFFERS; about 20.6ms combined, max plan execution 0.061ms on a small fixture. No N+1 row queries, no cache. Not a production-scale benchmark. |
| 18 | Indexes added | None; measurements do not justify speculative indexes. Existing uniqueness/join/queue indexes retained; larger-volume paid/completed-date filtering and JSON allocation expansion remain monitoring targets. No migration required. |
| 19 | Backend tests | PostgreSQL fresh migrations inside the isolated test suite; full integration regression plus focused reporting tests. Final counts below. Exact sales/refund arithmetic, exclusions, stock/thresholds, historical names, timezone boundaries, returns, permissions and parameter attacks covered. |
| 20 | Frontend tests | `npm ci`, lint, Prettier, TypeScript and **165 tests / 18 files passed**, including seven new reporting tests. Production **Webpack build passed** after visual fixes. |
| 21 | Browser QA | Actual production frontend in isolated Chrome: **35 state/viewport cases** across 320/375/768/1024/1440px, no page overflow or sub-44px filter controls. API responses are synthetic; backend auth/data checks are separate real PostgreSQL tests. |
| 22 | Accessibility | **30 Axe WCAG A/AA scans, zero violations**. Labelled filters, table captions/headings, textual status, visible focus, keyboard filter/pagination checks, keyboard table scrolling, 200% zoom and reduced-motion checks. No screen-reader certification claimed. |
| 23 | Security | Server-side granular authorization and MFA, strict parameter allowlists, bound values, bounded pagination/date ranges, read-only DB snapshot, no PII/provider payload in aggregates. Role changes immediately hide previous UI data; no new exports, resend, settings or command endpoints. |
| 24 | Audits | Composer strict validation and locked audit passed, no advisories. npm audit: zero vulnerabilities. No dependency versions changed; preexisting tracked package changes remain the user's baseline. |
| 25 | Architecture deviations | None material. Approved Q14/A09 closes metric/timezone/access definitions; architecture 18/22/31 and subsequent Q14 note updated. No new ADR, role, service or store. |
| 26 | Deferred analytics | BI/warehouse, cohorts/segmentation, predictions/recommendations, marketing attribution, abandoned-cart reports, advanced accounting, CSV/PDF exports, custom report builders and invented SLA logic remain deferred. |
| 27 | Production inputs | Client launch thresholds and representative-data UAT; production-volume profiling/monitoring ownership. Existing payment/refund/return-policy/email production gates remain unchanged and do not block this reporting implementation. |
| 28 | Phase 3M readiness | Phase 3L implementation is submitted for approval; later work requires separate authorization. Phase 3M has not begun. |

## Executed checks

- Final full backend regression: **196 tests / 5,009 assertions passed** (PHP 8.5.8; 2m07s). Focused final reporting suite: **6 tests / 266 assertions passed**.
- Repeated `migrate:fresh` runs were restricted to `iranti_test` on loopback port 54320 by test guards. No persistent development data was reset. No schema changes/migrations introduced by this phase.
- Pint and Pint `--test`: passed. Level-8 Larastan: no errors.
- Composer validate `--strict`: passed; Composer audit `--locked`: no advisories. npm audit: zero vulnerabilities.
- Frontend clean lockfile install (`npm ci`), lint with zero warnings, formatting and TypeScript: passed. Vitest **165 tests / 18 files passed** after the navigation fix.
- `npm run build -- --webpack`: passed after fixes. Webpack was used because the prior phase established a Turbopack worker-socket restriction in this execution environment. No build configuration/lockfile change was made for that choice; this is not a new claim that Turbopack passed.
- Browser: 35 cases across the five requested widths. Populated owner, empty owner, inventory role, order role, error, loading and MFA-denied states. Thirty Axe scans exclude transient loading states. Custom-date submission and page 2 selection exercised in Chrome. A labelled stock table accepted keyboard focus and ArrowRight scrolling (320px scroll, visible solid outline) without page overflow. At 200% zoom the final page did not overflow; reduced-motion media mode used auto scrolling.
- Manual screenshot inspection: owner heading/navigation/filters/cards at **all five widths**, plus detailed stock/product table regions at 320 and 1440px. Long names and large amounts wrap; mobile detail columns scroll within their own regions. Screenshots and JSON evidence remain ignored under `.runtime/reporting-verification/`.

## Defects found and fixed

Custom date inputs initially restored the previous date while being cleared; they now keep explicit editable state and use server dates only when entering custom mode. Adding Dashboard to the existing admin header exposed a 4px overflow at 200% zoom; the navigation now wraps safely. Frontend tests/build and browser checks were repeated after these fixes.

QA harness failures were distinguished from product failures: CSS text capitalization required case-insensitive browser waits, and returning a DOM node through CDP required a boolean predicate. No visual check was marked passed until the rerun completed. A concurrent build briefly regenerated Next type files during a TypeScript check; the final checks ran after the build and passed.

## Changed files and operating impact

- Backend: `config/reporting.php`; `app/Reporting/{ReportWindow,SalesReport,OrderReport,StockReport,OperationsReport}.php`; `ReportRequest`; `ReportingController`; reporting routes; `tests/Infrastructure/ReportingTest.php`; phase scope in `AGENTS.md`.
- Frontend: `/admin/page.tsx`; `components/reporting/admin-dashboard.tsx`; Dashboard navigation in `components/brand/layouts.tsx`; scoped reporting styles/navigation wrap in `globals.css`; reporting tests and synthetic fixture.
- Documentation: [reporting definitions/operations](reporting.md), [dashboard guide](admin-dashboard.md), this report, README, prior-phase approval record, architecture 18/22/31 and a subsequent Q14 clarification note. No approved business state machine, schema, money calculation, permission grant or provider flow was changed.

No additional install/service/startup step is needed beyond the current local launcher. No commit, deployment, production database update, real email or payment/refund provider action was performed. Existing untracked project files and preexisting frontend package changes were preserved.

Temporary QA Chrome, the port-3030 production frontend and the port-54320 isolated PostgreSQL test service were stopped after verification. Existing native PostgreSQL/Redis and preexisting application processes were left intact.

No unresolved implementation or visual approval blocker remains. Launch threshold tuning, representative client-data UAT, production-scale profiling and prior external-provider gates remain explicit production responsibilities. Phase 3M requires separate authorization.

**PHASE 3L READY FOR APPROVAL**
