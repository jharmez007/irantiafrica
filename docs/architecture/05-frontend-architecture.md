# 05 — Frontend architecture
Trace: FR-CAT/CART/ACC/SEO, NFR04/05/16/17. Next App Router with strict TypeScript; no implementation included.

| Route area (conceptual) | Rendering / data |
|---|---|
| /, /products, /products/[slug], /categories/[slug], /search | Server Components for indexable public content; URL query filters/search; bounded public metadata cache, authoritative availability read |
| /cart, /checkout, /checkout/result | Dynamic/private; client quantity/forms/payment handoff; server totals only |
| /login, /register, /forgot-password, /reset-password, /verify-email | Accessible forms calling Laravel session endpoints |
| /account, /account/addresses, /account/orders/[id] | Dynamic/no-store; current session required; API authorizes ownership |
| /guest/access, /guest/orders/[id] | Exchange emailed capability for scoped session; no indexing/caching |
| /admin/* | Restricted dynamic shell; catalog, orders, inventory, returns, basic reports, staff/settings as permission permits |
| /policies/* | Versioned approved policy content, public |

Route groups separate storefront/auth/admin layouts without changing URLs. Server Components fetch content/read models; Client Components handle forms, dialogs, option selection and interactive carts. Keep cart authority on API; local component state holds drafts and pending requests. No global Redux-like store needed. React context may hold a small current-user summary, never authorization authority.

A typed API client centralizes credentials, CSRF bootstrap, request IDs, abort/timeouts, error normalization and resource types. Browser writes go directly to same-origin Laravel. Server requests forward only the current user's relevant cookie over the private network; never forward arbitrary headers/authorization. Do not expose internal API URLs/secrets in NEXT_PUBLIC variables. No payment-secret calls from Next/browser.

Forms use accessible labels, per-field and summary errors, server validation and safe optional client validation. Money is displayed from integer minor units, never recomputed with browser floats as authority. A 409 stale quote/stock response asks the customer to review updated totals; preserve input. Disable duplicate submit for UX while server idempotency remains required. Payment-return screen polls state and can show pending/review, never declares paid from URL parameters.

Use segment error boundaries, safe generic failure messages/request IDs, skeletons with stable dimensions, empty and retry states. Distinguish 401 session expiry, 403 permission, 404 inaccessible resource, 409 conflict and 422 validation. Accessibility recommendation: WCAG 2.2 AA; keyboard focus, dialog focus management, screen-reader live updates, contrast and reduced motion. Validate at 320px and actual agreed device/browser matrix; these are Q19 targets, not an approved SLA.

Design-system layers: tokens (approved branding, spacing/type/colour), accessible primitives, commerce components and route composition. No custom product design is approved by this architecture. Client supplies logo and brand assets; developer descriptions require factual client review.

SEO: server-rendered titles/descriptions/canonical URLs, sitemap for published available products/categories, robots rules, structured product data consistent with visible price/availability. Hide zero-stock products from listings as required; handling existing product URLs on zero stock is a Q04 presentation choice (recommend stable informational unavailable page with purchase disabled, excluded from listing/sitemap). Search facets should not create unlimited indexable duplicates. Account/admin/cart/checkout are noindex and access-controlled, not merely robots-hidden.

Use allowlisted media origin, explicit image dimensions/responsive sizes, alt text, safe transforms and no arbitrary image proxy URLs. Test component interactions with Vitest/Testing Library; test Server Component journeys, auth boundaries, SEO output and checkout with Playwright. Automated accessibility plus manual keyboard/screen-reader checks are gates.
