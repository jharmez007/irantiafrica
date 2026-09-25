# Phase 3M pre-hardening inventory — 2026-09-24

Phase 3L is formally approved. Review basis: Phase 1 scope/NFR/traceability and decisions; architecture 01–32 and ADR dispositions; Phase 3A–3L reports; current routes, configuration, queue dispatchers and deployment workflow. Historical documents describe their approval-time state; subsequent client approvals govern. No deferred scope is reopened.

| Area | Current disposition |
|---|---|
| Completed V1 | Identity/RBAC/staff MFA; catalog/variants/media/brand; single-pool inventory; persistent cart; checkout/tax/delivery; orders; Paystack adapter/webhooks/reconciliation; manual fulfilment/tracking; returns/refunds; transactional notifications; basic operational dashboard/reports |
| External dependencies | Merchant test/live channels/refunds, transactional sender/deliverability, hosting/PostgreSQL/Redis/object storage, carrier operational process |
| Configuration decisions | Actual tax/rates/coverage, return/refund activation policy, domains/DNS/TLS/sender, retention, launch content, hosting budget, incident/recovery owners |
| Compatibility exception | Approved ESLint 9.39.5 EOL exception; ESLint 10 peers must be reassessed. Prior sandbox Turbopack restriction; Webpack build is the verified alternative |
| Validation gaps | Real Paystack and email outcomes; hosted CI (no remote); staging/production infrastructure; full recovery and representative-scale performance evidence |
| Security risks to examine | Production guard completeness, headers/CSP, secrets/history, proxy trust, configurable abuse limits, privilege boundaries and safe failure responses |
| Operational risks found | Launcher omits media queue despite explicit media dispatch; private readiness absent; restore/alert ownership not operationally proven |

Phase 3M changes are limited to evidenced readiness defects and verification/documentation. Production deployment and Phase 3N remain unauthorized. Quantitative performance, RPO/RTO and availability targets remain engineering recommendations.
