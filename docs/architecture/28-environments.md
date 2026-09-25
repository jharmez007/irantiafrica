# 28 — Environment strategy
Trace: NFR03/07/12; Q23.

| Environment | Purpose | Data / secrets / providers | Domains/debug/logging |
|---|---|---|---|
| Local | Developer work after authorization | Synthetic seeds, isolated PostgreSQL/Redis, local mail sink, fake gateway or Paystack test keys | Local hostnames, debug permitted, no committed secrets |
| Testing / CI | Deterministic automated checks | Ephemeral real PostgreSQL for locking; fake external providers; scoped CI tokens, no live payment keys | Disposable URLs; logs scrubbed; isolated parallel database namespaces |
| Staging | Production-like release/UAT/failure tests | Separate managed DB/Redis/buckets; synthetic or explicitly anonymized data; Paystack test account; email allowlist/sandbox | Restricted staging subdomain, noindex plus real access control; debug off |
| Production | Live commerce | Live merchant/transactional accounts, unique keys/users/buckets/backups | Canonical domain, TLS, debug off, approved monitoring and retention |

Never share production database/cache namespace, object bucket write credentials or Paystack secret with staging. Environment identifiers are embedded in job/idempotency/cache context. Test/live webhook secrets and callback URLs are separate. Production application refuses startup for missing critical configuration and detects obviously mismatched provider mode; no default live fallback.

Secret manager or platform secret injection; developers receive least privilege. Rotation runbook includes gateway webhook overlap strategy if supported, database credentials, application encryption keys, email/storage keys and session invalidation effects. Store variable schema and non-sensitive examples in future repo; never real .env. Build-time public variables cannot contain secrets.

Promotion uses the same tested immutable artifact, environment-specific runtime configuration and recorded release ID. No live provider side effects in CI/restore drills. Email allowlisting and outbound restrictions protect against accidental staging delivery. Staging parity includes workers/scheduler and trusted proxy/cookie settings so auth is exercised realistically.

Assign repository/environment owners, business UAT approver and secret/recovery custodians before foundation. Production access is time-bound/audited where tooling supports it. Local developer convenience never weakens production policy.
