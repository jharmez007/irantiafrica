# 03 — Storefront layout

Phase 3C.5 · Review baseline 0.1 · 23 September 2026

The storefront uses a warm, restrained editorial hierarchy built around the supplied IRANTI Africa identity and actual catalog content. This phase changes visual presentation and navigation only. Cart, checkout, payments, delivery promises, promotions and new inventory behavior are outside scope.

Shared CSS and homepage integration are implemented. Automated checks passed and the user confirmed human QA passed on 2026-09-23. Phase 3C.5 is approved and closed at v1.0. Document 05 and the phase report retain evidence attribution and the human sign-off.

## Page frame

`StorefrontChrome` supplies the public Header and Footer once. A page supplies one `main#main-content`; the skip link targets this landmark. `Container` aligns page content and shared side spacing. Catalog pages use `CatalogShell`, which deliberately contains no repeated navigation.

The desktop header combines the original horizontal brand lockup, Shop/Collections/Our story navigation, search and account links. Mobile uses a compact header and a native-dialog navigation drawer. The shopping-bag location is a noninteractive placeholder: no cart request, active checkout control or invented item count exists.

The footer uses the green brand treatment, the supplied vertical lockup, valid navigation and copyright. Unknown contact, shipping, returns, privacy and terms content remains neutral text rather than an empty or misleading destination. Social profiles are not invented. The final client-approved policy/contact content must replace these placeholders before the relevant production flows are launched.

Authentication and MFA screens use `AuthLayout`; administrative routes use `AdminShell`. They are not wrapped in storefront chrome.

## Implemented homepage composition

The server-rendered homepage implements:

1. A quiet brand announcement line and shared navigation, without promotional claims.
2. An editorial hero using supplied brand artwork as a controlled fallback until client-approved photography is available, plus a genuine collection link.
3. A category section anchored at `#collections`, rendering actual public category records through `CategoryCard`.
4. A product section rendering actual public catalog results through `ProductCard`.
5. A restrained brand-story section anchored at `#our-story`, limited to approved identity language such as “Memories of Nigeria.”
6. Shared footer and available navigation.

Server data loading must use the existing `catalogFetch` path and public catalog contract. Product availability and visibility remain backend-filtered; the homepage must not bypass that filter to fill a grid. If a category has no suitable image, its card can use the neutral numbered panel. If products/categories are empty or unavailable, the page renders an honest empty/error treatment and retains collection navigation. It must not substitute fabricated product names, prices, ratings, discounts, inventory or photography.

Brand artwork is an editorial fallback, not a representation of a sellable product. Do not label it as product photography. Development review fixtures remain development/test data; they are not production merchandising content. No newsletter subscription form or marketing integration is activated by this layout phase.

## Collection, category and search pages

| Route                | Content and metadata                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/products`          | Primary collection page with editorial title, concise introduction and real catalog results. Unfiltered canonical page remains indexable.                             |
| `/shop`              | Existing redirect to `/products`; no second competing catalog implementation.                                                                                         |
| `/categories/[slug]` | Category name and real category-filtered product results. Missing categories retain the existing 404 behavior. Filtered category pages remain excluded from indexing. |
| `/search`            | Search introduction and the same filter, results and product-card system. Search results remain `noindex, follow`.                                                    |

`CatalogList` places controls in a contained filter panel before the image-led grid. Search, category and sort controls remain native labelled form elements. Submission uses GET URLs, so navigation remains shareable and usable without a client-only filter state. Changing category on a category route submits to `/products`, allowing another category or all products to be selected. Existing minimum/maximum price constraints remain intact when the form is submitted.

The results row displays the API's total and, where present, the submitted search phrase. Product cards use actual product images, names, categories and NGN price strings. There are no Add to Cart, wishlisting, rating or promotional controls. Stock counts are not shown.

Pagination preserves search/category/sort/price parameters and changes only the page. Its links carry accessible page labels. Empty results offer a full-collection link. Loading states use decorative card skeletons plus a readable status, while errors show safe copy and a retry link.

## Product detail

`/products/[slug]` begins with a breadcrumb from Home and Shop through the first category to the product. The desktop composition places a contained gallery beside the product summary; smaller viewports stack these regions in reading order.

The gallery uses existing processed media derivatives. One selected image is shown prominently; additional images appear as labelled thumbnail buttons with `aria-pressed` state. Images retain their intrinsic dimensions and alt text. Changing a variant preserves the existing product/variant media-association filtering. A selection that does not belong to the currently visible media set falls back to that set's first image.

The summary presents category links, product name, exact NGN price/range and a textual availability state. Generic option fields retain their approved resolution rules and update the price live. Unavailable option combinations remain disabled and explicitly labelled. The SKU is shown after a variant resolves, and the supplied description appears under Product details.

Published sold-out products retain informational detail and imagery under the approved visibility policy. Their presentation says “Out of stock,” without exact quantities or promises about replenishment. The page contains no cart behavior, simulated purchase flow or engineering message. The existing separately calculated-tax meaning is retained in a short price note.

Product title, description, canonical URL, Open Graph imagery and the existing factual Product structured data remain driven by the catalog. Do not add Offer availability, reviews, ratings or shipping data that the approved contract does not supply.

## Layout and accessibility rules

- Use the shared cream/green/charcoal/accent tokens and typography hierarchy; do not add page-specific colors or substitute logo artwork.
- Keep cards image-led with restrained borders and no heavy shadows. Root layout styles determine the mobile, tablet and desktop grid columns.
- Allow controls, product names, breadcrumbs and long category names to wrap without forcing horizontal overflow. Native form controls and gallery buttons require usable touch targets.
- Preserve actual links and buttons, visible focus, readable labels, selected-state text/semantics, meaningful alt text and clear headings.
- Loading skeletons and decorative category numbering remain hidden from assistive technology. Live price/availability messages do not expose internal data.
- Motion is decorative and subtle; the shared stylesheet must respect `prefers-reduced-motion`.

## Visual review checklist

Review at small mobile, large mobile, tablet, laptop and wide desktop widths. Use real client content where available or clearly isolated development fixtures for the product-dependent checks.

| Route/state                | Review                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                        | Logo proportions, header/menu, hero fallback, actual categories/products or honest empty states, anchor navigation, footer content and no engineering/API links. |
| `/products`                | Introduction spacing, contained filters, grid rhythm, actual image proportions, long names/prices, pagination and no overflow.                                   |
| `/categories/[slug]`       | Shared hierarchy, category title, changing/clearing category, preserved pagination and empty results.                                                            |
| `/search`                  | Search phrase/result count, keyboard form submission, sort/filter retention, safe validation and unavailable-service state.                                      |
| `/products/[slug]`         | Breadcrumb wrapping, gallery/thumbnail focus, variant price changes, invalid/unavailable choices, sold-out information and absence of cart controls.             |
| Loading/error states       | One main landmark, meaningful status/alert, unobtrusive skeleton motion and working retry navigation.                                                            |
| Header/footer across pages | Consistent spacing, native mobile drawer keyboard behavior, focus restoration, actual destinations and readable contrast.                                        |

Catalog component tests pass, including gallery behavior and preserved filters. Header/drawer interaction and six axe scans also pass in jsdom. Chrome review confirmed the 320px homepage and desktop homepage/empty collection. The agent’s remaining exact-width and populated/protected-route checks are retained as historical coverage limits in document 05; the user subsequently signed off human QA and closed the phase. Component tests do not establish rendered layout or complete accessibility.
