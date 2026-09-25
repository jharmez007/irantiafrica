# ADR-010 — ESLint compatibility exception
Date: 2026-09-20
Status: **TEMPORARY EXCEPTION / DEFERRED MIGRATION**

## Decision and authority
The client explicitly authorizes temporarily retaining **ESLint 9.39.5** after strict resolution of ESLint 10 failed. The architecture target remains **ESLint 10.x**. This supersedes the earlier remediation stop condition and removes EOL alone as an acceptance blocker. It does not authorize Phase 3B.

## Compatibility evidence
The stable baseline eslint-config-next 16.3.5 accepts ESLint >=9 but brings plugins whose published peer ranges exclude 10:

| Package | Version | ESLint peer range |
|---|---|---|
| eslint-plugin-import | 2.32.0 | ^2 \|\| ^3 \|\| ^4 \|\| ^5 \|\| ^6 \|\| ^7.2.0 \|\| ^8 \|\| ^9 |
| eslint-plugin-react | 7.37.5 | ^3 \|\| ^4 \|\| ^5 \|\| ^6 \|\| ^7 \|\| ^8 \|\| ^9.7 |
| eslint-plugin-jsx-a11y | 6.10.2 | ^3 \|\| ^4 \|\| ^5 \|\| ^6 \|\| ^7 \|\| ^8 \|\| ^9 |

The previous isolated strict ESLint 10.11.0 resolver probe failed ERESOLVE on import's peer requirement. typescript-eslint 8.70.0 and eslint-plugin-react-hooks 7.1.1 already advertise 10 support; they do not resolve the other incompatibilities. No force, legacy-peer-deps, arbitrary overrides, preview forks, experimental replacements or removed lint coverage are allowed.

## RISK-ESLINT-001
ESLint 9 reached EOL on 2026-08-06 and no longer receives normal upstream maintenance: [official support policy](https://eslint.org/version-support/). Accepted residual maintenance/security risk is limited to frontend development linting. A clean npm audit does **not** eliminate EOL or undisclosed vulnerability risk.

Mitigations: exact 9.39.5 direct pin; exact transitive versions in committed package-lock.json; npm ci with strict peers; npm audit in CI; developer review of upstream security advisories; no expansion beyond frontend linting; no incompatible unreviewed plugins. TypeScript strict mode, independent tests/types/build and existing React/accessibility rules remain enabled. The developer owns review; the client owns acceptance of any continued production exception.

## Mandatory upgrade gate
Reopen this ADR automatically at the **first** of:
1. Official ESLint 10 support published by eslint-plugin-import.
2. Official ESLint 10 support published by eslint-plugin-react.
3. Official ESLint 10 support published by eslint-plugin-jsx-a11y.
4. eslint-config-next changes to a compatible supported plugin set.
5. Next.js publishes an officially supported ESLint 10 migration path.
6. Before production release.

These are revisit triggers individually, not a requirement to wait for all three plugins. Review official npm package peer metadata and official Next.js/ESLint release notes at each dependency update, weekly during active development, and before production. Record the review date and result in this ADR. Once the graph supports migration, resolve with strict peers and rerun every frontend gate before updating the baseline. If still incompatible at production review, production approval requires a fresh explicit risk decision; this exception cannot silently roll over. No speculative monitoring package is installed.

Last review: 2026-09-20; next scheduled review: 2026-09-27, or an earlier trigger. Owner: project developer/technical lead. This is a documented engineering/release gate, not an assertion that an external release watcher is deployed.

## CI policy
Warn about this approved exception without an EOL-only failure. Pin check, install, lint, formatting, type checks, tests, build and audit remain blocking. The security gate is npm audit's default nonzero exit for reported vulnerabilities (all severities); no advisory suppression is introduced. Hosted execution remains unverified until a remote exists.
