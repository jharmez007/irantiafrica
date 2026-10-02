# PHASE 3N CATALOG WORKFLOW REMEDIATION REPORT

Version 1.0 — implementation 2026-09-25; final visual verification 2026-09-27. Phase 3N UAT defect remediation only. Phase 3N remains OPEN; no Phase 3O, storefront redesign, production deployment, provider activation, package installation or commit/push.

## 1. Tax root cause

Three independent constraints prevented incomplete draft creation: the frontend required a selected tax value and disabled Save when no configured choices existed; `CatalogRequest` required tax for creation/non-null updates; PostgreSQL required a non-null code. Meanwhile `CatalogActions` accepted arbitrary strings and publication did not resolve the code against current configuration. The dropdown still appended raw codes and displayed unmatched legacy references.

## 2. Draft saving

Only product name is required to create a draft; omitted type defaults to simple. Description/categories/variants/price/media/tax can remain incomplete. Optional supplied tax values must resolve a current configured treatment. Unresolved null is valid for drafts. Existing unmatched values can be retained while editing other draft fields, but block publication. Empty/missing configuration does not disable Save or break draft reads.

Migration `2026_09_25_000015_allow_unresolved_draft_tax` drops the NOT NULL constraint only. Verified by the full test suite and applied to the guarded local `iranti_local:5432` database. No existing records were rewritten. Production was not touched. Deployment requires this migration before the new application accepts unresolved drafts. Its down migration intentionally fails while nulls exist; do not invent values to force rollback.

## 3. Final tax UX decision

FR-TAX-001 and A04 leave real taxable products/exemptions/rates as client/accounting configuration. There is no evidence that all V1 products necessarily share one treatment, so a global tax assumption is not introduced. The existing immutable owner-published configuration remains authoritative:

- One current product rule: automatic default on save for new/unassigned products; no normal selector.
- Multiple rules: optional **Tax treatment** dropdown with business labels, not internal codes.
- No current rule: clear non-blocking draft guidance; no assumed rate or zero-tax fallback.
- Existing mismatched code: “Previous treatment needs review,” preserved until explicitly corrected. No silent reassignment of an existing differing treatment.

The API returns identifiers for machine selection; normal user-facing text does not expose them. Arbitrary new strings such as “cheap” fail domain validation. No new configuration screen or production tariff was invented. [Tax guide](tax.md) records the decision and operational responsibilities.

## 4. Publication requirements

Backend readiness and publication require a current configured tax treatment, nonblank description, at least one active category, ready image, a complete active SKU/price and valid option selections. Published-product edits retain these guards. A simple product needs exactly one active simple variant. Stock remains an availability constraint rather than a publication prerequisite. Readiness guidance does not block draft editing/saving.

Catalog commands take the shared configuration lock before catalog/product locks, consistent with checkout order. Final validation occurs inside the transaction. Checkout independently retains current-rule validation, exact tax calculations and fail-closed behavior. Historical checkout/order snapshots are not rewritten.

## 5. Product row actions

The required Product / SKU or variants / Category / Price / Available / Status / Updated / Actions columns remain. Edit is the primary dedicated action. The labelled ellipsis disclosure contains no duplicate Edit: draft Publish when ready and Archive; published View storefront and Archive; archived Restore. Native keyboard disclosure activation and Escape focus return are retained.

## 6. Archive/restore lifecycle

`POST /api/v1/admin/products/{id}/restore` uses existing session/MFA/CSRF and `catalog.publish_archive` authorization. An archived product returns only to Draft, clears its archive timestamp, increments content version and records `catalog.product_restored` transactionally. Prior publication timestamp, product/media/category/variant data, reserved SKU uniqueness, stock balances, inventory ledger and history remain. No hard deletion or automatic republish occurs. Stale/repeated/out-of-state requests conflict; unauthorized staff remain denied. Confirmation is available from the list and editor.

## 7–8. Identity routing and account purpose

Customer login → `/account`. Owner, Order Processing and Inventory/Store Staff login → `/admin` once authenticated. Enrollment/challenge → `/mfa`, then `/admin`; first-enrollment recovery codes are shown and must be acknowledged. Backend identity and authorization remain authoritative; no backend redirect contract changed.

`/account` remains the customer overview and existing customer-order access; saved-address/checkout functionality is preserved. Staff visiting the account overview are redirected to administration. The admin utility menu now provides `/admin/account` for existing read-only name/email details and `/mfa` for security. No role editing, MFA bypass or new account capability was added.

## 9–10. Regression results

- Full backend with PostgreSQL/Redis enabled: **209 tests / 5,235 assertions; 208 passed, one intentional opt-in performance/restore skip; no failures**.
- Catalog regressions cover name-only and missing-configuration drafts, arbitrary-code rejection, missing-tax publication rejection, configured publication success, sole-rule default, archive/restore, stale/wrong-state/unauthorized requests, retained stock/ledger/audit and public invisibility. Existing checkout, order, payment and concurrency tests passed.
- Frontend: **203 tests / 21 files passed**. Draft save with no choices, friendly multiple choices, automatic sole choice, restore confirmation/API refresh, separate Edit, all staff roles, customer account, MFA completion and recovery-code acknowledgement covered.
- ESLint, supported-source Prettier formatting, TypeScript, Webpack production build: PASS.
- Pint: PASS. Larastan level 8: PASS. Composer locked audit and npm audit: zero vulnerabilities.
- No dependency/lockfile changes. Existing uncommitted work from earlier UAT remediation was preserved.

Commands from application directories:

```sh
# backend, isolated testing configuration only
IRANTI_INFRA_TESTS=1 LOG_CHANNEL=null /opt/homebrew/bin/php vendor/bin/phpunit
/opt/homebrew/bin/php vendor/bin/pint --test
/opt/homebrew/bin/php vendor/bin/phpstan analyse --memory-limit=512M
/opt/homebrew/bin/php /opt/homebrew/bin/composer audit --locked
# frontend
npm run lint
npx prettier --check '**/*.{ts,tsx,js,mjs,cjs,json,css,md,yml,yaml}'
npm run typecheck
npm test
npm run build -- --webpack
npm audit
```

The source/configuration formatting glob avoids the previously documented macOS PNG-read failure in the broad scan; all supported source/configuration files were checked. Browser fixtures use isolated `iranti_test:54320`, a QA API/frontend/Chrome and synthetic data. External email/payment calls are mocked; no real customer/account/catalog fixture was added to `iranti_local`.

## 11. Accessibility and responsive review

**PASS:** Products, Add Product, Edit Product and Staff Account at **320, 375, 768, 1024 and 1440px**: twenty authenticated, loaded route/viewport checks, no full-page horizontal overflow and no detected axe WCAG 2 A/AA or 2.1 AA violations. Tables retain controlled internal scrolling. Screenshot review found clipped text in tiny missing-image thumbnails; an admin-only placeholder correction retained its accessible image label. Products were rechecked at all five widths after that correction, and frontend tests/build were rerun successfully.

Developer browser workflow passed owner login/MFA → `/admin`, sole configured treatment without a selector, name-only draft saving, incomplete-publication blocking, archive/restore confirmation → editable Draft, dedicated Edit outside overflow, keyboard Space activation and Escape/focus return. Representative screenshots cover all five widths, editor/readiness, staff profile and restore confirmation. [Evidence and client retest checklist](../uat/evidence/catalog-workflow/README.md).

The final recheck was temporarily interrupted by an automatic approval-review usage limit on 2026-09-25; it ran successfully after the user's resume on 2026-09-27. No failed/unexecuted check is marked PASS. Browser harness escaping errors were corrected without application changes. This is not full WCAG certification or a claim of physical-device/screen-reader testing.

## 12. Defects and remaining acceptance

ADMIN-UX-005 through ADMIN-UX-009 are fixed and developer-retested; **CLIENT RETEST PENDING**, not business-closed. See [defect register](../uat/02-defect-register.md). Earlier ADMIN-UX-004 and UAT-D001–003 also retain client acceptance gates.

Actual tax rates/treatment/labels and representative product content remain client/accounting inputs. Existing staging, Paystack TEST, actual email inbox and signed UAT acceptance gates remain open. This implementation does not claim provider certification or full WCAG compliance.

Final cleanup (2026-09-27): isolated QA API (8020), frontend (3030), Chrome (9227) and PostgreSQL (54320) stopped. Ordinary local services were not stopped. Evidence remains in the repository and ignored runtime directory; `git diff --check` and documentation link checks passed. No commit or push performed.

**PHASE 3N REMAINS OPEN. PHASE 3O HAS NOT BEGUN.**
