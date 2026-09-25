# PHASE 3C CATALOG, VARIANTS & MEDIA REPORT

**Approval disposition — 2026-09-22:** The client formally approved this Phase 3C baseline and authorized Phase 3D inventory only. The implementation-time statements below are historical; subsequent inventory work is tracked in its own report.

**Baseline: Phase 3C v1.0 approval candidate — 2026-09-22.** Phase 3B was formally approved by the client; this report covers only the subsequently authorized catalog phase. Phase 3D has not begun. Requirements and the approved identity/RBAC/MFA decisions were preserved.

## 1. Migrations created

One catalog migration: `2026_09_21_000005_create_catalog_tables.php`, containing the eight architecture-approved catalog tables. PostgreSQL UUIDs, timestamptz, restrictive historical FKs, same-product composite FKs, uniqueness, status/money/position checks and query indexes are implemented. Full rollback, reapply and migrate:fresh pass in the isolated PostgreSQL database. No inventory or later-commerce migration was added.

## 2. Models created

Product, Category, ProductOption, OptionValue, ProductVariant, VariantOptionValue and ProductMedia, with explicit relationships/casts. The product_categories association uses the approved UUID pivot. ProductFactory creates safe draft fixtures; no fake production catalog or default staff credentials are seeded.

## 3. Catalog entities

Physical products only, initially 20–50; many-to-many categories, optional category hierarchy, generic options/values, explicit variants and media. No Brand entity is justified by the approved scope. Draft → published → archived lifecycle, backend visibility, stable slugs and retained historical identities are implemented.

## 4. Simple-product strategy

The approved single default variant supplies SKU and price with an empty option signature. Drafts can be incomplete; publication requires exactly one valid active simple variant. The storefront does not fabricate option selectors.

## 5. Variant strategy

Explicit selectable combinations, independently priced in NGN. Canonical sorted stable option/value IDs prevent logical duplicates, including archived combinations. Missing values, two values for one option and foreign-product values are rejected. Archived SKUs remain reserved and can be restored as the same variant.

## 6. Option model

Generic names and ordered values, no size/colour columns. Define options before the first variant; append values later without rewriting existing selections. Used labels/selections are not silently mutated. A materially different option structure requires a replacement product.

## 7. SKU rules

**Client approved:** administrator-entered SKUs, trimmed surrounding whitespace, uppercase normalization, global uniqueness retained after archival. Maximum 100 characters after normalization; controls rejected. No business-specific SKU generator. This closes the catalog SKU-normalization portion of A02.

## 8. Price representation

Nonnegative PostgreSQL bigint kobo, explicit NGN, decimal-string JSON inputs/outputs, bounded input and exact frontend BigInt display. Product price/range is derived from active variants. Price edits have optimistic version checks and before/after audit. No discounts, tax calculation or browser-authoritative price calculation.

## 9. Categories

Draft/active/archived, stable unique slugs, optional acyclic parent, multiple memberships per product. Serialized cycle checks and FKs prevent invalid hierarchy. Category filtering uses explicit membership. Complete category pagination and preservation of undisplayed assignments are covered by frontend tests.

## 10. Media/storage

Local private filesystem and private S3 through Laravel's abstraction. Ten-minute local signed multipart uploads or S3 signed POST policies; Redis processing; WebP derivatives; controlled HTTP origin/CDN URLs and authenticated private previews. Lowest position/UUID supplies the primary-image equivalent. No raw object keys in product responses.

## 11. Upload security

JPEG/PNG/WebP only; actual fileinfo/magic/decode validation; 10 MiB, 25 MP and dimension limits; declared size/hash checks; random quarantine keys; bounded decode/re-encode and metadata stripping. S3 POST policy binds exact size/key/type; an insufficient presigned PUT approach was corrected during review. SVG/HTML/executable/malformed/pixel-bomb inputs cannot become ready images. Local PHP configuration supports the advertised limits.

## 12. Admin endpoints

Products: list/create/detail/patch, explicit publication/archive. Options: add definitions and append values. Variants: create and update price/status. Categories: list/create/update. Media: intent, local signed upload, completion, alt/order edits and retirement. See the complete [API table](catalog.md#api-contracts). Form requests, ProductPolicy/granular gates, transactions, resources and standard errors are in place.

## 13. Public endpoints

GET products, product by slug, categories, category by slug, search and fixed-size media derivatives. Product lists are bounded and stably sorted. Editorial visibility is enforced by the backend; no draft product/resource exposure. Inventory availability is explicitly deferred rather than simulated.

## 14. Storefront routes

`/products`, `/products/[slug]`, `/categories/[slug]`, `/search`; `/shop` redirects to the approved `/products` route. Server-rendered catalog content, category/search/filter state, pagination, variant selection, exact price changes, images, loading/empty/error states are implemented. No Add to Cart behavior was introduced.

## 15. Admin UI

`/admin/catalog` provides product/category administration, option/value and variant controls, uploads, processing refresh, media order/alt edits, publication and archival. Other approved staff roles receive read-only catalog views. The backend remains authoritative for permissions and MFA; no unrelated dashboard was built.

## 16. SEO

Titles, descriptions, canonical URLs, Open Graph, published-catalog sitemap and robots rules. Search/facet URLs are noindex; private areas retain noindex. Product JSON-LD contains known name/description/images/URL only, with safe script escaping. No fictional ratings, reviews, stock availability or offer eligibility. Actual production canonical/CDN origins still require deployment configuration.

## 17. Audit events

Atomic product/category/price/state/option/media audits with actor, subject, outcome, request ID and bounded sanitized changes. Membership before/after IDs are preserved; descriptions have a bounded preview, length and hash. Expired-intent retirement is audited transactionally and idempotently. Existing append-only audit protection remains intact; ordinary public reads create no audit noise.

## 18. Backend results

**PASS: 55 tests, 928 assertions, zero skipped — 2026-09-22.** Real PostgreSQL 18 and Redis; complete Phase 3B regression included. Coverage includes all approved role cells, CSRF/MFA, catalog lifecycle, blank drafts, duplicate combinations/SKUs, foreign values/media, price validation, search/category/pagination, bounded query count, actual signed multipart upload, malformed images/pixel bombs, cleanup, S3 POST policy construction, audit rollback and two-process duplicate creation. The live worker exposed a five-second queue poll exceeding a three-second socket timeout; polling is now two seconds and a real empty-queue regression passes.

Also **PASS:** migrate:fresh and rollback/reapply, Pint, Larastan/PHPStan level 8, Composer validate --strict. No suppression baseline was added. Intentional failure-injection tests emit sanitized exception-class logs; they are expected test evidence.

## 19. Frontend results

**PASS: clean npm ci --strict-peer-deps, Prettier check, ESLint, TypeScript, 23 Vitest tests.** Testing Library/jsdom tests exercise selection and price changes, missing combinations, listing/detail/images, search/category state, pagination, loading/empty/errors, admin form submission/errors and role-aware visibility. Additional tests cover multi-page categories, membership preservation, category switching, srcset deduplication and facet robots metadata.

## 20. Build and integration results

**PASS:** production Next.js 16.3.5 build using `npm run build -- --webpack`, then the built server running locally. Default Turbopack could not bind its CSS worker socket in this workstation environment, including an escalated attempt. The supported webpack build succeeded; the default build script/framework versions were not changed. Hosted CI remains unverified.

**PASS through the live Next production proxy:** owner and both staff roles authenticate/enroll MFA; forbidden mutations are denied; product/category/options/variants and different prices are created; signed multipart upload reaches private storage; a real Redis job produces ready derivatives; anonymous draft product/image access is denied; publication exposes listing, detail, category, search, sitemap and optimized image responses. Temporary data was confined to iranti_test. No external email or production service was used.

No browser provider was available to the UI tool. A full visual/browser/screen-reader audit is **not claimed**. DOM interaction tests and live HTTP/SSR checks establish their stated scope; device/brand/accessibility acceptance remains a pre-production gate.

## 21. Dependency audits

**Composer audit: no vulnerability advisories. npm audit: zero vulnerabilities.** PHP GD/fileinfo requirements were made explicit; no new PHP service/package was needed. Frontend additions are test-only Testing Library/user-event/jsdom dependencies, recorded in the lockfile. The existing client-approved ESLint 9.39.5 EOL exception and mandatory upgrade-review gate remain unchanged under ADR-010.

## 22. Security findings

Review findings were remediated: signed size enforcement, private draft derivatives, signed-query/body validation separation, complete audit snapshots, oversized decode checks, private renderer rate budget and preserved staff-session checks on previews. No unresolved high/critical issue was identified in the executed scope. This is not a penetration-test or production security certification. Actual S3 POST/CORS/private-bucket/CDN configuration, ingress limits and recovery controls must be verified against the selected provider before production.

## 23. Performance findings

Catalog pages use server fetches, no speculative Redis cache, bounded pages and eager relationships. A two-product listing is asserted at no more than nine catalog SELECTs. Publication/FK/search indexes are present, including the matching PostgreSQL GIN expression. Public derivative bytes have immutable caching; private previews/API data are no-store. SSR uses a distinct authenticated, bounded renderer budget so it does not share the small public-client quota. No production load, cost, browser paint or S3 throughput benchmark is claimed.

## 24. Architecture alignment/deviations

The eight-table schema, lifecycle, generic/default variants, money, category cardinality, archived history, permission matrix and queued private-media architecture are preserved. S3 signed POST and a controlled HTTP media origin implement the approved constrained-upload/controlled-origin requirements. Category-by-slug and append-option-value endpoints are narrow catalog contract completions. Engineering choices—stable slugs, plain-text descriptions, simple-token search, serial catalog writes, fixed image presets, private renderer budget and queue polling—are documented in the development guides and architecture implementation notes. **No material business/schema deviation requiring a new ADR was introduced.** The local compiler verification limitation is explicit above.

## 25. Remaining non-blocking items and responsibilities

- **Client/content:** supply real names, approved facts, SKU/option examples, prices, taxonomy and branding; assign photography/image supply/licensing. Developer prepares descriptions from approved facts. No demonstration content is approved for launch.
- **Developer/deployment:** select and verify the S3/CDN configuration, private origins/credentials, POST policy/CORS, worker/scheduler supervision, memory/request limits, renderer key, canonical URL, edge/TLS/proxy settings, least-privilege DB/storage roles, retention and recovery. Test against the actual vendor, not only offline signatures.
- **Acceptance:** finish visual design/brand, mobile/device, keyboard/screen-reader and production load/security/UAT checks. No browser automation provider was available here.
- **Repository:** changes are local; the pre-existing single commit contains only the frontend manifests. Most source/docs were already untracked at task start. No PR, push, deployment or hosted Actions run was performed. Establish the intended tracked baseline/review workflow before integration.
- **Existing later gates:** actual tax categories/rates and content approval, operational ownership, the approved ESLint exception review, and later-module business policies remain in their established phases. Minor configuration does not reopen Phase 1 or Phase 2.

## 26. Readiness for Phase 3D

The catalog/variant/media foundation is ready for Phase 3C approval. Phase 3D can be authorized after this review, subject to its existing A02/A03 stock-pool and inventory-policy gates. Zero-stock hiding, reservation/expiry/restoration semantics, adjustment rules and catalog-to-inventory locking must be resolved/implemented there. No stock schema or ad hoc balance was added here.

Temporary live credentials/test image objects were removed and the local verification services stopped. All seven approved requirements documents match their preserved hashes.

**PHASE 3C READY FOR APPROVAL**
