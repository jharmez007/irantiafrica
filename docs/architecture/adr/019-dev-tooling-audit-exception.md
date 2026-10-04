# ADR-019 — Narrow dev-tooling audit exception for braces

Status: temporary exception, reviewed 2026-10-04. Owner: technical lead/security owner. Recheck on each dependency update, weekly during active development, and before production approval.

The locked frontend dependency graph has five HIGH `npm audit` findings, all caused by [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) in `braces@3.0.3`: `braces → micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next`. The advisory lists no patched version. npm's proposed `eslint-config-next@14` downgrade is incompatible with the Next.js 16 baseline. No force install, peer bypass, lint removal or speculative override is approved.

All five locked package entries are development-only. `npm audit --omit=dev` reports zero production advisories. The Next standalone output was checked for each affected package and none was present; the final Docker stage copies standalone output, static assets and production Composer dependencies, not frontend development `node_modules`. The Docker image inspection must reconfirm this before release.

CI runs the production audit as a **blocking gate**. It also runs a full audit through `scripts/check-frontend-audit.mjs`, which permits only the exact five-node development chain and advisory above. A new advisory, altered chain, production classification, missing/incomplete audit response, or changed severity/count fails CI. Lint remains mandatory. This is a recorded exception to the known development-tool finding, not a general suppression of audit results or a production release approval.

The exception expires when a compatible patched upstream release is available, the package reaches runtime, the chain changes, or a fresh production risk review rejects it. Production dependency vulnerabilities block deployment. The separate ESLint 9 EOL compatibility decision remains [ADR-010](010-eslint-10-remediation.md).
