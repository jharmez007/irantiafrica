# PHASE 3N ADMIN UX REMEDIATION REPORT

Subsequent catalog/tax/restore/identity corrections and current verification are recorded in the [catalog workflow remediation report](phase-3n-catalog-workflow-report.md).

## Current update: PHASE 3N ADMIN SHELL UX REMEDIATION REPORT

Version 1.1 — 2026-09-25. Human review rejected the remaining clustered information architecture after the prior remediation. **ADMIN-UX-004** tracks this additional UI-only pass. The report below records the current shell implementation; the earlier publication remediation is retained afterward as historical evidence. Phase 3N remains **OPEN**; no Phase 3O work or storefront redesign occurred.

### 1–15. Implementation

| # | Area | Current implementation |
|---|---|---|
| 1 | Shell | One persistent `/admin/layout.tsx` frame: sidebar, top utility bar, main content; reusable page header/content component |
| 2 | Sidebar | Overview/Commerce/Management groups, approved grants, active parent for nested routes, labelled SVG icons, compact supplied mark, collapse preference in local storage |
| 3 | Mobile drawer | Below 1024px; native modal backdrop, labelled trigger, focus containment, Escape/close and trigger-focus return |
| 4 | Top bar | Staff name/role, account/security/logout disclosure, mobile trigger; no sensitive permission actions |
| 5 | Routes | Existing list routes retained; category new/edit, return detail, reports and notification-health presentation routes added over existing APIs; no empty Settings/Fulfilment destinations |
| 6 | Products | Paginated searchable/category/status-filtered operational table, header Add Product, secondary row action disclosure; no inline create form |
| 7 | Product editor | Retained General/Pricing or Variants/Media/Inventory panels with section selection; separate sticky desktop status/readiness/last-saved/publish/archive summary; exact NGN and auto media refresh preserved |
| 8 | Categories | List table and dedicated create/edit pages, parent/status and product-list linkage; no repeated inline forms |
| 9 | Inventory | Role-specific operational table; selected record modal for existing adjustment/history; quantities remain hidden from order-processing staff |
| 10 | Orders | Filtered table and dedicated detail with summary/contact/items/payment/fulfilment/timeline/returns access. Shipment display uses supplied shipment/current order state |
| 11 | Payments | Focused table and selected history/reconciliation dialog; no provider secret/raw payload exposure or new manual paid toggle |
| 12 | Returns | Queue filtered by existing server states, separate refund status, dedicated one-record review page; existing action eligibility/versions/MFA preserved |
| 13 | Staff | List first; Add staff dialog; role/disable/MFA actions in disclosure and confirmation dialog; recent-authentication safeguards unchanged |
| 14 | Status/actions | Shared textual/symbol status badges; primary/secondary/destructive hierarchy; compact desktop controls and 44px narrow-screen controls |
| 15 | Dialogs/feedback | Native modal behavior, explicit drawer Tab wrapping, labelled confirmations, existing safe request messages and shared assertive/polite alerts; common table skeleton/empty/pagination patterns |

[Current design specification](../design/04-admin-ui.md) documents the shell, action hierarchy, tokens, role map and route structure. New styling is scoped to `.admin-frame`. Existing customer components retain their presentation; the shared order component only changes its `admin` branch. No backend file or contract was changed **in this shell pass**; the working tree also contains the previous authorized remediation changes.

Presentation limits from stable contracts: category product counts are not returned (use View products); payment list customer identity is available through the linked order; inventory identifies variants by SKU rather than unavailable option labels; staff last activity is not supplied. Refund Pending is not an existing server return-status filter: the queue shows refund status alongside the supported return-state filters. These are not silently fabricated fields or new workflow states. Fulfilment remains under each order, where approved operations already exist.

### 16–19. Current validation

- Responsive: all 60 authenticated, loaded route/width combinations passed at **320, 375, 768, 1024 and 1440px**: the ten requested pages plus Reports and Notifications. No document overflow; tables use contained horizontal scrolling. Inventory was rechecked at all five widths after the final sizing correction. Representative screenshots across all page types were visually reviewed.
- Accessibility: no detected axe WCAG 2 A/AA or 2.1 AA violations in the inspected admin regions. Browser keyboard review passed drawer focus entry, repeated Tab containment, Escape/trigger-focus return, visible focus, sidebar persistence across navigation, reduced motion, 200% CSS zoom/reflow and media containment. Forward/reverse boundary wrapping has a regression test. This does not constitute physical-device, screen-reader or full WCAG certification.
- Frontend: **192 tests / 21 files passed; ESLint, TypeScript and Webpack production build PASS**. Supported-source/configuration Prettier check PASS. The broad `npm run format:check` was attempted; a later macOS EPERM reading two PNG assets prevented completion, including an escalated retry. The equivalent supported-source/configuration glob was checked separately; no permissions or brand assets were changed to bypass that restriction.
- Backend affected authorization/API regression: **119 tests / 3,375 assertions; 118 passed, one intentional opt-in performance/restore skip; no failures**. PostgreSQL/Redis integration enabled; external providers mocked. Authorization, catalog/publication, staff MFA, stock, orders, payments, fulfilment, returns and reporting regressions ran against isolated `iranti_test` on port 54320.
- Dependencies: npm audit reports zero vulnerabilities; no dependency/lockfile changes or package installation.

During screenshot review, a media wrapper with inherited 100% height was found to overlap metadata/upload controls; admin-only fixed preview heights corrected it. The initial responsive sweep also exposed Products/Inventory table grid children widening the document at 768/1024px; bounded shrinking containers corrected that. Final overflow checks compare document scroll width to actual client width (not the mobile layout viewport's expanded innerWidth). Long inventory names also revealed excessively narrow rows; an explicit product-column minimum corrected this. The mobile drawer title/close icon inherited low-contrast colors, corrected with scoped cream text. A final keyboard cycle exposed native Tab progression to browser chrome; explicit drawer boundary wrapping now retains focus in both directions. No PASS is based on an unloaded or unauthenticated page.

Executed commands (from the corresponding application directory):

```sh
# frontend
npm run lint
npm run format:check # attempted; macOS denied reading two PNG assets
npx prettier --check '**/*.{ts,tsx,js,mjs,cjs,json,css,md,yml,yaml}'
npm run typecheck
npm test
npm run build -- --webpack
npm audit
# backend; guarded isolated iranti_test only
IRANTI_INFRA_TESTS=1 LOG_CHANNEL=null /opt/homebrew/bin/php vendor/bin/phpunit --filter 'AuthenticationTest|AuthorizationFoundationTest|CatalogTest|CatalogAvailabilityTest|CatalogAuditTest|StaffMfaTest|InventoryTest|OrderTest|PaymentTest|FulfilmentTest|ReturnsTest|ReportingTest'
```

### 20. Owner workflow

| Step | Developer browser execution | Result |
|---|---|---|
| 1 | Sign in and complete owner TOTP | PASS |
| 2 | Navigate between operational areas using the sidebar | PASS |
| 3 | Open Products | PASS |
| 4 | Create a synthetic product with category/SKU/NGN price/image | PASS |
| 5 | Edit its price through the selected Pricing panel | PASS |
| 6 | Publish after real queued image processing | PASS |
| 7 | Initialize/adjust stock through the inventory modal | PASS |
| 8 | Open the Orders table | PASS |
| 9 | Open Payments and a history dialog | PASS |
| 10 | Open a return from the queue and start review on its dedicated page | PASS |
| 11 | Open Staff | PASS |
| 12 | Submit invitation through the dialog using the existing API | PASS with notification mocked; actual inbox NOT VERIFIED |
| 13 | Return to the summary dashboard | PASS |

This is **developer browser automation of user-facing controls**, not claimed human acceptance. The administrator does not need terminal, database or raw API access. Synthetic paid/delivered order/return fixtures were prepared separately with isolated test APIs and a mocked payment provider. The additional catalog regression also verified storefront price/availability updates, archive removal and unchanged historical order items. No real payment, invitation or production data mutation occurred.

### 21–22. Defect disposition and client retest

ADMIN-UX-004 is **FIXED / DEVELOPER RETEST PASS**, subject to the explicit tooling/provider limitations above. Client retest is **PENDING**, so it is not business-closed. The previous UAT-D001–003 remain pending client acceptance. No external provider or staging gate is closed by this UI work.

Client retest routes: `/admin`, `/admin/products`, `/admin/products/new`, `/admin/products/{id}/edit`, `/admin/categories`, `/admin/categories/new`, `/admin/categories/{id}/edit`, `/admin/inventory`, `/admin/orders`, `/admin/orders/{id}`, `/admin/payments`, `/admin/returns`, `/admin/returns/{id}`, `/admin/staff`, `/admin/reports`, `/admin/notifications`. Use actual record links instead of pasting fixture UUIDs into a different database.

[Screenshot gallery, sanitized responsive/keyboard results and client retest checklist](../uat/evidence/admin-shell/README.md). Additional category create/edit browser checks passed with the new dedicated routes. The 13-step owner workflow and catalog regression passed; notification delivery was deliberately mocked. Runtime browser scripts and fixture results are retained under ignored `.runtime/admin-uat/shell-*`; no secrets or fixture database files are tracked.

Cleanup verified: isolated QA frontend (3030), API (8020), Chrome (9227), worker and PostgreSQL (54320) stopped. Everyday frontend/backend, Homebrew PostgreSQL and both Redis instances remain running. `git diff --check` passed. No commit, push, deployment, package installation or production configuration change occurred.

**PHASE 3N REMAINS OPEN — CLIENT RETEST AND EXTERNAL UAT GATES PENDING.**

---

## Historical publication and first admin UX remediation

Version 1.0 — 2026-09-25. Authorized UAT defect remediation only. Phase 3N remains **OPEN**; Phase 3O has not begun. Developer retesting is not client/business acceptance. No deployment, production configuration change, new commerce feature, catalog schema change or production data reset was performed.

## 1. Publish failure: reproduced root cause

**ROOT CAUSE:** the old inline editor held a stale `content_version` after asynchronous image processing. `ProcessProductImage` makes the image ready and advances the product version. The UI neither automatically refreshed that version nor clearly guided the administrator through processing/readiness. Publishing from that stale UI returned HTTP **409**. Refreshing the same valid product and publishing succeeded.

**EXPECTED:** after required setup and successful image processing, the editor updates readiness/version and allows publication; incomplete products remain blocked with a useful explanation. **ACTUAL:** a valid product could remain unpublishable from the stale editor until the administrator manually refreshed. **FIX REQUIRED:** bounded automatic media-status refresh, current-version publication and backend-derived readiness/error guidance, retaining optimistic concurrency checks.

Reproduced before replacing the inline UI: owner sign-in/TOTP, draft/name/description/category/simple SKU/price, actual upload and queued image processing, failed publication without refresh, successful publication after refresh. Stock initialization and public availability were then verified in the complete retest below. The administrator's original product/request was not supplied, so this is a verified reproduction, not a claim to have audited their specific historical request.

Trace: frontend `catalogAdmin` POST → catalog request validation (`content_version`) → authenticated/MFA owner `catalog.publish_archive` gate → `CatalogActions::transition` → PostgreSQL advisory/row locking → version comparison → publication guard → state/audit transaction. The failing stale request stopped at the version comparison, before the guard. The media worker changed the persisted version independently. Role permissions, validated price, SKU and transaction behavior were working correctly.

Classification: **frontend stale state + asynchronous media UX/guidance defect**. The backend's 409 was correct. Existing guard requires description, active category, ready image and complete active SKU/options. **Opening stock is not a publication prerequisite**; positive available stock governs listing/search visibility, and an out-of-stock detail page remains informational. No invented prerequisite or weakened guard was introduced.

## 2–13. Implemented operational changes

| # | Area | Result |
|---|---|---|
| 2 | Publish fix | Poll every three seconds only during processing; pause for hidden page, writes and unsaved General edits; ignore in-flight responses after edits; bounded retry/help after 60 checks. Refresh version/readiness together. Server still rejects stale/incomplete requests |
| 3 | Products list | `/admin/products`: thumbnail/name, SKU summary, category, price/range, stock, readable status, updated date, edit/storefront/publish/archive, search/status/category filters and pagination. Old `/admin/catalog` redirects |
| 4 | Editor | Separate `/admin/products/new` and `/admin/products/{id}/edit`; General, Pricing/Variants, Media, Inventory and Publication sections; explicit section saves and save/error/dirty notices. No unsupported SEO settings. Save bar stays in document flow to avoid covering fields |
| 5 | NGN price | Decimal naira input, exact string/BigInt conversion to integer-kobo strings. Covers `4500`, `4500.50`, zero, maximum/large amounts and invalid values; no floating-point money arithmetic |
| 6 | Tax | Labelled dropdown from current published checkout product rules, through owner-gated read-only projection. No arbitrary tax text or invented rates; missing configuration is explained; existing unconfigured references remain visible for correction |
| 7 | Categories | Searchable multiple-category checklist, retained selections and selected count; separate `/admin/categories` management through existing APIs |
| 8 | Variants | Simple product has one SKU editor. Variant products have options/values, explicit combination selection, exact NGN pricing, status editors and Variant/SKU/Price/Status/Stock summary table. Existing SKU uniqueness and combination rules retained |
| 9 | Media | File picker/preview, alt text, ordered gallery, friendly processing status, automatic refresh, removal confirmation and failure guidance; no invented primary-image setting. Upload uses the existing signed/quarantined processing API |
| 10 | Publish/archive | Server-derived checklist and primary Publish; archive is separate and confirmed with history explanation. No hard deletion. Stale conflicts remain actionable rather than silently retried |
| 11 | Inventory | On-hand/reserved/available summaries and link to existing inventory screen filtered by SKU. No ledger duplicate or direct quantity editor in catalog |
| 12 | Staff | Owner-only `/admin/staff`; safe paginated/searchable listing; name/email/approved role invitation; role change, disable and MFA reset via existing APIs. Recent password/TOTP confirmation, last-owner/self-change safeguards and session revocation retained. No employee password field or new provisioning mechanism |
| 13 | Local capture | Client approved optional local-only Mailpit. Explicit opt-in, fixed loopback SMTP/UI, private ignored message database, no inherited relay configuration. Testing stays array; staging/production controls unchanged. Commerce capture remains SIMULATED. Not installed automatically; actual inbox delivery **NOT VERIFIED** |

Admin navigation follows existing permissions and includes only implemented destinations. Iranti colors/type/components are retained with compact panels and bounded tables. Read-only staff cannot edit catalog or access owner provisioning. New backend read projections expose neither MFA secrets nor media storage keys.

## 14–15. Responsive and accessibility review

Chrome browser emulation: **320, 375, 768, 1024 and 1440px**. Reviewed Products, Add Product, Edit Product, Categories and Staff at every width (25 route/width combinations). No document horizontal overflow; complex tables intentionally scroll within their containers. Automated axe WCAG 2 A/AA and 2.1 AA checks found **zero violations** in the inspected main regions. Screenshot inspection covered mobile/desktop tables/staff and General forms across the five widths, plus the variant editor. An overlapping sticky save bar was found during review and fixed; all five General widths were rechecked after that fix.

Browser keyboard review verified focus entering the archive confirmation, repeated Tab remaining inside it, Escape cancellation and focus returning to the invoking button, with a visible 2px outline. Invalid price feedback is associated with the input; General API errors have a focused summary associated with the form. Labels, native upload picker, table headings and textual statuses were inspected. Reduced-motion preference produced non-smooth scrolling. A 200% CSS zoom readability/reflow check at desktop width had no page overflow. This is not a claim of physical-device, all-browser, screen-reader or full WCAG certification; those client UAT checks remain.

## 16. Mandatory admin workflow: developer retest

Executed in isolated `iranti_test` PostgreSQL on port 54320 with synthetic data, test Redis namespaces, real local HTTP/API/media worker and Chrome. Catalog actions below used the user interface. A synthetic paid order was prepared separately through test APIs with a mocked payment provider for the historical-snapshot assertion; no real payment or external email was sent. No terminal/database/raw-API knowledge is required from the administrator to perform the catalog actions.

| Step | Action | Result |
|---|---|---|
| 1 | Owner signs in and completes TOTP | PASS |
| 2 | Opens Products | PASS |
| 3 | Clicks Add Product | PASS |
| 4 | Enters name | PASS |
| 5 | Adds description | PASS |
| 6 | Assigns category | PASS |
| 7 | Chooses simple product | PASS; additional variant setup also checked |
| 8 | Sets SKU | PASS |
| 9 | Enters `4500.50` naira | PASS |
| 10 | Uploads image | PASS; actual media processing |
| 11 | Saves draft/section changes | PASS; explicit saves required before dependent sections |
| 12 | Initializes inventory through Inventory | PASS; 10 units |
| 13 | Publishes | PASS; no manual media refresh |
| 14 | Sees storefront product | PASS; ₦4,500.50 |
| 15 | Changes price to `4750.25` | PASS |
| 16 | Sees updated storefront price | PASS; ₦4,750.25 |
| 17 | Adjusts remaining stock to zero | PASS |
| 18 | Confirms availability behavior | PASS; removed from listing, out-of-stock detail retained |
| 19 | Archives with confirmation | PASS |
| 20 | Confirms storefront removal | PASS; API 404 |
| 21 | Confirms historical paid-order items unchanged | PASS; snapshot comparison |

Additional browser checks: Colour Green/Orange options and two distinct variant combinations with NGN prices, variant table, invalid decimal feedback; staff creation, approved role change, owner MFA reset and disable through the real local API with notification delivery deliberately faked. Actual staff invitation inbox/setup-link delivery still needs Mailpit/provider testing.

Evidence retained locally in ignored `.runtime/admin-uat/`: `reproduction.json`, `flow.json`, `staff-results.json`, `responsive.json`, `variant-keyboard.json`, test/build logs; screenshots in `.runtime/hardening-verification/3n-*.png`. The initial staff script's programmatic-click focus observation is not used as proof of focus restoration; the subsequent actual keyboard activation/Tab/Escape check supplies that evidence. Runtime fixtures, tokens, captures and database files are not tracked.

## 17–18. Regression

Final executed results: Full backend includes PostgreSQL/Redis integration and existing concurrency cases; external providers remain mocked. The opt-in synthetic performance/restore workload is separate from ordinary full PHPUnit and was not rerun for this UI remediation.

- Backend PHPUnit with `IRANTI_INFRA_TESTS=1`: **205 tests / 5,144 assertions; 204 passed, 1 intentional opt-in performance/restore skip; no failures**. Existing PostgreSQL concurrency cases ran.
- Pint: PASS. Larastan level 8: PASS. Composer locked audit: PASS, no advisories.
- Frontend ESLint, Prettier and TypeScript: PASS. Vitest: **184 passed / 20 files**. Webpack production build: **PASS**. npm audit: **0 vulnerabilities**.
- Mailpit script: Bash syntax PASS; missing-dependency error PASS. Actual SMTP/inbox: NOT VERIFIED (not installed).
- `git diff --check`: PASS. No packages installed or lockfiles changed.

Commands (from their respective application directories, with the isolated test database/services configured as in [testing.md](testing.md)):

```sh
# backend; never point infrastructure tests at iranti_local
IRANTI_INFRA_TESTS=1 /opt/homebrew/bin/php vendor/bin/phpunit
/opt/homebrew/bin/php vendor/bin/pint --test
/opt/homebrew/bin/php vendor/bin/phpstan analyse --memory-limit=512M
composer audit --locked
# frontend
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build -- --webpack
npm audit
```

Regression additions cover async media/current-version publication and storefront visibility, incomplete setup rejection, admin status/public filter boundaries, safe owner-only staff projection, exact money conversion, configured-tax/category editing, polling publication, staff forms/RBAC/local capture notices and environment transport boundaries. Existing payment/order/inventory/refund/notification behavior remains covered by the full suite.

## 19–20. Defect disposition and remaining gates

[UAT defect register](../uat/02-defect-register.md): UAT-D001 publication reliability, UAT-D002 admin usability and UAT-D003 missing staff operational UI are **fixed and developer-retested; client retest pending**, not business-closed. No new commerce scope is declared. No known unresolved implementation blocker from the completed local retest; optional Mailpit inbox behavior is unverified.

Still required: business administrator repeats the workflow and accepts the operational UI; approved representative catalog/content/images/prices/stock; actual tax/delivery/policy configuration; staging services/HTTPS/object storage and deployment access; real Paystack TEST initialization/payment/webhook/refund evidence; approved email sender/DNS/provider/inbox delivery; role-specific business UAT, physical devices/cross-browser/screen-reader review; staging backup/restore, monitoring/alert evidence and hosted CI result. Production gates and unsigned sign-off remain authoritative. This work does not approve or activate any provider.

**PHASE 3N REMAINS OPEN — CLIENT RETEST AND EXTERNAL UAT GATES PENDING.**


## Local cleanup

Stopped the isolated Chrome profile, QA Next.js server (3030), QA PHP server (8020), QA media/identity worker and newly created QA PostgreSQL cluster (54320). Retained ignored evidence. Existing everyday frontend/backend, Homebrew PostgreSQL and Redis services were left running. No real staff account or catalog fixture was created in `iranti_local`, no Mailpit installed, and no changes were committed or pushed in this remediation task.
