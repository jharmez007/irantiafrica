# PHASE 3B FINAL APPROVAL REPORT

**Subsequent disposition:** the client formally approved this baseline and authorized Phase 3C. The original approval report below is retained as historical evidence; see [Phase 3C report](phase-3c-report.md) for current work.
Baseline: **Phase 3B v1.0 approval candidate — 2026-09-21**.
Both previously pending client gates are resolved. **RBAC Matrix: APPROVED FOR V1. MFA: APPROVED FOR STAFF V1. Customer MFA: NOT REQUIRED FOR V1.** This report supersedes the [interim report](phase-3b-interim-report.md). Implementation approval is now requested; Phase 3C has not begun.

## 1. Approved roles
Business Owner / Super Admin (owner), Order Processing Staff (order_processing), Inventory / Store Staff (inventory_store). One shared UUID User model; customers have no staff grants. No new roles, is_admin/is_staff columns, user_type or CustomerProfile.

## 2. Final permission model
Document 17 was re-read and implemented without changing its approved grant cells. Its grouped names expand into **31 explicit permissions**: owner 31, Order Processing 11, Inventory/Store 4. Idempotent, audited seed reconciles grants in roles/permissions/user_roles/role_permissions. No arbitrary permission assignment endpoint. No RBAC package added.

Order staff lack inventory adjustment, refund, staff/permission/security administration and unrestricted settings. Inventory staff lack order management, refunds, staff/permission/security administration and settings. Scope qualifications (availability-only, assigned-order/operational fields, redacted inventory actors, intake rather than return decision) remain mandatory future object/data policies. No absent commerce module or broad data endpoint is implemented merely because a capability identifier is seeded.

## 3. Super Admin semantics
**Explicit permissions only; no wildcard or authorization bypass.** Owner must complete MFA exactly like other staff. Every staff gate checks active identity and MFA session/version. Permissions marked recent-auth in document 17 enforce it at the gate; staff administration checks again under transaction locks. Unknown capabilities are denied.

## 4. Staff provisioning
One-time audited interactive **identity:bootstrap-owner**, hidden password/confirmation, no default password or public endpoint. Refuses subsequent bootstrap when any owner assignment exists. Bootstrap and staff mutations use a common PostgreSQL advisory lock.

Subsequent provisioning uses a controlled backend API/service authorized by a complete/recent owner. It creates a random undisclosed password, assigns only an approved role and sends encrypted queued password-setup instructions. Recipient sets password and must enroll MFA. Role change, disable and administrative MFA reset are controlled API/service actions; no full staff-management UI was added. Self role/disable changes and self MFA reset are denied; last-active-owner removal is protected. Role changes/disable/reset revoke target sessions and outstanding reset tokens.

## 5. MFA implementation
Vendor-neutral **TOTP** via pragmarx/google2fa **9.1.0**; local QR generation via bacon/bacon-qr-code **3.1.1**. No SMS or custom OTP cryptography. Six digits, 30-second period, +/-1 step drift; accepted step persisted atomically so a used/older TOTP cannot be replayed. Confirmed secret is Laravel-encrypted under external APP_KEY; pending secret lives only in encrypted session storage. No secret readback after activation.

## 6. Enrollment lifecycle
Password login rotates session and returns enrollment_required or mfa_required for staff. Pending staff can access auth status, logout and required MFA flows only; privileged and customer account resources reject them. /mfa offers local QR/manual setup, confirmation, challenge, recovery-code entry and code display.

Successful confirmation activates MFA, issues recovery codes once, increments auth_version, revokes other sessions and rotates session/CSRF again. Challenge completion binds MFA to current user/session/version. Pending sessions expire after ten minutes; completed staff sessions use 15-minute idle/eight-hour absolute limits. Sensitive operations require password authentication within five minutes; fresh password + TOTP reauthentication renews that window. Customers retain password/session authentication without MFA.

## 7. Recovery mechanism
Eight cryptographically random 128-bit codes, individually password-hashed and consumed once under a User row lock. Regeneration requires complete authentication, password and fresh TOTP, atomically invalidates previous codes and returns replacements for one-time display. No plaintext codes are stored in the database, logs or browser persistent storage.

Another authorized owner may reset staff MFA only with complete/recent authentication and an allowlisted reason. This clears secret/codes/replay state and all trusted sessions, then requires re-enrollment. No public disable endpoint, security questions or self-reset escape. Sole-owner loss of authenticator plus all recovery codes requires the independently verified incident/deployment-operator process; no unauthenticated bypass is provided. Recovery-code custody and naming that operator remain pre-production operating tasks.

## 8. Migrations created
- 2026_09_21_000003_create_identity_authorization_tables.php: UUID role/permission assignments and append-only audit_logs (created in the initial Phase 3B work).
- 2026_09_21_000004_add_mfa_replay_protection.php: nullable nonnegative bigint users.mfa_last_used_step.

Existing Phase 3A identity/session/reset schema remains. No commerce tables. Full migration reset/rollback/reapply and migrate:fresh tested on isolated PostgreSQL 18.6 iranti_test.

## 9. Audit events
Registration/login/failure/logout/recovery request/password reset plus owner_bootstrapped, staff_created, role_assigned, role_changed, staff_disabled, permissions_changed, mfa_enrollment_started, mfa_enabled, mfa_failed, mfa_challenge, recovery_code_used, recovery_codes_regenerated, reauthenticated, reauthentication_failed and mfa_reset (identity. namespace).

No passwords, TOTP secrets, submitted proofs, recovery codes or session payloads recorded. Critical state/audit changes commit atomically. Audit UPDATE/DELETE/TRUNCATE rejected; deployment must still use a non-owner runtime database role because DB owners/superusers can defeat triggers.

## 10. Backend results
| Executed gate | Result |
|---|---|
| Complete PHPUnit suite with PostgreSQL/Redis | **PASS — 34 tests, 547 assertions; no skips** |
| Empty/fresh migrations, full rollback and reapply | PASS |
| Pint | PASS |
| Larastan/PHPStan level 8 | PASS, no errors |
| Composer validate --strict | PASS |
| Redis cache/queue success and failure regression | PASS |

Expected sanitized exception logs came from intentional error probes. A corrected multi-request test harness resets Laravel's cached guard and session-store instances between browser requests; it does not weaken application security. TOTP initial replay-counter handling was corrected to the library's documented return semantics and verified by passing tests.

## 11. Frontend results
**PASS:** npm ci --strict-peer-deps, ESLint, Prettier check, strict TypeScript, Vitest **8 tests**, production Next.js build and npm audit. Existing auth routes remain; /mfa adds enrollment, confirmation, challenge, recovery display/regeneration and recent-auth UI. Auth-state routing sends password-only staff to MFA. Secrets exist only in temporary component state and are cleared on completion/logout; no external QR service.

ESLint 9.39.5 remains under approved ADR-010 temporary exception; 10.x target and review gate unchanged. Frontend dependency graph unchanged.

## 12. Integration results
**PASS in automated real-database HTTP tests:** customer registration/login/logout, generic recovery/reset and session revocation, staff provisioning/password setup/login, enrollment/confirmation/challenge, recovery/regeneration/admin reset, role separation, 401/403, CSRF, rate limiting, session persistence/regeneration/invalidation and recent authentication.

**PASS through the live Next.js production proxy:** staff password login, restricted 403 before MFA, QR/setup/confirmation, TOTP challenge, recovery-code login and reuse rejection, persisted privileged session, logout and subsequent 401. Temporary fixture used only guarded iranti_test; no production user was created. The earlier customer live-proxy check also passed during Phase 3B.

Actual external SMTP delivery and a full browser-driven visual/accessibility journey are **not claimed executed**. Notification behavior is tested with framework fakes; provider delivery remains the existing SMTP/deployment gate. UI types/lint/build, transport tests and live HTTP proxy checks are evidence of their stated scope only.

## 13. Security test results
**PASS:** all **93 approved role/capability cells** against independently enumerated expectations; no owner bypass; customer/public role injection denied; password-only owner/staff denied; invalid/replayed TOTP rejected; recovery codes single-use and replaced on regeneration; code/password/secret exclusion from audit; MFA rate limits; cross-customer identity denial; fresh-auth requirement; self-escalation/admin-reset restrictions; last-owner guard; role-change/disable/MFA-reset revocation; UUID/FK/unique constraints and audit immutability.

Two-process PostgreSQL tests prove single consumption for both password reset and MFA recovery codes. No high/critical finding remains from executed checks; this is not a penetration-test or production compliance claim.

## 14. Dependency audits
**Composer audit: no vulnerability advisories. npm audit: 0 vulnerabilities.** Composer lock now includes the two maintained MFA/QR libraries and their resolved encoding/enum dependencies. No force, ignored platform constraints or speculative preview packages. Audit results do not eliminate unknown-vulnerability or the accepted ESLint EOL risk.

## 15. Architecture decisions/deviations
[ADR-012](../architecture/adr/012-staff-mfa.md) records the client-approved mandatory staff MFA decision, package choice, restricted/full session states, replay-counter schema amendment and recovery procedure. Documents 16/17/31 now mark the former provisional staff gates resolved; document 08 explicitly references the additional security column. No silent matrix change or Phase 1 requirement edit. Optional customer email verification remains unapproved and is not a commerce gate.

## 16. Remaining non-blocking items
- **HOSTED CI NOT VERIFIED:** no remote/Actions run. Local workflow syntax passed actionlint; shellcheck/pyflakes were unavailable and disabled. Source changes remain local/uncommitted except the existing frontend manifest/lock commit; publish/review and configure branch protection in the repository workflow.
- Configure real SMTP, identity queue worker, scheduler and verify delivery before onboarding real staff.
- Confirm production domain/cookies, TLS/proxy behavior, synchronized clocks, external key custody and least-privilege runtime DB role. Production boot rejects unencrypted/non-PostgreSQL sessions and non-host-only cookie domains.
- Name incident/recovery operators, store recovery codes safely, approve operational retention and run production hardening/accessibility checks.
- Enforce documented object/field scope qualifications as each later commerce module is implemented.
- Continue ADR-010 compatibility/advisory monitoring and mandatory pre-production ESLint review.

These are existing deployment/later-module gates, not unresolved Identity/RBAC policy decisions.

## 17. Readiness for Phase 3C
Approved matrix implemented; staff provisioning controlled; mandatory staff MFA/recovery enforced; customer authentication preserved; backend authorization and escalation/regression tests pass. Both prior approval blockers are resolved. Phase 3C may be proposed after client acceptance; **no Phase 3C work has begun**.

**PHASE 3B READY FOR APPROVAL**
