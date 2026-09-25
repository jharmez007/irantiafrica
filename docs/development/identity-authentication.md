# Identity and authentication — Phase 3B final candidate
Date: 2026-09-21. Phase 3A is approved. Staff MFA and the RBAC matrix are now approved and implemented. See the final report for verification.

## API and browser flows
Shared UUID User, PostgreSQL sessions, Sanctum stateful middleware and the Laravel web guard. No browser bearer-token authentication, personal_access_tokens, CustomerProfile, duplicate identity store or role flags.

| Endpoint | Behavior |
|---|---|
| GET /sanctum/csrf-cookie | Framework CSRF bootstrap |
| POST /api/v1/auth/register | Name/email/password/confirmation; 201; normalized unique email; no staff grants |
| POST /api/v1/auth/login | Generic 401 on bad/disabled credentials; 200 safe identity; rotate session |
| POST /api/v1/auth/logout | Authenticated; invalidate server session, regenerate CSRF; 204 |
| GET /api/v1/auth/me | Authenticated, active and current-version identity only |
| POST /api/v1/auth/password/forgot | Same generic 200 for absent/present eligible identities; throttled broker issuance |
| POST /api/v1/auth/password/reset | Hashed expiring proof, transactional one-use consumption, password change and session revocation |
| GET /api/v1/customer | Own identity only; supplied IDs do not select another user |
| GET /api/v1/admin/access | Minimal staff-boundary proof, no dashboard data or business features |

Frontend /register, /login, /forgot-password, /reset-password, /account and /admin are implemented. AuthProvider fetches current state in the browser with credentials and no cache. Guest auth routes redirect signed-in users; account handles loading, unauthenticated redirects and retryable errors. Staff navigation is convenience only; /admin independently checks backend access. No auth state in localStorage or public server-rendered user cache. Error messages use the standardized API envelope and resource serializers exclude sensitive columns.

## Password and email policy
Only name (160), email (254), password and confirmation are collected. Email is trimmed/lowercased, validated and uniquely constrained by PostgreSQL. No provider-specific plus/dot rewriting. Password engineering default: 12–72 characters, additionally <=72 UTF-8 bytes for bcrypt; password managers/paste allowed, no arbitrary composition rule. No external breach service added. Registration cannot conceal all account existence while creating an immediate session: duplicate registration returns a safe recovery-oriented validation error; login and recovery conceal eligibility. Login/recovery use a minimum timebox and account/network throttles, not a claim of perfect timing indistinguishability.

Email verification remains optional/unapproved in requirements Q12/document 16. No verification endpoints or mandatory action gates are enabled, and email_verified_at is never set by public registration. No commerce action has been made dependent on verification.

## Sessions and CSRF
Secure-by-default, HttpOnly, SameSite=Lax, host-only session cookie; local .env explicitly permits HTTP. Laravel encrypted JSON session payload in PostgreSQL. Idle lifetime SESSION_LIFETIME defaults 120 minutes; AUTH_ABSOLUTE_SECONDS defaults 43200 (12 hours), enforced from login. Staff use a ten-minute restricted enrollment/challenge session, 15-minute idle limit and eight-hour absolute limit. These are documented engineering defaults. Production additionally refuses unencrypted/non-PostgreSQL sessions or a non-host-only cookie domain.

Login/registration rotate session and CSRF state. Logout destroys the previous session. Password reset deletes user sessions and increments auth_version; middleware rejects inactive or stale identities and absolute expiry. Role authorization reads current database grants rather than cached client claims.

RequireCsrfToken deliberately requires the token even when Laravel 13 would accept Sec-Fetch-Site: same-origin, and does not bypass CSRF under PHPUnit. TrustedBrowser additionally requires an exact allowed Origin, or Referer origin, and a stateful session. Auth routes use auth:web so Sanctum's bearer-token fallback is not enabled. Originless auth clients are intentionally denied. Health remains stateless/public.

Set APP_URL, TRUSTED_ORIGINS and SANCTUM_STATEFUL_DOMAINS consistently for localhost:3000 (or 127.0.0.1:3000). Next forwards /api/* and /sanctum/csrf-cookie to API_INTERNAL_URL; production reverse proxy must preserve cookie/header behavior and strip untrusted forwarding headers. Client fetches CSRF cookie, decodes XSRF-TOKEN and sends X-XSRF-TOKEN on credentialed mutations. No wildcard credentialed CORS.

## Recovery and notifications
Framework broker: 60-minute token validity and 60-second reissue throttle. Both issuance and reset lock the User row; reset validates proof and changes password, increments auth_version, consumes token, removes sessions and appends audit in one transaction. Two-process PostgreSQL test proves one accepted and one rejected use of the same token. Reset does not automatically log in.

RecoveryNotification is queued on Redis identity queue and implements ShouldBeEncrypted. Reset URL email/token are in the fragment, not HTTP query/path; the UI copies to component memory and immediately removes the fragment with replaceState. Never log URLs/tokens, cookies or message bodies. Only SMTP or non-production in-memory array mail transports are accepted; log mailer is rejected. SMTP delivery is not verified without a sender service. Local default is array (no delivery/no token logging); tests capture notification proofs in memory. Run php artisan queue:work redis --queue=identity with the approved PHP. Configure SMTP before expecting actual recovery email.

## Rate limits and failure behavior
Per minute defaults: login 5/account, registration 3/account, recovery 3/account, reset 5/account; each additionally 30/network/action. Keys HMAC normalized email and IP with APP_KEY. Laravel limiter uses the dedicated identity_limits cache store backed by non-evicting Redis default connection, not the evicting application-cache Redis. No permissive fallback: limiter/session failure rejects the request. These engineering values require production traffic review. 429 includes Retry-After.

## Audit and cleanup
Audit actions currently: identity.registered, identity.login, identity.login_failed, identity.logout, identity.recovery_requested, identity.password_reset. Anonymous failures/requests store no attempted email/IP/body; successful events reference UUID actors. Password mutation/audit are atomic. Audit rows enforce append-only UPDATE/DELETE/TRUNCATE protection and actor FK restriction. Deployment must use a separate non-owner runtime DB role with INSERT/SELECT only on audit_logs; schema-owner/superuser can disable triggers and is not a tamper-proof authority. Retention requires privileged approved maintenance; no invented deletion period.

Hourly schedule: auth:clear-resets and expired PostgreSQL session deletion. Configure the scheduler with php artisan schedule:run each minute. Idle expiry works without cleanup, but scheduling is required before production to bound expired-data retention.

## Development verification
Use /opt/homebrew/bin/php (8.5.8 on this host). On the isolated loopback iranti_test database only:

- IRANTI_INFRA_TESTS=1 /opt/homebrew/bin/php vendor/bin/phpunit
- /opt/homebrew/bin/php vendor/bin/pint --test
- /opt/homebrew/bin/php vendor/bin/phpstan analyse --memory-limit=512M --debug
- /opt/homebrew/bin/php /opt/homebrew/bin/composer validate --strict and composer audit

Infrastructure tests destroy/rebuild iranti_test; never point them at business data. Parallel reset proof requires pcntl (present locally and configured in CI). Frontend: npm ci --strict-peer-deps; format:check; lint; typecheck; test; build; audit. New .ts transport tests are included alongside .tsx tests.

## Approved staff MFA lifecycle
**MFA: APPROVED FOR STAFF V1. Customer MFA: NOT REQUIRED FOR V1. RBAC Matrix: APPROVED FOR V1.** See [ADR-012](../architecture/adr/012-staff-mfa.md).

IdentityResource returns authentication_state: authenticated for customers and MFA-complete staff, enrollment_required for unenrolled staff, mfa_required for enrolled staff with only password verification. After password success the browser redirects restricted staff to /mfa; backend restrictions operate independently. All staff roles, including owner, require completion. Pending staff may access only auth status, logout and necessary MFA flows, not privileged/customer account resources.

| Endpoint | Control |
|---|---|
| POST /api/v1/auth/mfa/enroll | Restricted staff only; unconfirmed enrollment; secret/locally generated QR returned; no readback after activation |
| POST /api/v1/auth/mfa/confirm | Valid six-digit TOTP proves setup; activate encrypted secret, issue eight codes once, rotate session and revoke other sessions |
| POST /api/v1/auth/mfa/challenge | Password-verified enrolled staff; fresh TOTP or one-use recovery code; rotate session on completion |
| POST /api/v1/auth/mfa/recovery-codes | Complete staff session + password + fresh TOTP; old codes invalidated, replacements displayed once |
| POST /api/v1/auth/reauthenticate | Complete staff session + password + fresh TOTP; five-minute recent-auth window |

TOTP uses pragmarx/google2fa 9.1.0 with six digits, 30-second steps and +/-1 step tolerance. The accepted step is stored in users.mfa_last_used_step under row lock; codes at or before that step are rejected. Pending setup secret is stored only in encrypted session data; confirmed secret uses Laravel encryption under external APP_KEY. QR uses bacon/bacon-qr-code 3.1.1 locally, never an external QR service. Eight random 128-bit recovery codes are individually password-hashed; consumption and regeneration are locked/atomic. Codes and setup secrets are held only in component memory for display, not localStorage. Password reset preserves enrolled MFA while revoking sessions.

MFA confirmation/challenge/regeneration rotate session and CSRF state. Completing MFA inherits the original password timestamp; an already complete session cannot use challenge to refresh recent-password trust. Reauthentication/regeneration require current password and a fresh authenticator code. Owner permission semantics do not bypass any of these checks.

Additional per-minute account limits: MFA challenge/recovery attempts/regeneration share 5; enrollment/confirmation share 5; reauthentication 5; controlled staff administration 20. Each operation group also has a 30/network bound. Staff administration is separate from the stricter factor-attempt budget. All use HMAC keys and non-evicting Redis. Failed MFA attempts are audited without submitted values.

New audit actions: identity.owner_bootstrapped, staff_created, role_assigned, role_changed, staff_disabled, permissions_changed, mfa_enrollment_started, mfa_enabled, mfa_failed, mfa_challenge, recovery_code_used, recovery_codes_regenerated, reauthenticated, reauthentication_failed, mfa_reset. All have the identity. prefix. Critical state/audit writes commit together; validation failures are recorded outside rolled-back mutations by returning the failure result before raising the safe response.

For staff onboarding, administrative reset and last-owner safeguards follow [RBAC runbook](rbac.md). Production still requires real SMTP delivery verification, scheduler/worker wiring, key custody, synchronized clocks, least-privilege runtime DB credentials, approved retention and named recovery operators. No staff recovery policy approval remains open; these are deployment/operating checks.
