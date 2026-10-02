# PHASE 3N UAT & CLIENT ACCEPTANCE REPORT

## Current update — 2026-10-02: technical remediation and CI readiness

Phase 3N remains **OPEN**. The local catalogue has passed its population UAT. The current pass patched Next.js and `eslint-config-next` from 16.3.5 to 16.3.6, preserving React 19.3.0; `npm ci --strict-peer-deps` and `npm audit` pass with zero advisories. [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) requires the Node `next/og` ImageResponse path with attacker-controlled SVG; application source has no such use, but the affected lock was nevertheless patched. Laravel 13.32.0 and PHP 8.5.8 remain; its transitive `league/commonmark` was patched from 2.10.1 to 2.10.3 (required polyfill 1.37.0 to 1.43.0). No application source renders untrusted Markdown. Both [CommonMark advisories](https://github.com/advisories/GHSA-3q6v-r5mr-hxv8) ([second](https://github.com/advisories/GHSA-97jj-33gv-5xf9)) are outside the new locked version, and `composer audit --locked` is clear.

The existing persisted per-variant low-stock threshold now has an audited, permission-checked inventory service configuration path. The local-only default is five via `INVENTORY_LOW_STOCK_THRESHOLD`, with zero outside local unless explicitly configured. A guarded seed rerun set the 42 UAT thresholds to five without changing stock arithmetic, on-hand/reserved values or ledger movements. Reporting separates **32 normal**, **8 positive low stock** and **2 out of stock**; zero is no longer double-counted. Five is **DEVELOPMENT/UAT CONFIGURATION ONLY**; the production owner must approve its launch value. See [UAT-CAT-001](../uat/02-defect-register.md).

ESLint 9.39.5 remains under [ADR-010](../architecture/adr/010-eslint-10-remediation.md): a 2026-10-02 strict, no-write probe against the Next 16.3.6 plugin graph failed `ERESOLVE` because official `eslint-plugin-import@2.32.0` excludes ESLint 10. No peer override or lint-rule reduction was used. The GitHub Actions workflow now explicitly migrates the test DB before the full backend suite. The repository origin is `https://github.com/jharmez007/irantiafrica.git`, branch `main`; actual hosted runs are not inferred from local checks.

Local regression: clean Composer and npm lock installs; full backend PHPUnit **212 tests / 5,297 assertions, one intentional opt-in skip**; Pint, Larastan, strict Composer validate and locked audit passed. Frontend format, lint, TypeScript, **229 Vitest tests**, Webpack production build and npm audit passed. A concurrent sandboxed Turbopack build failed while binding an internal port; the isolated supported Webpack build passed, and TypeScript was rerun after build to avoid `.next/types` races. The catalogue remained 30 published products, 42 SKUs/balances, 30 ready images, zero reserved, 42 opening and two intentional zero-fixture adjustment movements.

Git safety review scanned 607 tracked/untracked candidate files and all 479 unique blobs across three prior commits for credential signatures and sensitive paths. No live secret or committed `.env`/runtime file was identified; matches were deliberate synthetic test-key literals and a test bootstrap `APP_KEY` setting. Existing local `.env`, runtime logs and build output are ignored. The reviewed baseline was committed as `404b2e3` and pushed to `jharmez007/irantiafrica` `main`. [Hosted GitHub Actions run 36952648163](https://github.com/jharmez007/irantiafrica/actions/runs/36952648163) completed **success** for both backend and frontend jobs, including migration, full PHPUnit, audits and production build. External credentials belong only in repository/environment secrets when staging is provisioned; none were added to workflow YAML. Client acceptance, staging and external provider UAT remain outstanding. **Do not begin Phase 3O.**

## Current update — 2026-10-02: realistic local catalogue

Phase 3N remains **OPEN**. The explicitly requested local-only [30-product UAT catalogue](../uat/05-realistic-catalog.md) was created in verified `APP_ENV=local` / PostgreSQL `iranti_local` on loopback:5432. It is representative test data and **not approved production catalogue content**. The opt-in `iranti:seed-uat-catalog` command preflights the environment, development-only tax bundle and all 30 image hashes; a read-only dry run passed. It created six active categories, 30 published products (21 simple, nine variant), 42 unique SKUs/opening balances and 30 ready images via private storage and the existing media processor. A second full invocation completed without duplicates. No migration reset, hard deletion or commerce-history manipulation occurred.

Four known pre-existing development products (`phase-3n-uat-sample-2026-09-27`, `plate`, `pot`, `spoon`) had zero order-item references and were archived through the catalog action after the new catalogue published. The old `plate` category is archived. Their records and audits remain. Public browse/search correctly shows 29 products: published Striped Floor Basket has zero stock and an informational detail page. Leather Crossbody Pouch remains browsable with Cognac available and Forest Green disabled. Six published category counts are 9/8/5/5/2/1; the Baskets public browse count is four because the fifth is unavailable. Search terms `woven`, `ceramic`, `basket`, `leather`, `candle` and `heritage` returned relevant matches. No sales/orders/payments were fabricated; the dashboard remains at zero revenue/orders.

The approved inventory service only permits a positive `OPENING` movement. For the two zero-stock fixtures, the command atomically records a +1 opening and −1 adjustment using the service, ending at zero with no reserved units. Nonzero low-stock examples retain exact requested quantities, but the current threshold is zero and has no supported configuration action; the dashboard reports only the two out-of-stock SKUs as low stock. This is [UAT-CAT-001](../uat/02-defect-register.md), left open without changing the approved inventory domain merely for seeding.

Storefront browser QA covered home, listing, Home Décor category, representative variant and zero-stock details, and search at 320/375/768/1024/1440px: no horizontal overflow; visible images loaded with cover sizing, labels and prices were readable. Category filter, ascending price sort and second-page navigation worked. The signed-in owner browser showed the populated product table, six active categories plus the archived legacy category, inventory balances and dashboard status. Media verification found 30 ready records, meaningful alt text and no missing private derivatives. Final client photography/content approval remains outstanding.

Verification: focused PostgreSQL catalog/publication/media/inventory regressions **42 tests / 995 assertions passed**; Pint and level-8 Larastan passed. Frontend lint, format, TypeScript, **229 Vitest tests**, and Webpack production build passed. `npm audit` found a critical advisory for locked Next.js 16.3.5; `composer audit --locked` found high and medium `league/commonmark` advisories. These are recorded as [UAT-DEP-001/002](../uat/02-defect-register.md); package remediation was outside the authorized catalogue-population scope. Staging/external-provider UAT and client acceptance remain pending. **Do not begin Phase 3O.**


## Current update — 2026-09-25

Phase 3N remains **OPEN**. Human administrator UAT subsequently identified publication reliability and catalog usability defects and required the missing staff-management operational UI. Authorized remediation is implemented and developer-retested; see the [admin remediation report](phase-3n-admin-ux-report.md) and [updated defect register](../uat/02-defect-register.md). Client acceptance and external gates are still pending. Optional local-only Mailpit was explicitly approved; not installed, so actual capture delivery is NOT VERIFIED. No deployment or Phase 3O work occurred.

The following 2026-09-24 preparation report is retained as a **historical snapshot**, including its then-current no-code-change/no-remote observations. The repository now has an origin remote, but hosted CI execution is still not verified here. Current implementation/verification evidence is in the linked remediation report; historical test totals below are not the latest results.

Baseline v1.0 — 2026-09-24. **Preparation complete; business and external execution blocked by unavailable inputs.** Phase 3M is formally approved. No production deployment, provider activation, application-code change, data import/reset or new business feature was performed.

## Results

| # | Topic | Current result / remaining evidence |
|---|---|---|
| 1 | Staging | **STAGING NOT AVAILABLE** to this session. No supplied target/access or staging env files. Provision isolated production-like services/HTTPS/object storage; do not use production secrets |
| 2 | Real client data | No approved representative catalog dataset identified in repository docs; only development checkout example. Existing brand assets approved. No retained data overwritten; names/facts/prices/variants/images/stock still needed |
| 3 | Catalog UAT | BLOCKED business tester/data. Case02 covers create/edit/price/variants/image/category/publish/archive/stock; restore only if supported. Prior developer browser test is supporting evidence |
| 4 | Customer UAT | NOT EXECUTED in Phase3N. Dedicated testers/accounts and approved reset-email delivery needed, including mobile |
| 5 | Staff/MFA | NOT EXECUTED by business roles. Owner, Order Processing and Inventory testers must exercise MFA/recovery/provision/reset and denied access |
| 6 | Cart/checkout | NOT EXECUTED in Phase3N. Approved merge/stock rules retained; real data and approved tax/delivery required for acceptance |
| 7 | Tax/delivery | OPEN actual categories/rates/exemptions/delivery taxability/effective dates, coverage/fees and sourcing owner. Approved arithmetic preserved; no values invented |
| 8 | Paystack initialize | NOT VERIFIED externally. Local env has no configured key; no TEST access supplied. No provider calls made |
| 9 | Card success/failure | NOT VERIFIED externally; same-order retry and once-only stock/payment acceptance pending |
| 10 | Webhook | NOT VERIFIED externally; no actual inbound delivery. **Payment production readiness cannot be approved** |
| 11 | Bank transfer | NOT VERIFIED. Chosen merchant TEST channel support unknown; do not claim unsupported without provider evidence |
| 12 | Paystack refund | NOT VERIFIED externally. Keep production refund execution disabled pending validated transport/reconciliation and approval |
| 13 | Email provider | NOT VERIFIED. Local array mail is not delivery; provider/sender/reply-to/recipient approvals missing |
| 14 | Email DNS/delivery | NOT VERIFIED. No authorized domain/provider/inbox access supplied; no DNS changes or test email sent |
| 15 | Orders/fulfilment | Business UAT NOT EXECUTED. Need real TEST payment, realistic carrier/tracking process, staff/customer observation and snapshot checks |
| 16 | Returns/refunds | Business UAT NOT EXECUTED. Approved implementation retained; actual policy version and external refund evidence needed |
| 17 | Dashboard/reporting | Business UAT NOT EXECUTED. Approved Lagos/applied-receipt/refund definitions preserved; owner reconciliation and launch threshold approval pending |
| 18 | Mobile/browser | No new Phase3N physical-device or cross-browser review. Proposed support/test policy in plan; testers/devices and recorded versions needed. Prior Chrome emulation is not physical-device acceptance |
| 19 | Accessibility | No new human Phase3N keyboard/screen-reader/zoom/contrast review. Prior automated/browser checks supporting only; closed Phase3C.5 design remains approved |
| 20 | Backup/restore | Phase3M local restore previously verified; no staging target, so staging restore **NOT VERIFIED**. No new backup/restore run |
| 21 | Monitoring/runbook | Named business/operator walkthrough and observed alert delivery pending; no monitoring target/receiver supplied |
| 22 | Hosted CI | **HOSTED CI NOT VERIFIED**. `git remote -v` returned no remotes. No repository target/access invented or configured |
| 23 | Defects | No new verified application defect found in this documentation/configuration inventory. No fixes or retests claimed. Missing inputs tracked as gates; earlier Phase3M fixes retained |
| 24 | Content/policies | Branding approved; final catalog/contact/business/shipping/privacy/terms/returns/pricing approval evidence pending. Developer drafts are not approval; no placeholders promoted to final content |
| 25 | Client sign-off | UNSIGNED. No completed Phase3N business case or accepted waiver fabricated |
| 26 | Production gates | All existing gates retained with status, role owner, classification, evidence and milestone deadline; added explicit UAT participants, coverage, thresholds, sourcing and retention gates. Named owners/calendar dates still require client assignment |
| 27 | Phase3O readiness | NOT READY. Actual provider/webhook/email, business acceptance and operational gates remain. No deployment authorized |

## Work completed and validation

Created [UAT plan](../uat/01-uat-plan.md), [defect register](../uat/02-defect-register.md), [23-case acceptance matrix](../uat/03-acceptance-matrix.md) and [unsigned sign-off](../uat/04-client-signoff.md). Updated [production gates](../production/production-gates.md), Phase3M approval disposition, backend scope instruction and README. Requirements IDs map to the existing traceability baseline, including all functional/NFR entries via execution groups or explicit scope dispositions. Historical phase approvals were not reopened.

Current checks: read-only repository/remote/env-presence and secret-safe configuration inventory; document link/requirement-ID/required-field checks. No secret values printed. No services started/stopped, packages installed, application tests rerun or production build performed in this documentation-only pass. No UAT defect remediation occurred; full final regression remains pending UAT/remediation. The prior approved Phase3M report records 200 backend tests (one intentional opt-in skip, separately run), 169 frontend tests and passing Webpack production build; these are **prior evidence, not current UAT results**.

## Required next inputs

Client/account owners: staging and repository access locations, named UAT participants, approved representative product dataset and image/rate sourcing assignments, actual tax/delivery/policy values, TEST merchant configuration via secure storage, approved email provider/sender/reply-to/test recipients, DNS authority and available physical devices. Do not send secrets in chat. Operator/developer: deploy isolated staging once access is supplied, execute cases with testers, retain sanitized evidence, fix only verified defects, rerun regression and obtain explicit sign-off. Calendar dates should be agreed before scheduling; the preferred November launch date is not a commitment.

Unavailable inputs block affected execution and acceptance, not completion of the UAT preparation above. No indefinite browser/provider retry or artificial application defect is recorded. Stop here; Phase3O and production remain unauthorized.

**PHASE 3N NOT READY FOR APPROVAL**
