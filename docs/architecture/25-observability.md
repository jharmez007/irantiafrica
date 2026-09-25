# 25 — Observability
Trace: FR-OPS-001, NFR06/15. Structured JSON logs with timestamp, level, service/environment/release, request ID, actor pseudonymous ID, action, opaque entity/job/event ID, duration, outcome and safe error code. Never full bodies or credentials; masking in [20](20-privacy-audit.md).

| Signal | Measurement / proposed alert | Response |
|---|---|---|
| API/Next | Request rate, p95 latency, 5xx ratio; sustained deviation from agreed targets | Inspect release/request IDs, DB/provider latency; rollback if release-induced |
| Payment | Pending/unknown age, verify failures, amount mismatch, unapplied receipts | Immediate mismatch/extra-payment alert; reconcile before manual action |
| Webhook | Signature failures, durable-ingress failures, oldest unprocessed event | Check secret rotation/DB/worker; replay authenticated inbox safely |
| Inventory | Invariant violations, lock wait/deadlock rate, expired-active age | Stop affected checkout if integrity uncertain; reconcile ledger |
| Queue/outbox | Depth, oldest age, retries/dead letters, worker heartbeat | Scale/restart workers, preserve pending work, investigate poison job |
| Email | Delivery failures/unknown outcomes/bounces | Check sender/provider; preserve order status channel |
| Infrastructure | CPU/RAM/disk/connections, DB replication/backup lag, Redis memory | Capacity/backup response; never clear durable work to hide alert |
| Security | Login abuse, permission changes, refund anomalies | Restrict affected account, preserve evidence, rotate/revoke as needed |

Recommend detection within five minutes for payment/queue/system failures, subject to Q19/Q22 coverage/budget. Alert recipient and response hours must be named before production; an unowned dashboard is not monitoring. Define severity, escalation channel, runbook, acknowledgment and recovery criteria. No unsolicited customer email on incidents.

Health endpoints: liveness only process; readiness verifies essential DB/config and ability to accept durable work, with dependency timeout bounds. Email outage should not fail API liveness/restart the application continuously. Detailed checks are private/authenticated; public health response reveals no versions/secrets. Synthetic non-payment journey and scheduled backup-restore evidence supplement metrics.

Exception tracking is an operational tooling choice with scrubbed payloads, not advanced business analytics. No vendor is selected here. Audit stream is separate, durable and restricted. OpenTelemetry-compatible trace IDs may span Next→Laravel→jobs without mandatory tracing infrastructure at launch; keep cardinality bounded and sample responsibly.
