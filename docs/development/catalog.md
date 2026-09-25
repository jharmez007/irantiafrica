# Product catalog — Phase 3C

Implementation baseline: **v1.0 approval candidate, 2026-09-22**. Phase 3B is client-approved; its user model, 31 permissions, staff MFA, sessions and recovery decisions remain authoritative. This phase implements FR-CAT-001–004, the catalog portion of FR-ADM-002, and catalog SEO/accessibility/security foundations. See [Phase 3C report](phase-3c-report.md), [variants](product-variants.md) and [media](product-media.md).

## Scope and approved model

The launch scope remains 20–50 physical made-in-Nigeria products, NGN, simple and configurable products, generic options, differing variant prices, categories and product search. Reviews, bulk discounts, promotions, wishlist, recommendations, digital products, marketplace sellers and Brand are not implemented. No stock fields, inventory tables, reservations, cart, checkout, orders or other later-phase domain tables were added.

`2026_09_21_000005_create_catalog_tables.php` implements the eight catalog tables from architecture 08: categories, products, product_categories, product_options, option_values, product_variants, variant_option_values and product_media. UUID keys, UTC timestamptz columns, default timestamps, FK delete/update actions, composite parent constraints and indexes follow the approved design. Raw PostgreSQL DDL expresses the composite constraints explicitly; model PHPDoc describes those columns for Larastan. ProductFactory creates draft test data only. No production demo seeder or actual client catalog has been loaded.

A product contains name, stable slug, plain-text description, kind, editorial status, tax-category reference, content version and publication/archive timestamps. Its price is derived from variants. Plain text is escaped by React; there is no HTML editor or raw description rendering. Tax-category strings are references for the later tax implementation, not rates or a zero-tax default.

## Lifecycle and editing

- New products are `draft`. A blank description is allowed while drafting.
- Publication requires a nonempty description, an active assigned category, a ready image and at least one valid active SKU. Simple products require their single empty-signature variant; configurable products require complete combinations.
- Published products remain editable within these completeness rules. A content-version mismatch returns 409. Price/status changes require the current variant price version.
- Archival is explicit and retains product, options, variants, media metadata and reserved slugs/SKUs. There is no product DELETE endpoint or blanket soft deletion. Archived products cannot be edited or republished through the current commands.
- Option definitions must be completed before the first variant is created. Additional values may be appended to existing options. Existing option labels, selections and SKUs are immutable through the API; create a replacement product when its selectable structure changes materially.
- Variant archival/restoration changes catalog state, never inventory. Archiving the last active SKU of a published product is rejected. An archived combination can be restored; it cannot be duplicated under another SKU.

The backend decides visibility. Public reads require publication, an active category, an active variant and ready media. Draft/archived products return 404. Phase 3C does not claim stock availability: zero-stock hiding, allocation and purchase eligibility await Phase 3D. The UI has no cart action and says ordering is not yet available.

## Slugs and categories

Product/category slugs are generated from names with Laravel's slug normalization and numeric collision suffixes. An authorized create request may supply a validated lowercase ASCII hyphenated slug. Product slugs are globally unique within products; category slugs within categories. URLs remain stable after name changes. Update requests cannot change slugs; archival does not release them.

Categories use `draft`, `active`, `archived`, optional acyclic parent and unique slug. A product has many-to-many category membership, with a maximum 30 categories per request. Category mutations serialize hierarchy checks to prevent concurrent cycles. Category filtering matches explicitly assigned membership; it does not silently include descendants. Active children do not inherit parent status. Admin and storefront category selectors retrieve all bounded pages; editing preserves existing memberships unavailable in a selector.

## API contracts

All paths below are relative to `/api/v1`. JSON success uses `data`; paginated lists include `meta.page`, `last_page`, `total` and product `page_size`. Errors use the existing safe `error.code/message/fields/request_id` envelope. Writes require the approved same-origin session, CSRF proof, current identity and completed staff MFA. Form requests reject unexpected body fields, and actions use explicit field allowlists.

| Method and path | Permission / behavior |
|---|---|
| GET `/products`, `/search` | Public visible products; query filters below |
| GET `/products/{slug}` | Public product detail, or 404 |
| GET `/categories`, `/categories/{slug}` | Active categories, bounded list or single slug |
| GET `/media/{id}/{size}` | Ready derivative; published product or current authorized staff preview |
| GET `/admin/products`, `/admin/products/{id}` | `catalog.read_internal`; separate admin resource |
| POST `/admin/products` | `catalog.create_update`; draft, 201 |
| PATCH `/admin/products/{id}` | `catalog.create_update`; content version required |
| POST `/admin/products/{id}/publication`, `/archive` | `catalog.publish_archive`; content version required |
| POST `/admin/products/{id}/options` | `catalog.create_update`; name/position and explicit values |
| POST `/admin/options/{id}/values` | `catalog.create_update`; append values |
| POST `/admin/products/{id}/variants` | `catalog.create_update`; SKU, minor-unit price and exact value IDs |
| PATCH `/admin/variants/{id}` | `catalog.create_update`; price/status and price version |
| GET `/admin/categories` | `catalog.read_internal` |
| POST `/admin/categories`, PATCH `/admin/categories/{id}` | `catalog.create_update` |
| POST `/admin/media/uploads`, `/admin/media/{id}/complete` | `media.manage`; intent and processing acceptance |
| POST `/admin/media/{id}/upload` | Local signed multipart upload; `media.manage`, CSRF and expiry |
| PATCH `/admin/media/{id}`, DELETE `/admin/media/{id}` | `media.manage`; alt/order edits or retirement |

The owner has the four catalog/media permissions. Inventory/Store Staff and Order Processing Staff have internal read access only. Customers and anonymous callers have public access only; password-only staff remain restricted by Phase 3B MFA. There is no owner authorization bypass and no new permission.

Public resources omit editorial status, tax references, content/price versions, audit data and object keys. Opaque option/value/variant/image IDs are included where needed for selection and image association. Admin resources explicitly include editable fields and all catalog states; they do not expose quarantine keys or raw models.

## Search, performance and rendering

PostgreSQL `to_tsvector('simple', name || ' ' || slug)` has a matching GIN index. Parameterized `plainto_tsquery` searches complete normalized terms, with a 100-character limit. Search is not fuzzy, substring/autocomplete, language-stemmed or description search. Representative client language samples remain a later acceptance input; no external search system was introduced.

Product filters: `q`, category slug, `min_price`, `max_price` (decimal strings of kobo), sort `newest|name|price_asc|price_desc`, page and page_size. Price filtering requires one active variant within the requested bounds; price sorting uses minimum active variant price. No stock or option-facet filter is claimed. Page sizes are 1–100, default 24; page numbers 1–10000. Ordering always ends with UUID for deterministic ties. Newest means publication date.

Product reads eagerly load categories, options/values, variants/selections and media. The integration assertion bounds a two-product listing to at most nine catalog SELECTs including pagination; queries do not grow per product. Relevant FK, state/publication, position and text-search indexes are present. No Redis/product-data cache was added; SSR uses no-store requests. Immutable public image responses are cacheable separately.

Next SSR uses `CATALOG_INTERNAL_READ_KEY` on a private request header to receive a distinct bounded 3000/minute renderer budget. Unknown/forged headers retain the 120/minute public IP budget. This key changes no visibility or staff authorization and is never a NEXT_PUBLIC variable or forwarded browser credential. Both application environments must share a strong key; the setup script creates it without printing/rotating existing secrets. Production API routing must preserve the edge's trusted client-IP model; never trust arbitrary forwarded headers. These budgets are engineering defaults, not a capacity/SLA claim.

Routes: `/products`, `/products/[slug]`, `/categories/[slug]`, `/search`, plus `/shop` redirecting to `/products`; admin catalog is `/admin/catalog`. Server-rendered public content has titles/descriptions, canonical URLs, Open Graph, sitemap and robots rules. Search and filtered catalog URLs are noindex. Product JSON-LD includes only known identity/description/images/URL; no invented offer availability, ratings or reviews. It escapes `<` before embedding. Private areas retain noindex.

Forms have labels, semantic fieldsets, focus indicators, validation/status messages and keyboard-operable native selects. Variant selection displays actual SKU prices and distinguishes nonexistent catalog combinations. Responsive WebP images use explicit dimensions, meaningful alt text and deduplicated srcset widths. Client branding and full device/screen-reader acceptance remain outstanding.

## Transactions, audit and later integration

At this launch scale, catalog mutations use PostgreSQL advisory transaction lock 310031, then relevant row locks. This serializes hierarchy, slug, SKU and combination checks across catalog writers; database uniqueness/FKs remain independent protection. Product/category membership, options/selections, state changes and audit append commit together. A two-process test proves one winner for duplicate simple combinations. External storage operations occur outside DB transactions.

Audit records product/category before/after fields, sorted memberships, bounded description previews/length/hash, price/status changes, publication/archive, options/values, media lifecycle and alt/order changes. No public-read noise or credentials/upload signatures are logged. Long descriptions are deliberately not an unlimited content-version archive.

Phase 3D must implement its approved variant-before-inventory lock order when adding stock-sensitive checks. The current catalog-only publication action does not pretend to validate stock. Preserve historical variant IDs and future order snapshots; financial FKs must restrict deletion as designed.
