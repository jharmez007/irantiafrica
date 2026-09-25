# PHASE 3B IDENTITY & RBAC REPORT
Working baseline: **2026-09-21, v0.1 — PARTIAL / NOT APPROVED**.
Phase 3A approval is recorded from the client's latest instruction. Phase 1 requirements were not changed. No commerce implementation or Phase 3C work began.

## 1. Migrations created
2026_09_21_000003_create_identity_authorization_tables.php adds roles, permissions, user_roles, role_permissions and audit_logs only. UUIDs, unique assignments, FK delete policies and append-only audit protection follow the approved logical schema. Phase 3A user/session/reset migrations remain unchanged.

## 2. Models created/changed
Role and Permission added; User gains role relationships, explicit permission checks, staff-boundary checks and secure queued recovery notification routing. No role flags or CustomerProfile. IdentityResource explicitly serializes id/name/email/verification boolean/own role codes, never security fields.

## 3. Authentication endpoints
Implemented per architecture 18: POST /api/v1/auth/register, /auth/login, /auth/logout, /auth/password/forgot, /auth/password/reset; GET /auth/me. Framework GET /sanctum/csrf-cookie enabled. GET /api/v1/customer returns only current identity; GET /api/v1/admin/access is a minimal staff authorization placeholder. No staff-management mutation endpoints.

## 4. Frontend routes
/register, /login, /forgot-password, /reset-password, /account, /admin. Credentialed browser transport, CSRF bootstrap, current-user state, guest/auth handling, logout, safe errors and staff-aware navigation. /admin exposes no module data. No commerce UI.

## 5. Roles created
Idempotent seed for Business Owner / Super Admin (owner), Order Processing Staff (order_processing), Inventory / Store Staff (inventory_store). No users/default passwords, customer admin role or speculative roles seeded.

## 6. Permissions created
**No production permission rows or role grants seeded.** Gate capability identifiers staff.provision, roles.assign and audit.read are defined from architecture 17, resolving explicit database grants. The full proposed initial permission set remains in document 17 pending client approval. Tests create isolated fixture permissions to verify the mechanism; they are not approved operational grants.

## 7. Authorization strategy
Laravel gates backed by current role/permission relationships; no owner bypass, wildcard or UI-only enforcement. Active/current-version identity required. Customer reads derive identity from session. Staff boundary requires one of the three confirmed roles. Complete operational matrix, controlled staff provisioning, role mutation/recent-auth checks, last-active-owner safeguards and related audit events are **not yet implemented**, because staff grant/MFA/provisioning policy remains open.

## 8. Session/security configuration
PostgreSQL encrypted JSON sessions; Secure-by-default, HttpOnly, SameSite=Lax, host-only cookies; local HTTP explicitly configured. Login/registration regenerate session/CSRF; logout invalidates; reset deletes sessions and increments auth_version. Inactive/stale identities are rejected. Configurable defaults: 120-minute idle and 12-hour absolute session limit. Staff-specific policy pending.

Sanctum stateful middleware plus auth:web uses first-party cookies only, without bearer-token fallback. Exact trusted Origin/Referer validation; explicit CSRF proof required even with Sec-Fetch-Site and in tests. Next proxies API and CSRF bootstrap. No browser token storage. Hourly reset/session cleanup scheduled; production scheduler still requires deployment wiring.

## 9. Rate limits
Redis-backed, HMAC account/network keys: per minute login 5/account, registration 3/account, recovery 3/account, reset 5/account; additional 30/network/action. Uses non-evicting Redis, fails closed on dependency errors, preserves Retry-After. These are documented engineering defaults, not client-approved SLAs.

## 10. Audit/security events
Registration, successful/failed login, logout, generic recovery request and password reset. Opaque actor IDs, fixed action/outcome, request ID and UTC time; no attempted emails, passwords, reset tokens or session bodies. Critical DB mutation/audit atomic; audit UPDATE/DELETE/TRUNCATE rejected by PostgreSQL trigger. Runtime least-privilege role and legal retention remain deployment gates. Staff/role/permission mutation audit awaits those controlled flows.

## 11. Tests added
AuthenticationTest: real HTTP cookie/CSRF/session persistence, login/logout/rotation, generic failures, throttling, disabled/version/absolute expiry, mass assignment, IDOR rejection, reset/reuse/revocation and two-process reset race. AuthorizationFoundationTest: three role names, UUIDs/idempotent seed, explicit grant/deny/revoke with no owner bypass, assignment uniqueness/FKs/cascades and audit immutability. Frontend auth-api tests: CSRF decoding/bootstrap/credentialed writes, bootstrap failure and forbidden responses. Vitest configuration now includes both .ts and .tsx tests.

## 12. Backend and integration results
| Executed check | Result |
|---|---|
| Complete PHPUnit including real PostgreSQL/Redis | **PASS — 24 tests, 250 assertions; no skips** |
| Empty/fresh migrations, complete rollback and reapply | PASS in isolated iranti_test |
| Parallel token consumption in separate processes | PASS — exactly one accepted, one rejected |
| Pint | PASS |
| Larastan/PHPStan level 8 | PASS |
| Composer validate --strict | PASS |
| Redis cache/queue success and failure regression | PASS |
| Live Next.js production proxy → Laravel | PASS: CSRF bootstrap/rejection, register, persistent current user, staff denial, logout and login |
| Workflow syntax, actionlint | PASS (shellcheck/pyflakes unavailable, disabled) |

Expected sanitized error entries from deliberate failure probes are not test failures. Tests rebuilt only the isolated test database. Full approved operational permission matrix/MFA/staff provisioning tests are **NOT EXECUTED/NOT IMPLEMENTED** pending decisions; generic grant tests do not substitute for them.

## 13. Frontend validation/build
npm ci --strict-peer-deps passed; ESLint, formatting, strict TypeScript, Vitest **6 tests**, and production Next build passed. ESLint remains 9.39.5 under approved ADR-010 exception; 10.x target unchanged. No dependencies added or lockfile upgrades. Full browser visual/accessibility journey review has not been executed; HTTP cookie-jar integration and transport tests are not a claim of browser E2E coverage.

## 14. Dependency audits
npm audit: **0 vulnerabilities**. Composer audit: **no vulnerability advisories found**. EOL risk remains governed by ADR-010. Hosted CI: **HOSTED CI NOT VERIFIED**, no remote. Existing frontend manifest/lock commit remains; Phase 3B changes are local, not pushed or deployed.

## 15. Security findings and limitations
- No high/critical issue was identified by executed checks; this is not a penetration-test claim.
- Do not expose staff access in production until approved grants, provisioning safeguards, recent-auth and MFA policy are implemented/tested.
- Password reset mutation is transactionally serialized and concurrency-tested. RecoveryNotification uses framework encrypted queued payloads; actual SMTP delivery/provider behavior has not been verified. Local array transport discards mail without logging proofs; SMTP is required in production, log transport rejected.
- Reset links use fragments, removed into component memory; no token in HTTP URL/query/referrer. No new raw request/body logging.
- Audit triggers do not defeat a database owner/superuser. Deploy a separate least-privilege runtime DB role; approved retention and privileged maintenance remain necessary.
- Registration can indicate that registration failed for an existing address; unlike generic login/recovery this is not represented as enumeration-proof.

## 16. Architecture deviations
No material architecture decision silently changed. API paths follow document 18. Existing approved ADR-011 physical mappings remain intact. Stricter explicit CSRF token middleware, exact-origin check, identity-only audit implementation, rate limits and absolute lifetime are documented engineering choices. Email verification remains unapproved/optional and imposes no account or commerce gate. Guest order capabilities and cart merge were excluded by the client's narrowed Phase 3B instruction and await relevant commerce resources.

## 17. Remaining open decisions and dependent work
**Blocking for Phase 3B completion:**
1. Approve or revise document 17's exact role-permission matrix. Role names and owner-only initial stock/refund duties are already settled; these are not reopened.
2. Confirm whether staff MFA is required in this phase or deferred to a pre-production decision, including the resulting provisioning/recovery safeguards.

Both questions were asked before dependent implementation and remain unanswered. Architecture 17 explicitly states: **“Client approval of matrix and MFA/recovery precedes Identity/RBAC implementation.”** Phase 1 Q13 also reserves approval of individual grants. The latest Phase 3B authorization retains approved decisions and does not explicitly resolve those proposed cells. This is why the implementation has not invented grants or enabled an owner bootstrap flow.

After answers: implement approved grant seed, controlled owner/staff provisioning, recent-auth/last-owner/revocation/audit controls, MFA/recovery as selected, complete role matrix/negative tests and rerun affected gates. Non-blocking deployment items: SMTP credentials/delivery check, scheduler, cookie/domain values, retention, runtime DB privileges, remote/hosted CI and pre-production ESLint review.

## 18. Readiness for Phase 3C
Customer authentication and generic authorization/storage foundation are implemented and tested. Staff-policy-dependent implementation is incomplete. No Phase 3C work began. This is a partial report, not a completed-phase approval request.

**PHASE 3B NOT READY FOR APPROVAL**
