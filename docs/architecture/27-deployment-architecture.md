# 27 — Production deployment recommendation
Trace: FR-OPS-001, NFR05–07; ADR-009. Current scale is 20–50 products, not a reliable traffic forecast. Compare operating models rather than quote unverified vendor prices.

| Option | Benefits | Costs / constraints | Fit |
|---|---|---|---|
| Managed VPS with managed PostgreSQL/storage | Predictable modest infrastructure, persistent processes, flexible reverse proxy | Operator owns OS/runtime patching, deployment supervision, capacity and recovery; “managed” scope varies | Acceptable budget fallback only with named competent operator |
| Managed application/container platform + managed PostgreSQL/Redis | TLS, release/process management, workers and rollback with less host maintenance | Provider must support PHP/Node, persistent workers/scheduler, private networking, exact DB versions, queue Redis and cost limits | **Recommended operating model** |
| General cloud app hosting / cloud VMs + managed services | Fine-grained networks/identity/backups, growth options | More configuration/operational burden and variable costs | Good where team already operates it; no need for Kubernetes |
| Shared hosting | Low headline cost | Often lacks persistent Node/workers/scheduler, private services and controlled deployment | Rejected unless it demonstrably meets every requirement; not the default |

Recommended topology: one region near target users with measured Nigeria latency; TLS edge/reverse proxy/CDN; one Next service; Laravel API plus separately supervised worker and one scheduler process from same image; managed PostgreSQL with PITR; non-evicting queue Redis and bounded cache service; private S3-compatible storage with public derivative CDN; transactional email and Paystack over TLS. Begin with small measured resources and vertical scaling. API/Next horizontal scaling can follow; sessions/commerce are shared DB. Managed database availability tier and redundant app replicas depend on approved uptime budget.

No fixed vendor/region/price is selected without budget/support/data-location review. Single app instance is a failure risk and cannot be claimed to satisfy 99.9% without operational evidence. Proposed availability target, RPO/RTO and on-call coverage must match purchased services. Do not promise Nov 1 regardless of onboarding/assets/testing.

Public ingress only to edge and signed webhook route. Databases/Redis internal; least-privilege service accounts, encrypted transit/rest, secret injection, immutable builds, non-root containers where supported. Domains canonicalize to one HTTPS host. DNS/SSL ownership and renewal monitoring documented. Separate staging resources; no production data copied casually.

Sizing exercise after approval: agree concurrent users/order rate/media profile, run representative load and provider-stub failures, measure CPU/memory/DB/queue. Scale based on p95 and saturation, not product count alone. No sharding, search cluster, warehouse, Kubernetes or microservice mesh.

Procurement gate: supported release lines, backups/restore test, cost forecast and alerts, worker/scheduler behavior, outbound networking, webhook reachability, deployment rollback, data region/access terms and named incident operator. If managed PostgreSQL 18 or queue Redis line unavailable, revisit ADR explicitly.
