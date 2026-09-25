# 24 — Cache, Redis and queues
Trace: NFR02/05/06; ADR-007. PostgreSQL remains authoritative for inventory reservations, sessions, payment state, webhook inbox, idempotency and outbox. Redis materially helps transient queues, abuse limits and selective public metadata caching.

| Data / use | Key and proposed TTL | Invalidation / failure |
|---|---|---|
| Public catalog metadata | environment:catalog:v{schema}:product:{id}:{contentVersion}; 60–300s | Publish/price/media event; conservative TTL fallback; purchase always DB |
| Category navigation | environment:categories:{version}; 5min | Category publication event; DB fallback |
| Availability | Avoid cached purchase authority; optional short public display only | Stock event + no-store availability fetch; must not keep zero-stock items advertised indefinitely |
| Rate limits | environment:limit:{route}:{keyedPrincipalHash}:{window} | Natural expiry; sensitive routes DB fallback or fail closed |
| Queue transport | environment:queue:{priority} | Non-evicting Redis; durable DB outbox/inbox permits recovery |
| Personalized pages / money / order state | Not publicly cached | Private/no-store; direct authorized reads |
| Sessions / reservations / refund budgets | Not Redis authority | PostgreSQL transaction and expiry semantics |

Use separate Redis services/instances for non-evicting queues and evictable cache/rate-limit workload in production; logical DB numbers alone do not isolate memory eviction. If budget cannot support that, one non-evicting instance with bounded cache and clear capacity alarms is a reviewed fallback, not silent eviction risk. TLS/private networking, ACLs and no public port.

Queue classes: payments/refunds (high), transactional/security mail (high), media (normal), cleanup/reports (low). Jobs use IDs rather than full PII payloads. Worker timeout must be shorter than reservation/visibility retry lease; unique claim/processing leases are in DB. Bounded attempts/backoff, dead-letter visibility, operator retry reason and idempotent consumers. Scheduler/relay requeues outstanding durable work after Redis loss; consumers detect completed effects.

Do not claim atomic DB+Redis commit. Outbox is written with business transaction; relay may send twice, so consumer uniqueness is mandatory. Worker death after provider send creates an UNKNOWN external outcome to reconcile, not a blind repeated financial operation. Outbox archival waits for durable completion and approved retention. Redis backups can speed recovery but are not the recovery source for commerce.

Invalidate Next/CDN metadata through authenticated internal revalidation hook if used; hooks are service-authenticated and limited to known tags. Zero-stock listing requirements favor fresh availability filtering on public queries. Measure before adding broad caching or queueing inexpensive synchronous reads.
