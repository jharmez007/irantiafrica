# Identity/session reconciliation — finalized
Baseline: Phase 3A remediation v1.1, 2026-09-20.
Status: **RESOLVED FOR PHASE 3A APPROVAL**.

The client's later remediation instruction supersedes the previous inspection-only stop. [ADR-011](../architecture/adr/011-identity-framework-storage.md) records every deliberate physical-schema deviation, Laravel convention and Phase 3B obligation; document 08 retains the original logical design and explicitly points to that mapping.

- One shared users table for customers and staff; guests need no fabricated identity.
- UUID users, name(160), normalized unique email(254), password hash(255), nullable verification time, nonnull UTC timestamps.
- Approved status/auth_version/MFA columns retained; no invented customer attributes. No remember token, soft deletes or is_admin.
- PostgreSQL encrypted sessions use the framework opaque string PK, nullable UUID user FK, bounded IP/agent metadata, payload and indexed nonnegative bigint activity.
- Email-keyed reset storage uses the framework hasher and configured expiry/cleanup; FK prevents orphan tokens and restricts email updates until tokens are removed.
- No CustomerProfile or personal_access_tokens. Role/permission tables and the Business Owner / Super Admin, Order Processing Staff and Inventory / Store Staff features remain Phase 3B; ordinary customers receive no staff privileges.
- No authentication, registration, reset, MFA or RBAC endpoints are enabled by this remediation.

## Difference disposition
A (framework implementation detail): email/password naming, string session PK and metadata fields, email-keyed reset repository and derived expiry.
B (explicit documented physical deviation): those A details differ from original document 08 and are intentionally reconciled in ADR-011 under the client's preference for framework-supported conventions.
C (required schema changes): UUID user/FKs, field lengths, timestamptz defaults, UTC connection, normalization/lifecycle/activity checks, security fields, indexes and reverse dependency rollback are implemented.
D (decision required before Phase 3B): **none remaining**. Future authentication security tests and deployment configuration remain implementation work, not missing identity strategy decisions.

Executable migration added: backend/database/migrations/2026_09_20_000002_create_identity_tables.php. Existing failed_jobs migration remains unchanged. Generated .php.txt examples remain non-executable historical reference; they are not future migrations to apply verbatim.

Tests in IdentityStorageTest exercise hashing, normalized uniqueness, UUIDs, FK/CHECK/index rules, encrypted session reload/update/expiry/GC/cascade, reset replacement/expiry/deletion/cleanup and absence of unused tables. InfrastructureTest covers full rollback, clean migrate, migrate:fresh and Redis queue success/failure. Final executed counts and limitations are in [the approval report](phase-3a-final-approval-report.md).
