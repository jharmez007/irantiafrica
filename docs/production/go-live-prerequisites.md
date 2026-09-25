# Go-live prerequisites

Phase 3M prepares evidence; it does not deploy or start Phase 3N. The authoritative open list is [production-gates.md](production-gates.md). Approval of an implementation phase does not close external-provider or operational gates.

Before UAT: name approvers/operators; connect repository and execute hosted CI; provision isolated HTTPS staging with production-like PostgreSQL/Redis/storage/workers/scheduler; validate origins/cookies/proxies/CSP; load approved synthetic scenarios; obtain Paystack test and restricted email provider access. Test guest/account purchases, exact payment verification, retry/late/extra payment, fulfilment, same-day return, owner refund, notifications and reports. Keep outgoing live effects disabled.

Before production: complete merchant/live/refund/email validation, tax/rates/policy/content/legal approval, domain/TLS/emailDNS, least-privilege identities, secret custody, backup/PITR/media restore, alerts and incident rota. Measure representative concurrent load/network UX and rehearse migration/rollback. Record the actual artifact and deployment plan; request explicit release authorization only after that concrete package is complete.

Open quantitative targets remain engineering recommendations. Local restore timings and local API latencies are not RPO/RTO or performance guarantees. Do not promote development fixtures, synthetic accounts, test keys, rate-limit overrides or QA routers to staging/production. `.runtime` is ignored and contains test evidence only.
