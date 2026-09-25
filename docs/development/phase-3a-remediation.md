> **Historical record — superseded by the [Phase 3A final approval report](phase-3a-final-approval-report.md), remediation v1.1 dated 2026-09-20.** FND-001 is resolved by ADR-011; FND-003 is an approved temporary exception under ADR-010. Earlier blocking statements below describe prior runs and are not current status.

# PHASE 3A REMEDIATION REPORT

Date: 2026-09-20. Scope: the user's conditional Phase 3A remediation authorization only. **STOP CONDITION REACHED:** ESLint 10 cannot resolve cleanly with the current stable Next.js ESLint plugin set. The user explicitly required reporting the exact conflict and stopping. No application dependency, lockfile, configuration, migration or CI workflow was changed. Only directly related decision/report documentation was updated; no Phase 1 changes and no Phase 3B work.

## 1–4. ESLint and frontend compatibility
- Before: **9.39.5** installed.
- After: **9.39.5 unchanged**; not an accepted supported baseline.
- Approved replacement major: **ESLint 10.x**. Latest stable candidate verified in npm: **10.11.0**. Approved direction does not mean installed/validated.
- Existing Next/React/TypeScript: 16.3.5 / 19.3.0 / 6.0.2. Latest stable eslint-config-next remains 16.3.5.
- No newest mutually compatible ESLint 10 combination exists within the current stable Next config dependency graph observed in npm. No downgrade, force, legacy-peer-deps, override, plugin removal or replacement workaround was used.

| Component / latest stable examined | ESLint peer requirement | 10.11.0 accepted? |
|---|---|---|
| eslint-config-next 16.3.5 | >=9.0.0 | Yes |
| typescript-eslint 8.70.0 and parser/plugin | ^8.57.0 or ^9.0.0 or ^10.0.0 | Yes; TypeScript >=4.8.4 <6.1.0 includes 6.0.2 |
| eslint-plugin-react-hooks 7.1.1 | Includes ^10.0.0 | Yes |
| eslint-plugin-import 2.32.0 | ^2 or ^3 or ^4 or ^5 or ^6 or ^7.2.0 or ^8 or ^9 | **No** |
| eslint-plugin-jsx-a11y 6.10.2 | ^3 or ^4 or ^5 or ^6 or ^7 or ^8 or ^9 | **No** |
| eslint-plugin-react 7.37.5 | ^3 or ^4 or ^5 or ^6 or ^7 or ^8 or ^9.7 | **No** |

Next config directly requires import ^2.32.0, jsx-a11y ^6.10.0 and react ^7.37.0. Its broad top-level peer range does not override their narrower ranges. The resolver's first failure traverses eslint-import-resolver-typescript 3.10.1 to eslint-plugin-import 2.32.0 and demands the conflicting ESLint 9.39.5 peer.

Other inspected components: @next/eslint-plugin-next 16.3.5, import resolver node 0.3.10, TypeScript resolver 3.10.1, @eslint-community utilities, standalone Prettier 3.9.8, Vitest 5.0.1/Vite 8.3.0 and Node 24.14.0. Node satisfies ESLint 10's >=24 runtime branch. Prettier is separate from ESLint, with no formatter bridge plugin. Existing eslint.config.mjs is flat configuration, not deprecated .eslintrc. Ignore patterns remain unchanged but have **not** been validated under ESLint 10 because that version could not be accepted/installed.

### Executed evidence
1. Inspected package.json, package-lock.json, installed plugin manifests, ESLint config and Git status.
2. Queried npm version/peerDependencies/engines for ESLint, Next config, all three blocking plugins, hooks and TypeScript ESLint.
3. Copied only the frontend manifest to an isolated /tmp directory, substituting eslint=10.11.0 there.
4. Executed **npm install --dry-run --ignore-scripts --strict-peer-deps --no-audit --no-fund** in that scratch directory. **FAIL, exit 1, ERESOLVE.** No project install or lockfile write.
5. Evaluated each installed/latest plugin range with semver.satisfies: false for the three blocking plugins; true for Next config, TypeScript ESLint and hooks.

Primary evidence: [ESLint lifecycle](https://eslint.org/version-support/), [Next config registry metadata](https://registry.npmjs.org/eslint-config-next/16.3.5), [import plugin](https://registry.npmjs.org/eslint-plugin-import/2.32.0), [JSX accessibility plugin](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2), [React plugin](https://registry.npmjs.org/eslint-plugin-react/7.37.5), plus actual npm resolver output. Registry “latest” tags were queried rather than assuming the installed graph was current.

## 5. ADR/documentation changes
[ADR-010](../architecture/adr/010-eslint-10-remediation.md) records original ESLint 9 selection, EOL event, approved ESLint 10 replacement direction, candidate, incompatible peers and stopped implementation. Stack document 01 retains original selection as SUPERSEDED and distinguishes the approved target from installed version. Root README, issue register and phase-3a-report link this current finding. The architecture baseline is not declared invalid.

## 6–8. Identity/session findings and migration baseline
See the detailed [difference classification](identity-session-reconciliation.md) for A/B/C/D dispositions.

**Confirmed strategy: OPTION A**, shared users table for customers and staff with role/permission differentiation. No separate CustomerProfile is required; guest customers do not need users. PostgreSQL sessions are explicitly required by approved ADR-008; they must not be discarded or switched to Redis merely for convenience. Sanctum SPA cookie mode does not require personal_access_tokens.

Generated differences include bigint versus UUID user IDs, email/password field names and widths, normalized-email uniqueness, missing account status/auth-version/MFA fields, timestamps/timezone/defaults, remember-token storage, email-keyed reset records versus UUID/user-linked digest/expiry/consumption records, session string PK versus UUID row ID plus session_id, session user FK/type, metadata names/lengths and activity type/check. Default model getters/casts/factory and session/reset repository queries also assume generated columns. Both designs omit soft deletion; shared identity/profile decisions are unambiguous.

**No identity deviation is silently approved.** Generated examples remain archived. Adapter-versus-explicit-physical-schema amendment remains a documented decision before finalization; the default repositories cannot be used unchanged with the approved column contract. Implementation stopped before that work due to the user's ESLint conflict condition. Only the previously existing failed_jobs executable migration remains; no new framework/identity migrations were finalized.

## 9–12. Regression, audits and CI status
| Gate requested | This remediation result |
|---|---|
| Strict ESLint 10 resolution | **FAIL — ERESOLVE** |
| ESLint 10 installed-version check | **NOT VERIFIED — no installation** |
| ESLint 10 lint/ignore behavior | **NOT VERIFIED — incompatible dependency graph** |
| Formatting / TypeScript / Vitest / production build | **NOT RUN in this remediation after explicit stop** |
| Application boot / migrations / rollback / backend tests | **NOT RUN in this remediation; schema unchanged** |
| Pint / Larastan / Composer validation | **NOT RUN in this remediation after explicit stop** |
| Composer/npm dependency audits | **NOT RUN in this remediation; no fresh clean-audit claim** |
| PostgreSQL / Redis / queue / frontend-backend communication | **NOT RUN in this remediation; no services started** |
| CI workflow revision/syntax rerun | **NOT RUN — workflow unchanged; existing compatibility rejection remains** |
| Hosted GitHub Actions | **HOSTED CI NOT VERIFIED — no remote/hosted run** |
| Documentation links and Phase 1 fingerprints | Checked locally after documentation updates |

Previous Phase 3A test/build/audit successes remain historical evidence in [the original report](phase-3a-report.md), not a passing remediation gate. No skipped, failed or unexecuted command is reported PASS.

## 13–14. Remaining blockers and readiness
1. A supported, mutually compatible ESLint 10/Next plugin graph is unavailable in the inspected current stable set. Continue only when compatible stable releases exist or a separately reviewed supported lint-configuration change is authorized. Do not approve overrides merely to silence peer errors.
2. Identity/session/reset repository mapping and ordered migration baseline remain unfinished. Shared identity and PostgreSQL session strategy themselves are confirmed, not reopened.
3. Full Phase 3A regression/CI validation must run after actual remediation.

Phase 3B remains unauthorized and not ready to begin. This turn ends at the user-specified conflict boundary.

**PHASE 3A NOT READY FOR APPROVAL**
