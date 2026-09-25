> **Historical record — superseded by the [Phase 3A final approval report](phase-3a-final-approval-report.md), remediation v1.1 dated 2026-09-20.** FND-001 is resolved by ADR-011; FND-003 is an approved temporary exception under ADR-010. Earlier blocking statements below describe prior runs and are not current status.

# PHASE 3A FOUNDATION REPORT

**Subsequent conditional remediation:** ESLint 10 replacement is approved, but the strict current-plugin resolver failed with ERESOLVE. Implementation stopped as instructed; no dependencies/migrations changed. See [current remediation report](phase-3a-remediation.md) and [identity/session findings](identity-session-reconciliation.md). Results below are the original foundation run, not a fresh remediation pass.
Date: 2026-09-20. Authorized scope: repository foundation only. Requirements and architecture v1.0 approvals are recorded in [implementation issues](implementation-issues.md). All 50 pre-existing baseline Markdown files remain byte-for-byte unchanged.

## 1. Starting Git state
Documentation-only directory; no .git, branch, application, dependency manifests or local services. Initialized a local repository on main. No remote, staging, commits or push performed. All project content is untracked pending review; no claim of protected branches or remote CI.

## 2. Files/directories created
backend/, frontend/, infrastructure/, scripts/, .github/workflows/, root README/.gitignore/.editorconfig/.nvmrc, and docs/development/{local-setup,testing,code-quality,environment-variables,implementation-issues,phase-3a-report}. Existing requirements/architecture preserved. Backend scaffold comes from official laravel/laravel 13.x archive (SHA-256 c108401f74081794f29c5863e9bc888eb65da1764cb7204f6c079e1679230823). Optional upstream Boost setup instructions were replaced with project scope/check guidance; no Boost dependency added.

## 3–4. Installed backend and frontend
| Component | Installed / locked |
|---|---|
| PHP / Composer | Local PHP 8.5.8 / Composer 2.10.2 |
| Laravel / Sanctum | 13.32.0 / 4.3.3 |
| Predis / S3 adapter | 3.6.1 / Flysystem S3 3.35.3 |
| PHPUnit / Pint | 13.3.3 / 1.32.1 |
| Larastan / PHPStan | 3.12.2 / 2.2.14, level 8 |
| Node / npm | 24.14.0 / 11.9.0 |
| Next / React / React DOM | 16.3.5 / 19.3.0 / 19.3.0 |
| TypeScript / Tailwind | 6.0.2 / 4.3.3 |
| Vitest / Vite | 5.0.1 / 8.3.0 |
| Prettier / ESLint | 3.9.8 / 9.39.5 — ESLint EOL gate OPEN |

Composer/npm resolved real dependency graphs without ignoring platform/peer constraints. Committed-intended lockfiles exist; no claim these files were actually committed. Exact runtime patches are local verification versions, not production provisioning decisions.

## 5–9. Infrastructure and API
- PostgreSQL 18.6 installed through Homebrew. Validation used a separate temporary UTF-8 cluster, loopback port 54320, iranti_test database and restricted test role. Homebrew also created its standard inactive cluster; no launch-at-login service was enabled.
- Redis 8.2.9 built from official source in /tmp; separate queue/cache processes used ports 63790/63791. Compose declares equivalent separate services, queue noeviction and cache allkeys-lru.
- Queue uses Redis, after_commit=true, retry_after=90 seconds; worker timeout=30. Only a harmless test fixture job exists. Failed jobs persist in PostgreSQL.
- Only failed_jobs infrastructure migration and migration bookkeeping execute. Default identity/cache/database-job migration examples are archived outside migration discovery. No commerce tables were created.
- Local private filesystem read/write/delete passed. S3 adapter/configuration installed; live S3 operations **NOT VERIFIED** because no provider/test bucket/credentials were supplied. No media workflows or external emails.
- GET /api/v1/health is the sole API route, returning a small JSON liveness response. Request IDs, no-store headers, JSON exception foundation and redacted structured logging are present. Same-origin Next proxy to Laravel was exercised successfully.
- Sanctum is installed/configured as a dependency only; session middleware, CSRF route and registration/login/RBAC are not activated. Session schema mapping remains FND-001 for Phase 3B.

## 10–13. Quality, CI and security
PHPUnit unit/feature/infrastructure suites, strict TypeScript, Vitest smoke tests, Pint, level-8 Larastan and Prettier are configured. GitHub Actions runs backend/frontend quality and audits with PostgreSQL/Redis services. Actions use verified immutable revisions. No production deployment is configured.

The workflow has an explicit failing supported-tooling gate for FND-003; removing it without resolving the issue would misrepresent readiness. Hosted workflow execution is **NOT VERIFIED**: no remote/push exists. Official actionlint 1.7.12 checksum was verified and syntax validation passed; shellcheck/pyflakes were not installed and were disabled for that invocation.

Environment files, dependency/build artifacts and generated keys are ignored by Git. Templates contain no real credentials. Local secrets are generated into mode-0600 ignored files. Production configuration rejects debug/insecure cookies/non-HTTPS or wildcard trusted origins. JSON errors omit raw exceptions; exception logs contain type/request ID. No wildcard production CORS. Cookies default Secure/HttpOnly/SameSite=Lax and encrypted; local HTTP explicitly overrides Secure. This is not production security certification.

## 14–17. Executed commands and results
Commands below use PHP 8.5 explicitly on this host where necessary. Working directories are backend/frontend unless shown otherwise.

| Command / check | Result |
|---|---|
| git status --short --branch; tool/runtime inspection | PASS — starting state identified; main has no commits |
| Official package manifests, npm view and Composer dependency resolution | PASS — actual compatible graph locked; ESLint support defect separately recorded |
| composer install; composer update --lock --no-install --no-scripts | PASS — metadata update changed no package versions |
| php artisan --version | PASS — Laravel 13.32.0 |
| php artisan route:list --path=api | PASS — health only |
| composer validate --strict | PASS after replacing exact runtime package constraints with narrow patch ranges; resolved versions unchanged |
| PHPUnit Unit + Feature | PASS — 8 tests, 20 assertions |
| IRANTI_INFRA_TESTS=1 php vendor/bin/phpunit | PASS — 10 tests, 42 assertions; includes real PostgreSQL/Redis/queue checks |
| PostgreSQL connection + migrate/rollback/reapply | PASS in isolated test DB |
| Redis ping/cache round trip/queue success/intentional failure/failed_jobs | PASS; test-owned keys/records cleaned |
| php vendor/bin/pint --test | PASS |
| php vendor/bin/phpstan analyse --memory-limit=512M --no-progress | PASS — level 8, no errors |
| composer audit --format=json | PASS — no advisories or abandoned packages reported |
| npm install | PASS — dependencies installed and package-lock created |
| npm run format:check | PASS |
| npm run lint | PASS — no errors/warnings on final run; installed ESLint remains unsupported |
| npm run typecheck | PASS |
| npm test | PASS — 1 file, 2 foundation tests |
| npm run build | PASS — Next production build; / and /_not-found generated |
| npm audit --json | PASS — zero known vulnerabilities reported |
| curl direct API health and built frontend proxy health | PASS — both return data.status=ok |
| actionlint -shellcheck= -pyflakes= .github/workflows/foundation.yml | PASS — syntax/static workflow checks |
| git check-ignore on environment/vendor/node_modules/build files | PASS |
| Approved-baseline SHA-256 comparison | PASS — zero modified baseline files |
| Docker Compose pull/start | NOT VERIFIED — Docker engine/CLI absent; native equivalents tested |
| GitHub hosted CI | NOT VERIFIED — no remote execution; known supported-tooling gate intentionally blocks |
| Live S3 / SMTP / Paystack | NOT VERIFIED — credentials/providers absent or later phase; no calls made |

Initial attempts exposed missing local app key, test assumptions about CORS header omission, strict Composer exact-version warnings, and sandbox socket/shared-memory restrictions. These were corrected or rerun with required execution permission; the final results above are from successful actual runs. A single approved origin can be returned as a fixed header for another origin; browser denial is verified by rejecting matching untrusted origin and wildcard, not requiring header absence. Turbopack and PHPStan needed local socket permission; no replacement/disabled check was used.

## 18–21. Warnings, deviations, architecture issues and limitations
**FND-003 — COMPATIBILITY DEVIATION, OPEN:** architecture planned ESLint 9.x, but official support ended 2026-08-06. Supported replacement direction is ESLint 10.x; complete Next/TypeScript/plugin peer compatibility still requires validation and an approved tooling amendment. No automatic breaking upgrade was made. Installed 9.39.5 is provisional; clean audit/lint does not close its lifecycle defect. [Official support policy](https://eslint.org/version-support/).

**FND-001 — identity/session mapping:** stopped affected schema implementation. Generated bigint user IDs and Laravel string session primary key do not directly match the approved UUID logical schema. Default migrations are not executed; resolve adapter/schema mapping by ADR before Phase 3B. This does not require changing Phase 1 scope.

**FND-002 — environment:** shell originally selected PHP 8.4.1; explicitly used installed 8.5.8. Missing services were supplied as isolated native equivalents for tests. Docker workflow itself remains unverified. Redis compilation emitted missing pkg-config/backlog warnings but completed; real connectivity/queue checks passed. Native build is a test aid, not a portable deployment artifact.

No planned runtime major, business requirement or confirmed release allocation was substituted. Direct PHPUnit is permitted by the architecture; Predis is a supported client choice. Optional mail/storage providers and later policy gates were not reopened. Named remote repository/environment/UAT ownership and production operations remain to assign before their affected work. No commits were made without a specific commit instruction.

Validation processes (API, frontend, both Redis instances and temporary PostgreSQL server) were stopped after testing. The installed PostgreSQL binaries, inactive temporary test cluster, ignored local environment files and dependencies remain available; no persistent service was enabled. Compose/workflow YAML parsing and development-document links also passed checks.

Compatibility evidence: [Laravel 13 framework manifest](https://raw.githubusercontent.com/laravel/framework/v13.32.0/composer.json), [official Laravel skeleton](https://raw.githubusercontent.com/laravel/laravel/13.x/composer.json), [Next 16.3.5 package metadata](https://registry.npmjs.org/next/16.3.5), [PHP support](https://www.php.net/supported-versions.php), the installed lockfiles and actual test/build results. Framework-declared ranges were checked before installing; successful local resolution/build is stronger evidence than the earlier architecture candidate list.

## 22. Readiness for Phase 3B
Foundation implementation and executable checks are substantially complete, but **Phase 3A acceptance is blocked by FND-003**. Resolve the supported ESLint major decision, validate its dependency graph/lint/audit, update the CI compatibility gate and rerun affected checks before approval. Phase 3B must additionally resolve FND-001 and its approved identity/permission policy gates. No Phase 3B or commerce feature work began.

**PHASE 3A NOT READY FOR APPROVAL**
