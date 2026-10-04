# Go-live prerequisites

> Phase 3O amendment, 2026-10-04: the business owner approved one Render web service plus PostgreSQL, database queue/cache/sessions and protected production pre-launch in place of a separate staging environment. Use the [current launch runbook](launch-runbook.md) and [environment checklist](production-environment-checklist.md) for deployment gates. No Render provisioning or public launch has occurred.

Phase 3M prepares evidence; it does not deploy or start Phase 3N. The authoritative open list is [production-gates.md](production-gates.md). Approval of an implementation phase does not close external-provider or operational gates.

Before protected external-provider UAT: name approvers/operators; connect repository and execute hosted CI; verify the Docker/Supervisor/database-backed profile at the approved resource limits; then, only after separate provisioning authorization, deploy the gated Render web + private PostgreSQL, R2 and Resend. Validate origins/cookies/CSP and backups. Obtain Paystack TEST and restricted email provider access. Test guest/account purchases, exact payment verification, retry/late/extra payment, fulfilment, same-day return, owner refund, notifications and reports. Keep outgoing LIVE effects disabled.

Before production: complete merchant/live/refund/email validation, tax/rates/policy/content/legal approval, domain/TLS/emailDNS, least-privilege identities, secret custody, backup/PITR/media restore, alerts and incident rota. Measure representative concurrent load/network UX and rehearse migration/rollback. Record the actual artifact and deployment plan; request explicit release authorization only after that concrete package is complete.

Open quantitative targets remain engineering recommendations. Local restore timings and local API latencies are not RPO/RTO or performance guarantees. Do not promote development fixtures, synthetic accounts, rate-limit overrides or QA routers to production. Paystack TEST keys are permitted only for the owner-approved protected pre-launch UAT; they must not be confused with LIVE keys. `.runtime` is ignored and contains test evidence only.
