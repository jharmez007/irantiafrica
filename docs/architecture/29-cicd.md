# 29 — CI/CD design
Trace: NFR08/11/12. Architecture only; no workflow has been installed.

Pull request checks: lockfile/manifest validation and supported runtime matrix → formatting → static checks → unit/feature/integration tests → browser tests/production build → security/artifact checks. Required statuses block merge; repository branch protection and reviewers defined during foundation.

Backend: Composer validation/install from lock in clean environment, dependency audit, Pint check, Larastan/PHPStan agreed strictness with no silent expanding baseline, PHPUnit suite using PostgreSQL for transactional tests. Frontend: immutable package install, explicit ESLint, strict TypeScript, Vitest/client tests, Next production build and Playwright against built app. Verify no secret/public-env leakage. Avoid SQLite substitution for lock/constraint tests.

Security: dependency/vulnerability and secret scan, container scan, pinned third-party CI actions/runner image, minimal token permissions, no untrusted PR access to production secrets, dependency provenance/SBOM where tooling supports. High/critical findings follow documented risk gate. Upload only scrubbed test artifacts; retention scoped.

Promotion: build immutable backend/frontend artifacts once → deploy staging API/worker/Next/config → execute safe migrations and readiness checks → integration/E2E/security smoke → business UAT approval → explicit production release authorization. Deployment identities cannot casually administer backups or business refunds.

Migration design for future Phase 3: expand/contract, backward-compatible additive changes first; review table locks/index creation and data backfill duration; test on representative restored/anonymized volume. Run migration once under deployment lock, before dependent code according to compatibility plan. Never run uncontrolled migrations from every app replica. Take/verify recoverable backup before risky changes. No production migrations are created now.

Rollback distinguishes code and data: revert image only if old code supports current schema; disable risky capability if needed. Do not reverse a destructive migration automatically or erase live orders. If data corruption occurred, use incident/recovery process and reconcile provider effects. Stop/drain/restart workers with compatible serialized job payload versions; old/new code must coexist during deployment. Scheduler leader prevents duplicate orchestration but all jobs remain idempotent.

Release evidence: commit/artifact digest, dependency versions, checks, schema compatibility, staging/UAT approval, configuration diffs, backup status, operator and rollback plan. Post-deploy monitor payments, stock, queue and errors; verify synthetic safe journey. Production release is not authorized by Phase 2 approval alone.
