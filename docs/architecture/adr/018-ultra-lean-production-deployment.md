# ADR-018 — Ultra-lean production deployment

Date: 2026-10-04. Status: **approved topology; implementation and verification in progress**. Phase 3O remains open. This record amends the production deployment choice in ADR-007/009 for the budget-constrained first release; it does not rewrite their historical decisions.

## Decision

Run one Render `1c-2g` Docker web service (Nginx, PHP-FPM, Next.js standalone, one Laravel database queue worker and `schedule:work`) and one managed PostgreSQL 18 database. Use PostgreSQL for commerce, encrypted sessions, queue jobs/failed jobs, cache/locks and rate limits. Keep private S3-compatible media, transactional SMTP and Paystack external. Do not provision Redis, a Render worker or a Render cron service. Native local development continues to use its existing Redis queue/cache.

The business owner approved this topology to reduce fixed monthly cost. The application retains named queues and transactional outbox/webhook inbox. One worker processes `identity,default,transactional,media` in that order, with `--sleep=3`, a 90-second reservation lease and a 60-second timeout. Queue delivery is at least once; state transitions, provider effects and notifications still require the existing idempotency/fencing controls. Scheduler events use database-backed `onOneServer()` locks; long-running events also use `withoutOverlapping()`, including during Render's old/new container overlap.

## Consequences and gates

The shared web service has one CPU and 2 GB RAM budget, and PostgreSQL carries additional queue/cache/session load. A failing web container also pauses worker and scheduler until Supervisor/Render recovers. The initial PHP-FPM limit is two children; the media worker is single-threaded. Measure memory, CPU, HTTP latency, queue age, active DB connections, database CPU and table growth before provisioning/launch. Health HTTP alone does not prove worker/scheduler health; inspect Supervisor and overdue work. `app:readiness` checks PostgreSQL, queue storage and database cache privately. PostgreSQL backups, restore tests, process restart and deployment handover tests are mandatory.

Scale out when sustained queue age exceeds the notification/payment SLO, media jobs block priority work, memory approaches the 2 GB ceiling, CPU saturation raises storefront latency, database connection/CPU/cache growth approaches plan limits, or one-container downtime becomes unacceptable. First move the queue worker to its own service; then consider Redis for queue/cache and a larger PostgreSQL tier based on measured load. Scale only after migration and failure-mode review, not by changing environment flags alone.

Render's private PostgreSQL URL uses TLS `require` in this specific Render profile. It provides encryption without hostname verification; this is an explicit accepted provider-network tradeoff, not a general relaxation of the existing `verify-full` profile. Keep the database private, restrict public ingress and verify the actual connection in Render. No Render resource is provisioned by this ADR.
