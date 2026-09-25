# Observability and health

Laravel JSON stderr includes generated request_id, safe route template, method, status and duration_ms. Domain logs carry internal order/attempt/refund/notification identifiers and safe outcome codes, never raw request/provider bodies. Route templates avoid leaking path capabilities and query strings. API responses return X-Request-ID. Queue start/finish/exception events include job ID/type/queue and safe exception class only; queue work also has domain identifiers; HTTP request context does not magically follow every async job. Cross-service tracing is not claimed.

Public `GET /api/v1/health`: process liveness only; no credentials/dependency detail. Private `php artisan app:readiness`: PostgreSQL SELECT1 and queue/cache Redis PING, nonzero on failure, no endpoints/exception messages disclosed. Production boot validates required guard settings. Execute through private supervisor/monitoring command, not a public endpoint. Storage/provider configuration and functional probes remain separate deployment checks; SMTP/Paystack outages must not restart healthy HTTP processes continuously.

Recommended small-platform monitoring: external HTTPS probe, structured log collector, managed DB/Redis metrics, queue-depth/oldest-job/failed-job inspection, one scheduler heartbeat, backup job and restore evidence. Select tooling after hosting decision; no mandatory enterprise vendor.

| Condition | Proposed alert / response |
|---|---|
| Site/readiness unavailable | Two consecutive minute checks → incident operator; confirm dependency vs app fault |
| API errors/latency | Sustained five-minute baseline deviation, record route/status/duration; investigate saturation/query plan |
| Queue/scheduler stalled | Oldest ready job >5 min or no scheduler heartbeat >3 min; check worker processes/Redis; no blanket retries |
| Payment/refund unknown or reconciliation failure | New unknown/review state or repeated check failure → owner + technical operator; preserve evidence; never manufacture success or resend refund |
| Transactional mail failure | Sustained new FAILED/UNKNOWN or oldest pending >5 min → operator; owner can see aggregate dashboard status; verify provider outcome before resend |
| DB/Redis/storage | Capacity, disk, connection saturation; queue eviction must stay0; collector/backup failures actionable |
| Backup/restore | Missed scheduled backup, retention drift or failed drill → recovery custodian |

All thresholds are ENGINEERING RECOMMENDATIONS pending baseline/coverage approval, not an SLA. Name primary/backup incident operators, coverage hours and escalation channels before launch. Alerts themselves require a staging delivery test. Owner dashboard provides operational state; detailed failed-job/infrastructure diagnosis remains a technical-operator responsibility.
