# Ultra-lean Render topology — approved decision and verification register

Date: 2026-10-04. The budget-driven topology is **approved for application conversion**, documented by [ADR-018](../architecture/adr/018-ultra-lean-production-deployment.md). `render.yaml` now describes one Docker web service and one PostgreSQL database. It has **not** been provisioned or deployed. Earlier multi-service/Redis proposals are superseded for this first release. Phase 3O remains open.

| Component | Initial configuration | Verification |
|---|---|---|
| Web | Render `1c-2g`; Nginx, two-child PHP-FPM, Next standalone, Supervisor | Local image build, five-process restarts, HTTP and SIGTERM passed at 2 GB/one CPU; populated-data peaks pending |
| PostgreSQL | Managed PostgreSQL 18, smallest paid plan; commerce, queue, cache/locks, encrypted sessions | Isolated local PostgreSQL queue/cache tests passing; Render capacity, backups and restore pending |
| Queue | One DB worker, `identity,default,transactional,media`, 3-second idle sleep, 90-second lease, 60-second timeout | Named/delayed/retry/failure/after-commit/recovery mail local tests passing; media/payment and container restart under load pending |
| Scheduler | One `schedule:work` per container; DB `onOneServer` locks, `withoutOverlapping` on critical scans | Two concurrent local scheduler processes ran each due critical task once; deployment-overlap handover pending |
| Media | Private Cloudflare R2 via signed application upload proxy and ACL-free PutObject | Code prepared; real R2 round trip/restore pending |
| Email | Resend SMTP via existing notification abstraction | Provider account/domain/inbox/bounce tests pending |
| Payments | Paystack TEST behind pre-launch gate | External test-provider UAT pending; LIVE prohibited without separate approval |

Why: the business owner's fixed-cost limit makes a web, worker, cron and two Key Value services too expensive for initial traffic. The lean topology reduces the fixed Render resource count, but concentrates CPU, RAM and database I/O. Actual Render pricing and database connection limits must be reconfirmed before spending; earlier approximate $31/month floor is not a quote and excludes R2, email, bandwidth, domain and taxes.

The standard database queue migration is active; `job_batches` is unused. The backend retains Redis for local development but no production Redis pinning remains in recovery or transactional dispatch. PostgreSQL cache stores short-lived encrypted MFA enrollment data, rate limits, image/scheduler locks and other temporary values. The hourly scheduler prunes expired cache and sessions. The private `DB_URL` comes from the Blueprint database reference; this Render-only profile permits `DB_SSLMODE=require` because Render private Postgres uses provider-internal TLS without verified hostnames. Other production profiles retain their prior stricter requirements.

Queue delivery is at least once. Webhook inbox and transactional outbox remain authoritative; domain uniqueness/fencing is required for payment, refund, stock and email effects. One media job can hold the worker for up to 60 seconds, so measure priority-queue latency. Nominal idle polling is about 80 SQL polls/minute across four names at three-second sleep. Two FPM children plus worker, scheduler command and operator shell suggest roughly six application DB connections in steady state, potentially twice during deploy overlap; measure against the actual database tier. Separate worker, Redis and larger database are deferred scale-out options when queue age, CPU, latency, RAM or database capacity breach agreed limits.

Go/no-go before **provisioning**: clean reviewed SHA and green hosted CI; Docker build; Supervisor kill/restart/SIGTERM; real 2 GB/one-CPU traffic and image job test; small-Postgres connection, query/claim latency and table-growth test; duplicate-scheduler handover test; real private R2 and Resend verification; backups/restore and owner-approved production content/tax/delivery/policy. See the authoritative [deployment runbook](render-production.md) and [Phase 3O report](../development/phase-3o-report.md). No missing measurement is to be marked PASS.
