# ADR-011 — Physical identity storage reconciliation
Date: 2026-09-20
Status: **IMPLEMENTED FOR PHASE 3A APPROVAL**, under the client's explicit schema-remediation authorization.

## Decision
Preserve shared UUID users, account lifecycle/security fields and PostgreSQL sessions. Use framework-compatible email/password names, opaque string session IDs and email-keyed hashed reset-token storage. This intentionally amends the physical mapping of the original logical schema in document 08; it does not silently replace business requirements or implement authentication flows. The original logical tables remain visible as design history.

## Mapping and deliberate deviations
| Area | Original logical design | Final physical baseline and rationale |
|---|---|---|
| User identity | UUID, name 160 | Retained; application-generated UUID through HasUuids, one name field, no separate CustomerProfile |
| Email/password | email_normalized / password_hash | email varchar(254) UNIQUE / password varchar(255), Laravel names for provider, broker and notifications; email contains normalized value, password only a hash |
| Security/lifecycle | status, auth_version, nullable MFA storage | Retained exactly from approved design; not new customer fields or implemented MFA |
| User timestamps | nonnull timestamptz defaults | Retained; connection timezone explicitly UTC; model updates updated_at |
| Remember me | Absent | No remember_token, model recaller name disabled; future auth code must not request remember=true |
| Sessions | UUID row id + session_id, common timestamps | Framework string id varchar(255) PRIMARY KEY; no redundant UUID or timestamps; last_activity provides expiry clock |
| Session metadata | ip_hint 64 / user_agent_hint 255 | Framework ip_address varchar(45), user_agent varchar(500), nullable; standard handler bounds agent to 500. These are sensitive raw request metadata, not anonymized hints. No metadata logging added; restricted DB access and expiry cleanup required |
| Session association | UUID FK, last_activity bigint >=0 | Retained nullable UUID FK users ON DELETE CASCADE/ON UPDATE RESTRICT, user index, bigint activity CHECK/index |
| Reset key | UUID + user_id | Normalized email varchar(254) PK and FK users.email; delete CASCADE, update RESTRICT. Email changes must delete outstanding tokens first |
| Reset digest | unique token_hash char(64) | token varchar(255) stores framework password-hasher output, never plaintext; one token per email, no digest uniqueness requirement |
| Reset expiry/consumption | expires_at / consumed_at + UUID/timestamps | Nonnull indexed created_at timestamptz; broker computes 60-minute expiry, deletes consumed/replaced tokens; no redundant UUID, updated_at or consumed_at |
| Sanctum tokens | Optional infrastructure | No personal_access_tokens migration published or table installed: first-party SPA cookie mode only |
| RBAC | UUID role/permission joins | Unchanged design, deferred implementation to Phase 3B; no is_admin, no seeded privileges |

## Email and deletion policy
Normalize with trim + lowercase in the model and apply the same normalization to all future login/reset/registration lookup input. PostgreSQL CHECK enforces lowercase/trimmed nonempty storage and UNIQUE prevents duplicate normalized identities, including raw DB writes. Full email validation and internationalized-address policy belong to Phase 3B validation; no provider-specific dot/plus rewriting. UUIDs do not substitute for authorization.

No SoftDeletes/deleted_at. Disable/anonymize through the future reviewed action; users are not casually deleted. Only ephemeral sessions/tokens cascade here; future financial references must RESTRICT and never cascade. Anonymization/email-change actions must revoke reset tokens and sessions first. Status/auth_version enforcement and MFA encryption/recovery-code handling are Phase 3B work; schema presence alone provides no such protections.

## Expiry, privacy and concurrency
Session payloads use Laravel encrypted session storage with JSON serialization, an external APP_KEY, Secure/HttpOnly/SameSite=Lax cookies. Default idle expiry is 120 minutes; handler reads reject expired records and its 2/100 request lottery runs garbage collection. Before launch, operations must schedule hourly session GC (handler gc with configured lifetime) and hourly auth:clear-resets so low traffic does not retain metadata indefinitely. Deployment scheduler wiring/retention confirmation is a non-blocking operations item; expiry validity does not depend on cleanup running.

Reset broker defaults: 60-minute lifetime, 60-second issuance throttle; repository hashes secrets, replaces old token on reissue, deletes after success. No reset endpoint is enabled. **Phase 3B must perform reset verification, password change, token deletion and session/auth-version invalidation in one transaction, locking the user row before reading the token; issuance and email-change actions must take the same lock.** Add a concurrent double-use test before enabling reset routes. Laravel's separate exists/delete calls alone do not prove atomic single use. No schema blocker remains because the UUID user row supplies the serialization lock and email PK supplies unique outstanding storage.

## Verification and boundaries
Tests exercise actual Laravel session manager/encrypted store and password token repository against PostgreSQL, plus FK/CHECK/UNIQUE/index behavior and clean migration/reset/fresh cycles. Standard handler/repository APIs remain usable without custom adapters. No customer profiles, personal tokens, roles/permissions or commerce tables are created. See the final Phase 3A report for executed results.
