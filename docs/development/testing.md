# Testing

Use PHP 8.5 and the installed lockfiles. [Local setup](local-setup.md) covers environment generation and services.

## Backend
```sh
cd backend
composer test:unit
composer test:feature
IRANTI_INFRA_TESTS=1 composer test
```

Unit tests check production configuration rejection/acceptance. Feature tests check application boot/health, standardized safe errors, origin restriction and real private local-storage round trip. Tests generate ephemeral encryption keys; no production key is embedded.

The Infrastructure suite requires explicit IRANTI_INFRA_TESTS=1, APP_ENV=testing, PostgreSQL driver, exact iranti_test database and loopback DB host. It performs full rollback/reapply and migrate:fresh, and the identity storage tests start from a fresh schema on this isolated database. These commands destroy test data. Tests use the actual encrypted session store and reset repository, enforce database constraints/indexes and verify expiry/cleanup. Never use an existing business database named iranti_test. Use the dedicated role/isolated local cluster from setup.

The Redis test uses unique queue/cache names, processes one success and one intentional failure, checks failed_jobs persistence and cleans only its own records/keys. It exercises a real worker through Laravel's command runner, not Queue::fake. The harmless job lives under tests/Fixtures, not production modules. Queue retry_after=90 exceeds worker timeout=30. Only non-sensitive test payloads/exceptions are used; future production jobs must preserve log/failed-payload minimization.

Running composer test without IRANTI_INFRA_TESTS=1 marks infrastructure tests **SKIPPED**, never “verified.” CI explicitly enables them. Test connection is PostgreSQL; no SQLite fallback.

## Frontend
```sh
cd frontend
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Vitest covers foundation/auth plus catalog rendering, interactive variants/prices, admin forms and role-aware visibility using Testing Library/jsdom. See [Phase 3C report](phase-3c-report.md) for historical catalog counts. DOM tests are not a full visual/browser/screen-reader audit. ESLint's EOL status is tracked independently from whether lint executes.

## Communication and safety checks
With API and built frontend running:
```sh
curl --fail http://127.0.0.1:8000/api/v1/health
curl --fail http://127.0.0.1:3000/api/v1/health
```

Both should return data.status=ok. Health is process/application liveness, not DB readiness, provider readiness or a production-readiness assertion. No external email/S3/payment calls are made. Filesystem test validates local storage and S3 driver configuration; real S3 credentials/provider behavior is NOT VERIFIED until a chosen test bucket is supplied.

Run failure/negative checks as written; don't bypass guardrails to turn a failed test green. See the [Phase 3C report](phase-3c-report.md) for historical catalog execution evidence and the historical [foundation report](phase-3a-report.md) for earlier checks.

## Catalog verification
The complete backend run includes signed multipart media, S3 policy construction with synthetic credentials, PostgreSQL duplicate races, audit rollback, malformed/pixel-bomb content and cleanup. Native test services are required; never report skipped infrastructure tests as PASS. A real Next production proxy/Redis media-worker journey was also executed. On this workstation Turbopack could not bind its CSS worker socket; `npm run build -- --webpack` produced and ran the verified production build. Hosted CI/default Turbopack and actual S3/CDN deployment remain separate verification gates.

## Historical Phase 3E evidence
See [Phase 3E report](phase-3e-report.md): 108 backend tests / 2,149 assertions and 91 frontend tests pass. Cart adds exact-money, ownership/merge/expiry, PostgreSQL mutation race, transport/state/focus/axe tests and real Chrome production-preview journeys. The default Turbopack production build now passes, superseding the historical catalog-only webpack fallback above. All destructive database testing remains isolated from iranti_local.

## Historical Phase 3F evidence — 2026-09-23

See [Phase 3F report](phase-3f-report.md): the complete PostgreSQL-enabled backend suite passed **126 tests / 2,593 assertions**; the frontend passed **107 tests / 13 files**. Pint and level-8 Larastan passed. A clean locked frontend install, formatting, ESLint, TypeScript and default Turbopack production build passed. Composer validation/audit and npm audit passed with no known dependency advisories reported. The existing approved ESLint 9 EOL exception remains separate from vulnerability results; no dependency changes were made for this phase.

Checkout adds exact tax/rounding/allocation, immutable configuration, owner/MFA publication, guest/account ownership, saved-address isolation, expiry, idempotency and real PostgreSQL multi-process races (last stock, duplicate reserve, cancellation versus inventory expiry, configuration publication). Destructive tests used only the guarded `iranti_test` database on isolated port 54320. Only the additive checkout migration was applied to persistent `iranti_local`; no local sample rates were seeded.

Real installed Chrome with an isolated profile exercised the built Next.js preview and Laravel test backend, using synthetic fixtures. Address/quote layouts were checked at 320, 375, 768, 1024 and 1440px; guest/account checkout, server totals, reservation, cancellation, saved addresses, unsaved-change protection, focus and keyboard use were inspected. Automated axe tests exclude color contrast. Reduced-motion and 200% CSS zoom were checked; live screen-reader, native browser zoom, physical devices and Safari are not claimed as verified. See the report for evidence limits and cleanup.

## Current Phase 3G evidence — 2026-09-23

[Phase 3G report](phase-3g-report.md): **139 backend tests / 3,031 assertions**, **120 frontend tests / 14 files**, Pint, level-8 Larastan, Composer validation/audit, clean npm ci, formatting, ESLint, TypeScript, Turbopack production build and npm audit passed. No dependency changes. Orders add real PostgreSQL duplicate-create/cancel/expiry races and ownership/immutable snapshot/guest grant/RBAC negative tests. The old inventory table-absence assertion now verifies inventory creates no order records, since order tables correctly exist in Phase 3G. Destructive testing remains confined to iranti_test:54320.

Installed Chrome exercised the production build with real guest/account order placement, history, scoped-cookie access, owner TOTP, admin filtering and cancellation. All five requested widths were measured for five order page types; the report distinguishes captured/measured layouts from representative manual screenshot inspection and records accessibility verification limits.
