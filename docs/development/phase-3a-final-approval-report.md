# PHASE 3A FINAL APPROVAL REPORT
Baseline: **Phase 3A remediation v1.1 — 2026-09-20**.
Approved requirements v1.0 and architecture v1.0 remain the business/design baseline, with explicitly recorded remediation ADR-010 and ADR-011. This report supersedes the earlier foundation and conditional-remediation reports.

## 1. ESLint implementation
**9.39.5**, exactly pinned. Strict clean npm ci passed. Manifest and package-lock.json committed in **5e4f19c**. No force, legacy-peer-deps, overrides, speculative packages or removed lint rules.

## 2. Architecture target
**ESLint 10.x** remains the target. [ADR-010](../architecture/adr/010-eslint-10-remediation.md) status is **TEMPORARY EXCEPTION / DEFERRED MIGRATION**.

## 3. Exception rationale
Stable eslint-plugin-import 2.32.0, eslint-plugin-react 7.37.5 and eslint-plugin-jsx-a11y 6.10.2 exclude ESLint 10 in their published peers. The prior strict isolated 10.11.0 probe failed ERESOLVE. The client explicitly accepts temporary EOL maintenance risk; successful audit/lint does not remove it.

## 4. Exit criteria
Revisit at the first official ESLint 10 support from **any** of those three plugins, a compatible supported eslint-config-next plugin set, an official Next.js migration path, or **before production**, whichever first. Developer reviews official metadata/advisories weekly during active work and at dependency changes. Next scheduled review is 2026-09-27 unless triggered sooner. The production release gate requires a recorded review and fresh explicit risk decision if migration remains blocked; indefinite silent continuation is prohibited.

## 5. Frontend regression
| Gate | Result |
|---|---|
| npm ci --strict-peer-deps --no-fund | PASS; expected EOL warning |
| ESLint 9.39.5, existing Next React/accessibility coverage | PASS |
| Prettier check | PASS |
| Independent TypeScript check; strict=true | PASS |
| Vitest | PASS — 2 tests |
| Next.js production build | PASS |
| npm audit | PASS — 0 vulnerabilities |

## 6. Identity schema
One shared **UUID users** table for customers/staff. Name(160), normalized unique email(254), password hash(255), nullable verification time, nonnull UTC creation/update timestamps. Approved lifecycle fields status/auth_version and nullable MFA storage are retained; they are not invented profile data or completed security flows. No CustomerProfile, customer-only attributes, remember_token, is_admin or soft deletion.

Model normalizes email and PostgreSQL independently enforces normalized uniqueness. Future request lookup normalization/validation must match. Disable/anonymize is the deletion policy; future financial relationships must RESTRICT. Only ephemeral sessions/reset storage cascade.

[ADR-011](../architecture/adr/011-identity-framework-storage.md) explicitly reconciles framework email/password names and physical storage deviations from the original logical schema. UUID role/permission joins remain compatible with Business Owner / Super Admin, Order Processing Staff, Inventory / Store Staff and unprivileged customers; RBAC implementation is Phase 3B.

## 7. Session and reset schemas
**Sessions:** Laravel opaque string PK; nullable UUID user FK with delete cascade/update restrict; indexed user_id and nonnegative bigint last_activity; nullable IP(45) and user-agent(500), text encrypted payload. JSON serialization, default 120-minute idle expiry and handler garbage collection. Metadata is sensitive raw request data, not anonymized hints; no additional logging was introduced.

**Reset storage:** normalized email PK/FK, hashed token(255), indexed nonnull created_at timestamptz. Framework expiry 60 minutes and issuance throttle 60 seconds. Replacement/deletion/expired cleanup verified. Email updates require deleting outstanding tokens first. No reset endpoint is enabled. Phase 3B must serialize issuance/reset/email changes using the user-row lock, verify and consume atomically, invalidate sessions and add concurrent double-use tests before enabling routes.

PostgreSQL connection timezone is explicitly UTC. Regression found and fixed a local server timezone mismatch affecting reset expiry.

## 8. Sanctum decision
First-party SPA cookie/session authentication only. No personal_access_tokens migration/table is installed or needed; no unused token issuance infrastructure added. Sanctum dependency/configuration remains, but login/CSRF/session middleware activation and auth flows remain Phase 3B.

## 9. Migration changes
Added [2026_09_20_000002_create_identity_tables.php](../../backend/database/migrations/2026_09_20_000002_create_identity_tables.php): users, password_reset_tokens and sessions, with child-first rollback.
Existing failed_jobs migration unchanged. Archived framework .php.txt examples remain non-executable history. No commerce or RBAC migrations.

Supporting changes: UUID/normalization/recaller model configuration, matching factory, UTC database connection, infrastructure regression tests, CI and directly affected documentation.

## 10. Migration results
PASS against isolated PostgreSQL **18.6**, database **iranti_test**:
- Empty-schema migration, complete rollback/reset, reapply and migrate:fresh.
- UUID identities, unique email, lifecycle/normalization/activity CHECKs, FK rejection/cascade and email-update restriction.
- Required indexes and absent unused authentication/profile tables.
- Actual encrypted Laravel session persistence/reload/update/expiry/GC.
- Actual framework reset hashing, invalid-token rejection, replacement, expiry, deletion and auth:clear-resets.

Each identity test rebuilds only the guarded isolated test database; no business database was migrated. Final suite tested the finalized migration after discarding earlier test-schema state.

## 11. Backend regression
| Gate | Result |
|---|---|
| Laravel boot, PHP 8.5.8 / Laravel 13.32.0 | PASS |
| PHPUnit including PostgreSQL/Redis infrastructure | PASS — **13 tests, 106 assertions**, no skipped infrastructure tests |
| Pint | PASS |
| Larastan/PHPStan level 8 | PASS — no errors |
| Composer validate --strict | PASS |
| Redis cache/connectivity, queue success and recorded failure | PASS on isolated Redis 8.2.9 |
| Next.js production server → Laravel /api/v1/health | PASS — returned data.status=ok |
| Private local storage smoke check | PASS within PHPUnit |

Intentional error/queue-failure probes log sanitized exception classes; those entries are expected test evidence, not unresolved failures.

## 12. Dependency audits
Composer audit: **no vulnerability advisories**. npm audit: **0 vulnerabilities**. Both remain mandatory CI gates; no audit suppression. Audits describe known advisories at this run and do not eliminate EOL/undisclosed-risk exposure.

## 13. CI status
Workflow syntax passed official actionlint 1.7.12; shellcheck/pyflakes were unavailable and explicitly disabled, not claimed tested. Local equivalents of backend/frontend gates passed. CI uses locked installs, warning + exact ESLint pin check, independent lint/types/tests/build and audits; EOL alone is no longer a failure.

**HOSTED CI NOT VERIFIED** — no Git remote, push or Actions run. This alone does not block Phase 3B. The requested frontend lockfile/manifest commit exists; other foundation/remediation files remain local and uncommitted. No deployment occurred.

## 14. Remaining risks
- Accepted, bounded ESLint 9 EOL risk under ADR-010.
- Physical schema differences are explicit in ADR-011 and part of this approval package.
- Storage tests do not claim complete authentication security: authorization, CSRF/login/session rotation/revocation, reset concurrency and MFA are future implementation gates.
- Session IP/agent data needs restricted access and operational retention enforcement.
- Native PostgreSQL/Redis equivalents were tested; Docker Compose execution and hosted CI remain unverified.

## 15. Remaining non-blocking items
- Configure remote/branch protection and run hosted CI after publishing the project.
- Wire deployment scheduler to hourly auth:clear-resets and hourly session garbage collection using configured lifetime; confirm final retention and cookie/domain settings before launch.
- Supply deployment/SMTP/object-storage/provider credentials and confirm production infrastructure through the existing approved configuration process.
- Keep approved role-policy confirmation and authentication controls in their planned implementation review; no identity-strategy or schema decision remains open.
- Review official ESLint ecosystem/advisories on the stated schedule and before production.
- Use PHP 8.5 explicitly on this host; default shell PHP still points to Herd 8.4.1.

These do not prevent architecture, database/API/security design or reasonable estimation. No Phase 1 settled decision was reopened.

## 16. Readiness
FND-001 identity/session reconciliation: **RESOLVED**.
FND-003 tooling support: **APPROVED TEMPORARY EXCEPTION**, with upgrade gate and residual risk recorded.
No remaining Phase 3A blocker identified. Phase 3B has **not** begun and awaits approval.

**PHASE 3A READY FOR APPROVAL**
