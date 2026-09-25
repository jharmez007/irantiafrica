# PHASE 3M SECURITY & PRODUCTION HARDENING REPORT

Baseline **v1.0 — 2026-09-24**. Phase 3L is formally approved. Scope: hardening, evidence and production preparation only. No new commerce features, production deployment or Phase 3N work. Final verification is recorded below; external activation gates remain explicit.

## Review and fixes

The [pre-hardening inventory](../production/pre-hardening-review.md) reconciles approved requirements, architecture/ADRs, implementation reports and remaining dependencies. Approved business rules were preserved.

| Defect / gap | Change and evidence |
|---|---|
| Native credential forms could submit GET before hydration | Auth/MFA/refund reauthentication and address/fulfilment/return forms now explicitly POST. Browser with scripts disabled submitted POST `/login` with no query string; four auth-mode regression tests. Synthetic credentials only in discovery |
| Real dashboard could not discover staff grants | Identity API now returns actual assigned permission codes only after staff MFA. Every endpoint retains independent backend authorization. Tests verify empty pre-MFA list and exact grants for all three staff roles; real owner dashboard and notification health now load |
| Upload instruction overwritten by generic Saved message | Catalog action wrapper preserves the upload's queued-validation instruction; real image upload/worker/browser workflow repeated |
| Local worker omitted media queue | Existing launcher and local guide now include identity/default/transactional/media. Real media worker generated ready WebP derivatives |
| Incomplete production safeguards | Strict HTTPS origin validation, debug disabled before guard failures, host-only secure HttpOnly/Lax encrypted database sessions, verified PG/Redis TLS, queue lease >60 s. Added CA/scheme configuration and configurable per-minute abuse limits with unchanged defaults |
| Missing readiness/request/worker visibility | Private `app:readiness` command; safe HTTP route/status/duration logs and generated request ID; safe queue start/finish/exception metadata |
| Header/CSP coverage | Permissions-Policy and production CSP; conditional HTTPS HSTS. Documented static Next inline-script/style exception; no production eval. Local browser CSP checks and HTTPS header configuration exercised |

## Required completion topics

| # | Topic | Result / evidence |
|---|---|---|
|1|Security review|Routes/policies/input boundaries/raw SQL/media/provider state reviewed against threat model; negative/concurrency suites rerun. Targeted473 current-file and463 history-blob scan found no committed secret values; corrected scan contains no nonempty secret assignments. Pattern scan is not exhaustive or a penetration test |
|2|Authentication/session|Approved throttles, rotation/revocation, staff MFA/recovery/recent-auth/last-owner controls retained. HTTPS loopback Chrome: authenticated 200; missing CSRF 419; foreign origin 401 and no matching CORS grant; Secure/HttpOnly/Lax host-only session unreadable to JS. Native pre-hydration GET defect fixed. Real deployed domains/proxies remain unverified |
|3|Authorization|Guest/customer/owner/order/inventory matrix and IDOR negative tests retained; actual-grant identity contract corrected; UI grants never replace API permission checks |
|4|Upload/security|Private quarantine, signed bounds, checksum/MIME/decode/pixel checks and WebP derivatives verified. Misnamed PNG containing JPEG rejected in browser; correctly named JPEG accepted. Missing source test leaves processing and recovers idempotently once object returns |
|5|Payment/refund hardening|Existing backend amounts/NGN, signed webhook/replay/unique references/once-only stock/late review and capped owner-MFA refund controls reverified. Browser refund uses mock provider, never real money. Real Paystack/refund activation remains NOT VERIFIED |
|6|Dependencies|Composer/npm audits: no known advisories in reviewed locks. Clean installs verified. ESLint 9.39.5 EOL exception remains: npm metadata for react/jsx-a11 y/import excludes10 despite ESLint 10.11.0 availability. Laravel 13.33.0, PHPUnit 13.3.4, Next 16.3.6 and other maintenance candidates recorded; no blind upgrades |
|7|Performance baseline|Fixed150 products/120 orders/90 payments/10 returns/5 refunds/235 notifications workload;20 sequential kernel samples per endpoint. p95 5.26–53.71 ms locally. Detailed profile and limitations in [performance baseline](../production/performance-baseline.md) |
|8|Database performance|Bound EXPLAIN ANALYZE/BUFFERS across catalog/search/cart/history/admininventory/orders/dashboard/payments/returns; slowest SQL 1.746 ms. Repeated per-row queries in order/payment/return projections are a retained staging risk, not hidden. No evidence-based need for new indexes at this volume; no schema changes |
|9|Frontend performance|Clean production Webpack builds and browser inspection. 375 px cold-cache lab spot checks: LCP 52–208 ms, CLS 0, JS transfer 161–175 KB, no overflow/CSP violations on sampled catalog/detail/login. Not field Web Vitals, INP, or concurrent capacity evidence. Responsive bounded WebP derivatives and intrinsic dimensions retained |
|10|Redis/cache|Commerce truth remains PostgreSQL; no catalog/report result cache introduced. Queue noeviction/cache separate. Refused Redis connections fail readiness and limiter closed without order-count change. Cache outage can stop workers via restart-marker read; documented |
|11|Queue resilience|Bounded jobs/timeouts/leases; real media and transactional workers, duplicate-job regressions. Exclusive-prefix probe: graceful queue:restart exit 0; job persists during worker absence and replacement processes it. No user worker stopped |
|12|Failure testing|Actual isolated PG fast-stop during uncommitted transaction → safe 500/no SQL and reconnect with rollback. Refused Redis/cache connections, missing storage object recovery, email transient/permanent/ambiguous fixtures, payment timeout/malformed/replay/reconciliation fixtures. No destructive retained-data or external scans |
|13|Observability|Structured request and queue metadata plus existing payment/refund/notification logs.18 browser-workflow notifications processed as SIMULATED via array mail; owner dashboard displays outcomes without recipient data. Collector/alert delivery and named operators remain gates |
|14|Health|Public liveness unchanged; private readiness checks PG and both Redis connections with nonzero failure. No public configuration/dependency details or provider calls; provider/storage functional checks remain separate |
|15|Backups|Production managed encrypted backups/WAL/PITR/retention/key custody/object versioning documented but NOT ACTIVATED. No claim that S3 compatibility supplies backup |
|16|Restore test|**RESTORE VERIFIED** locally:54 tables/4,858 rows, all counts/content hashes match; no pending migrations, status exit 0;1.66 s synthetic drill. Disposable restore target removed. Not production PITR/media/key recovery proof |
|17|Privacy/retention|No new commercial purge. Sessions/capabilities/carts/media lifetimes documented; financial/audit/webhook/notification/failed-job retention remains client/legal gate. Logs omit bodies/credentials; failed-job access restricted |
|18|Production configuration|[Environment checklist](../production/environment-checklist.md), TLS/secure-cookie/origin guards and private readiness prepared. Synthetic production-mode no-dev boot tested; actual managed services/domain/proxy/TLS/mail/storage configuration NOT VERIFIED |
|19|CI|Pinned/minimal-permission workflow reviewed with installs/checks/tests/build/audits/static analysis. No remote: **HOSTED CI NOT VERIFIED**; branch protection/artifact promotion require repository owner |
|20|Production build|Isolated Composer no-dev optimized install/discovery and production-config command boot; frontend production Webpack builds. Build-stage env deliberately excludes live credentials. Standard Turbopack hosted path retains prior environment restriction and must be proven in hosted CI |
|21|Admin product-management acceptance|Real Chrome + real local API/PostgreSQL/media worker: owner login/MFA, draft/name/description/category/simpleSKU/price, upload, publish, opening stock, storefront, price edit, stock adjustment, archive. Historical paid-order item snapshot unchanged after edits/archive. Payment preparation was API-driven with provider fixture; catalog/inventory/fulfilment actions were UI-driven |
|22|Owner acceptance|Real dashboard/orders/payments/notification-health pages; UI processing/shipment/dispatch/delivery; return queue/review/receive/inspection/restock/refund approval/submission with mocked provider. No owner SQL/CLI needed for these interface operations. Technical fixture setup and provider/infrastructure diagnosis remain developer/operator tasks |
|23|Full regression|Final results recorded in verification section below; full PG migrations and concurrency, all-domain PHPUnit, Pint/Larastan, Composer validate/audit; npm ci/lint/format/TS/Vitest/build/audit. Browser returns states320/375/768/1024/1440, axe inspected states no violations;200%zoom/reduced-motion checks passed |
|24|Production gates|[Gate register](../production/production-gates.md): Paystack test/live/refund; email/sender/DNS; domains/TLS; carrier/rates/tax/return/refund policy; content/legal; hosting/least privilege/secrets; backups/media/monitoring; hosted CI/staging; ESLint/CSP exceptions; explicit release approval |
|25|Architecture deviations|No business/DB/domain boundary change. Private CLI readiness implements private health intent. Static-compatible CSP inline exception is explicit; no forced dynamic-rendering redesign. TLS/config/logging and native-POST fixes strengthen existing design. Local service topology unchanged |
|26|Readiness for Phase 3N UAT|Engineering hardening evidence prepared for review. Real-provider/production-like staging scenarios require the register's prerequisites and explicit next-phase authorization. Production and Phase 3N have not begun |

## Verification and evidence

| Check | Final result |
|---|---|
| Full backend PostgreSQL regression | **PASS — 200 tests, 5,059 assertions, 1 intentional opt-in skip** (199 executed); 2m16s. Includes migration reset/fresh/reapply and real concurrency across domains |
| Opt-in representative profile | **PASS — 1 test, 2,303 assertions** separately; 150 products / 120 orders and all required data categories |
| Backend quality | Pint, level-8 Larastan, Composer strict validation and audit PASS; no known advisories |
| Frontend quality | Clean npm ci --strict-peer-deps, lint, Prettier, TypeScript and **169 tests / 18 files PASS**; npm audit 0 vulnerabilities |
| Production artifacts | Final normal-origin Next Webpack production build PASS; isolated optimized Composer --no-dev build and synthetic production-config boot PASS. QA-specific API upstream removed from final build |
| CI workflow syntax | actionlint PASS; no Git remote, **HOSTED CI NOT VERIFIED** |
| Browser security | Secure/HttpOnly/Lax session; CSRF 419; foreign-origin 401; disabled-JS native POST with no query; CSP spot checks 0 violations; configured HTTPS HSTS max-age 31536000, absent from local HTTP |
| Browser operations | All mandatory catalog steps, owner fulfilment/return/refund and dashboard/notification visibility completed. UI defects fixed and affected frontend checks/build rerun |
| Resilience/recovery | Redis readiness/limiter/cache refusal; graceful worker restart/persisted job; storage retry; PG interruption/reconnect/rollback; **RESTORE VERIFIED** |
| Final local checks/cleanup | Private readiness and migration status PASS before shutdown; QA ports 3030/3031/8020/8021/9227 closed, isolated PG 54320 stopped. User's normal development services left running |

The one full-suite skip is intentional: the destructive-to-test-DB performance workload requires `IRANTI_HARDENING_PROFILE=1` and was executed separately. No required functional test is left skipped. Initial verification exposed an old identity-response key assertion; it was updated to require empty customer grants, followed by the clean full run above.

Browser evidence and diagnostics are ignored under `.runtime/hardening-verification/`; reports intentionally omit secret values. Reviewed screenshots include storefront, owner fulfilment/dashboard, return/refund views. Synthetic media uses supplied brand imagery as a test asset, not launch product content. Prices are explicitly in kobo in the existing admin UI; owner training and real content remain dependencies. No redesign was performed.

## Deliverables

Production documents: pre-hardening inventory, security/environment checklists, observability, operations, backup/recovery, performance baseline, go-live prerequisites and gate register. Code: production configuration/Redis TLS settings, configurable rate limits, readiness command, request/queue logs, identity permission projection, frontend security headers and native-POST/upload-message fixes, launcher media queue. Tests: production-origin/error, Redis/storage recovery, role grant discovery, native form method, optional representative workload. README and local guide updated. No production migrations or new business features.

## Readiness decision

No unresolved local implementation blocker remains from this review. The CSP inline exception, ESLint EOL compatibility exception, repeated per-row query risk and external/production validation gaps remain visible in the gate register; do not interpret local passes as production authorization. Phase 3M is ready for the client's engineering approval. Phase 3N and deployment require explicit authorization and their applicable prerequisites.

**PHASE 3M READY FOR APPROVAL**

## Subsequent client approval

2026-09-24: client formally approved Phase 3M and authorized Phase 3N UAT/external validation. Original results above remain historical engineering evidence. Production deployment is not authorized. See [UAT plan](../uat/01-uat-plan.md).
