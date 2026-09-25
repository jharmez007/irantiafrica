# 01 — Technology stack
**Proposed architecture v0.1 • 2026-09-20.** Supports NFR08–13 and Q23. Official documentation/release records were checked during this architecture review; a release observation is not a dependency-resolution test.

## Selection and compatibility
| Technology | Selected release line / observed candidate | Purpose and rationale | Compatibility / lifecycle gate |
|---|---|---|---|
| Laravel | 13.x; observed 13.32.0 | Modular API/application, policies, queues, validation | PHP 8.3–8.5 supported; security support to 2028-03-17. Recheck patch at implementation. |
| PHP | 8.5.x; exact patch REQUIRES CONFIRMATION | Backend runtime; longer active support than 8.4 | Active support through 2027, security through 2029; extensions pdo_pgsql, mbstring, intl, openssl, fileinfo and image processing must resolve on deployment image. |
| PostgreSQL | 18.x; observed 18.6 | Durable commerce state, locks, constraints, reporting | Supported to 2030-11-14; managed-provider availability must be confirmed. 17.x is a documented fallback only by ADR amendment. |
| Next.js | 16.x; observed 16.3.5 | Storefront/admin App Router, SSR, SEO | Active LTS; Node >=20.9. Use stable release, never canary. |
| React / React DOM | 19.3.0 candidate, versions equal | Components and interactivity | Within Next's declared React 19 peer range; Next App Router includes framework-managed React internals. Build/hydration test still required. |
| TypeScript | 6.0.x; 6.0.2 candidate, patched version REQUIRES CONFIRMATION | Strict types | 7.0.2 was observed latest stable, but new major is not required. Next 16's minimum is 5.1; its matching lint package develops against 6.0.2. Validate supported compiler/linter combinations before lock; do not interpret a minimum as full compatibility proof. |
| Node.js | 24 LTS, exact patch REQUIRES CONFIRMATION | Next build/runtime and frontend tools | Choose LTS rather than Node 26 Current; Node 20 is EOL. Pin identical major/patch in CI/runtime. |
| Tailwind CSS | 4.x; observed 4.3.3 | Design tokens and utilities | Modern browsers; v4 requires Chrome 111+, Safari 16.4+, Firefox 128+. Q02/Q19 browser acceptance must respect the strictest dependency. No Sass pipeline. |
| Redis | 8.2 Extended; observed 8.2.9 | Queue transport, rate limiting, selective cache | 8.10 GA is newer; 8.2 Extended support advertised through 2030. Confirm hosting/licensing and patched release. Separate non-evicting queue from evictable cache. |
| Sanctum | 4.x; observed 4.3.3 | First-party session/CSRF authentication | Tagged manifest permits Illuminate 13 and PHP ^8.2. Cookie SPA mode; no personal access tokens in browser. |
| PHPUnit | 13.3.3 candidate | Backend unit/feature/integration testing | PHP 8.5 candidate; exact framework test tooling resolution required. Pest 5.2.0 assessed as optional alternative, not an extra required runner. |
| Larastan / PHPStan | Larastan 3.x / PHPStan 2.2.x; exact tags REQUIRES CONFIRMATION | Static analysis | Larastan 3 branch declares Laravel 13 and PHPStan ^2.2.14; branch compatibility is not a verified installed tag. Resolve during foundation gate. |
| Laravel Pint | 1.x; observed 1.32.1 | Backend formatting | Lock compatible patch in Composer development dependencies. |
| Vitest | 5.x; observed 5.0.1 | Pure frontend logic/client component tests | Current guide requires Node >=22.12 and Vite >=6.4; Node 24 satisfies runtime floor. Add supported React Testing Library version at lock gate. |
| Playwright | 1.x; observed 1.63.0 | Browser/E2E/accessibility checks | Pin matching browser images; use E2E for async Server Components. |
| ESLint / eslint-config-next — original selection SUPERSEDED | ESLint 9.x patch TBC / Next-matching 16.3.5 candidate (historical) | Explicit lint CI | Next config peers ESLint >=9; select tested patch and matching TypeScript parser. Do not rely on build to lint. |
| Prettier | 3.x, patch REQUIRES CONFIRMATION | Frontend/document formatting if adopted | Optional separate style tool; resolve config conflicts before use. |
| Object storage / email | S3-compatible / transactional transport; vendor TBC | Durable media and email | Contract tests for signed URLs, consistency, encryption, events and delivery; no assumed universal S3 feature parity. |
| Paystack | Current HTTPS API; adapter versioned internally | Required initial cards/transfer provider | Merchant channel enablement and sandbox/live parity require confirmation. No mandatory vendor SDK. |

No dependency files or lockfiles are created in Phase 2. **Before foundation implementation**, reconfirm exact supported patches and PHP/Node/container/provider availability; after implementation authorization run a minimal dependency/build/test compatibility spike before full scaffolding. Record lockfile, container digest, extension versions, security advisories and smoke evidence. If a selected patch is unavailable or unsupported, update this decision rather than silently changing it.

## Alternatives
Laravel-rendered monolith would reduce runtimes but conflicts with the requested Next/Laravel split. Microservices add distributed transactions with no launch need. MySQL is viable but PostgreSQL provides the selected relational/locking/reporting platform. MongoDB is unsuitable as the default for these financial relationships. Browser JWT/localStorage adds revocation and token exposure complexity. Shared hosting usually cannot supply the persistent processes and controlled releases required here. Redis is not a stock database.

## Primary sources, checked 2026-09-20
- [Laravel releases/support](https://laravel.com/framework/docs/13.x/releases), [13.32.0](https://github.com/laravel/framework/releases/tag/v13.32.0), [PHP support](https://www.php.net/supported-versions.php).
- [PostgreSQL version policy](https://www.postgresql.org/support/versioning/), [Node release lines](https://nodejs.org/en/about/previous-releases).
- [Next release](https://github.com/vercel/next.js/releases/tag/v16.3.5), [support policy](https://nextjs.org/support-policy), [Next 16 requirements](https://nextjs.org/docs/app/guides/upgrading/version-16), [tagged peers](https://raw.githubusercontent.com/vercel/next.js/v16.3.5/packages/next/package.json), [React versions](https://react.dev/versions).
- [TypeScript 7.0.2](https://github.com/microsoft/TypeScript/releases/tag/v7.0.2), [Next lint manifest](https://raw.githubusercontent.com/vercel/next.js/v16.3.5/packages/eslint-config-next/package.json), [Tailwind release](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.3), [browser requirements](https://tailwindcss.com/docs/compatibility).
- [Redis version management](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/), [release archive](https://download.redis.io/releases/).
- [Sanctum manifest](https://raw.githubusercontent.com/laravel/sanctum/v4.3.3/composer.json), [Sanctum SPA authentication](https://laravel.com/framework/docs/13.x/sanctum).
- [Pest manifest](https://raw.githubusercontent.com/pestphp/pest/v5.2.0/composer.json) (PHP ^8.4, PHPUnit ^13.3.3 capped at 13.3.3), [Larastan compatibility](https://github.com/larastan/larastan/blob/3.x/composer.json), [Pint](https://github.com/laravel/pint/releases/tag/v1.32.1).
- [Vitest guide](https://vitest.dev/guide/), [Vitest release](https://github.com/vitest-dev/vitest/releases/tag/v5.0.1), [Playwright release](https://github.com/microsoft/playwright/releases/tag/v1.63.0), [Playwright setup](https://playwright.dev/docs/intro).

## Approved remediation record — 2026-09-20
**ESLint architecture target: 10.x. Implementation baseline: 9.39.5 under TEMPORARY EXCEPTION / DEFERRED MIGRATION.** The client approved this bounded compatibility exception on 2026-09-20 after strict stable-plugin resolution failed. [ADR-010](adr/010-eslint-10-remediation.md) specifies EOL risk, mandatory revisit triggers and the pre-production gate. EOL alone no longer blocks Phase 3A; install/lint/types/tests/build/audit remain blocking. Other stack decisions remain unchanged.
