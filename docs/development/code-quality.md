# Code quality and CI

Backend: Laravel Pint; Larastan level 8 with PHPStan 2.2; direct PHPUnit 13. Frontend: strict TypeScript, Next ESLint flat configuration, Prettier 3, Vitest. No suppress-all baseline, ignore-platform-reqs, npm --force or legacy-peer-deps workaround is used.

```sh
cd backend
composer validate --strict
composer lint
composer analyse
composer test
composer audit
# Intentional formatting changes:
composer format
```
```sh
cd frontend
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit
# Intentional formatting changes:
npm run format
```

Root shortcut: `sh scripts/check-foundation.sh`. It runs code checks; set IRANTI_INFRA_TESTS=1 for the required isolated integration gate and run audits separately. A skipped integration suite is not evidence of connectivity.

Composer lock and npm lock fix resolved versions; reviewed patch updates require tests and audits. Composer's narrow patch ranges allow maintenance without changing approved majors. No breaking audit fix is automatic.

[GitHub Actions workflow](../../.github/workflows/foundation.yml) installs locked dependencies, runs backend formatting/static/tests/audit with real PostgreSQL/Redis services, and frontend format/lint/types/tests/build/audit. Actions are pinned to verified immutable commits. The approved ESLint 9.39.5 exception emits a CI warning and checks the exact installed version. It does not fail CI for EOL alone. ADR-010 requires weekly advisory/official compatibility review, review on each listed upstream trigger, and review before production. npm audit remains blocking for any reported vulnerability; it does not eliminate EOL risk. No lint rules are removed.

The workflow has no deployment credentials or production deployment steps. CI database credentials derive from the ephemeral run identity and never represent a real service credential. Branch protection and remote-run results are NOT VERIFIED: no remote repository has been configured/pushed. Workflow syntax is checked locally using official actionlint; shellcheck/pyflakes are disabled in that invocation because they were not installed, not claimed tested.

No secrets are committed. Application exception reporting records class/request ID without raw request bodies/messages; future business logging needs continued review. Dependency audits check known advisories, not an assurance of complete security.
