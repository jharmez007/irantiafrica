> **Historical record — superseded by the [Phase 3A final approval report](phase-3a-final-approval-report.md), remediation v1.1 dated 2026-09-20.** FND-001 is resolved by ADR-011; FND-003 is an approved temporary exception under ADR-010. Earlier blocking statements below describe prior runs and are not current status.

# Phase 3A implementation decisions and issues

The user approved architecture baseline **v1.0, 2026-09-20** and authorized Phase 3A only. Historical v0.1/proposed labels in the approved architecture files are preserved; this approval record supersedes them. Requirements and architecture decisions are not silently rewritten.

## FND-001 — Framework migrations versus the logical identity schema

Recorded before changing scaffold migrations. Laravel's generated users table uses a bigint identity and its session handler expects a string primary session ID. The approved logical design specifies UUID users and a UUID row ID plus separate session_id. Running the default users migration would prematurely introduce a conflicting identity schema.

Disposition: do not implement identity tables or full authentication in Phase 3A. Retain the official generated migration examples outside the executable migrations directory for Phase 3B review. Execute only the framework failed_jobs infrastructure migration now. Configure PostgreSQL sessions, but defer session-backed authentication/CSRF route enablement and identity/session schema to Phase 3B. Health remains stateless. Phase 3B must resolve the session-handler/schema mapping through an ADR before implementing it; no silent string-ID substitution is made here. No business scope change.

## FND-002 — Host prerequisites

Initial shell PHP is Herd 8.4.1; approved PHP 8.5.8 exists at /opt/homebrew/bin/php. Use the latter explicitly without changing global shell configuration. Node 24.14.0/npm 11.9.0 and Composer 2.10.2 are available. Docker, PostgreSQL server and Redis server were not found. Container service validation requires a working Docker Compose engine or equivalent approved local services. Missing tools are verification limitations, not stack substitutions.

## Compatibility policy

Candidate versions must resolve against official registries before being described as installed or locked. PHPUnit 13 is supported by Laravel framework's development constraints; the starter's PHPUnit 12 preference does not by itself prove incompatibility. Use direct PHPUnit without adding Collision/Pest merely for a wrapper. Predis 3 is Laravel-supported and avoids requiring a separately installed PHP Redis extension. No planned runtime major is replaced.

## FND-003 — COMPATIBILITY DEVIATION: ESLint 9 support

**OPEN; blocks Phase 3A acceptance.** Planned: ESLint 9.x. npm resolved 9.39.5 with an unsupported-version warning. The official [ESLint support policy](https://eslint.org/version-support/) confirms EOL on 2026-08-06; current supported major is 10.x. The Phase 2 recommendation was stale and does not satisfy its own supported-tooling criterion.

Proposed compatible direction: ESLint 10.x, subject to resolving the complete Next/TypeScript/plugin peer graph and rerunning lint. This is a development-only dependency change, not a runtime or business scope change. Exact compatible patch remains to verify; Next's >=9 peer floor alone is insufficient proof for every plugin. A tooling ADR amendment/implementation decision approval is required before changing the approved major. No automatic breaking upgrade has been applied. The installed 9.39.5 lock is provisional evidence, not an accepted supported baseline. A successful lint run would not close this lifecycle issue. Other foundation work may continue; Phase 3A remains NOT READY until this is resolved.

## Conditional remediation update — 2026-09-20
The user has now approved the ESLint 10 compatibility deviation, so replacement-major approval is no longer missing. FND-003 remains OPEN because the latest stable Next plugin graph excludes ESLint 10 and the strict isolated resolver returned ERESOLVE. Per the explicit instruction to stop on this conflict, dependencies, migrations and CI were left unchanged. [ADR-010](../architecture/adr/010-eslint-10-remediation.md) records the approved direction; [remediation report](phase-3a-remediation.md) records this attempt. FND-001 remains unfinished; the [identity/session review](identity-session-reconciliation.md) confirms shared users, no separate CustomerProfile and required PostgreSQL sessions, with remaining adapter/schema differences classified. Earlier statements requiring major-version approval are historical and superseded by this authorization.
