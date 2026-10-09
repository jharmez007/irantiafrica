# Render Free production-preview review

Date: 2026-10-09. Phase 3O remains **OPEN**. The Free service is a customer-experience preview, not a public production launch. LIVE Paystack, durable media, production data, and paid capacity approval remain separate gates.

## Preview controls

The `render-free-test` deployment profile requires `PRODUCTION_PREVIEW_NOINDEX=true` and TEST-only payment configuration. Nginx rejects a Free-profile boot without the noindex setting and emits `X-Robots-Tag: noindex, nofollow, noarchive` on every public response. Next.js serves `robots.txt` with `Disallow: /`, suppresses the preview sitemap, and sets public page metadata to noindex. The paid `render-private` profile does not inherit this policy; absent an intentional noindex setting, its public home/catalog metadata and robots file are indexable.

`PRELAUNCH_GATE_ENABLED=false` removes only Nginx Basic Auth for this Free preview. Laravel customer/staff authentication, mandatory staff MFA, CSRF, authorization, rate limiting, encrypted PostgreSQL sessions, and host-only Secure/HttpOnly cookies are unchanged. The paid Blueprint retains `PRELAUNCH_GATE_ENABLED=true`. The owner selected the existing production session lifetimes for Render: staff 15-minute idle, 8-hour absolute/MFA trust, and the existing 120-minute Laravel session idle. The local-UAT 24-hour staff configuration is not copied to Render.

Customer-facing pages were searched for “test”, “UAT”, “pre-launch”, “preview environment”, “temporary”, “sandbox”, and developer-only “draft” labels. No deployment/UAT banner appears on the storefront. “Temporary stock reservation” explains checkout behavior; checkout's DRAFT status maps to “Contact and delivery”. Tax configuration warnings and Draft product status are confined to admin catalog screens. Payment pages say payment is unavailable while `PAYMENTS_ENABLED=false`; no page claims LIVE payments are available.

## Performance evidence before the change

From one external macOS connection on 2026-10-09, a first request to `/api/v1/health` after inactivity had 33.05 seconds to first byte. This is a **Render Free wake-up observation**, not an application cold-start benchmark or paid-capacity result. The service was then warm. The test database had no published catalogue products, so product detail, add-to-cart, and checkout initialization with stock could not be measured.

| Warm request | HTTP | First byte | Total |
| --- | ---: | ---: | ---: |
| Homepage `/` | 200 | 3.20 s | 4.48 s |
| Catalog `/products` | 200 | 3.37 s | 3.57 s |
| API `/api/v1/products?page_size=4` | 200 | 1.99 s | 1.99 s |
| Login `/login` | 200 | 2.25 s | 2.25 s |
| Cart shell `/cart` | 200 | 2.05 s | 2.05 s |
| Checkout shell `/checkout` | 200 | 2.14 s | 2.14 s |

These are sequential single samples including client network and Render Free resources. The API baseline is about 2 seconds from this connection; server-rendered catalog/home requests add roughly 1–2 seconds. That difference is an **inference**, not an isolated frontend profiler result. The empty catalogue and Basic Auth gate limit the comparison. Remeasure with published disposable products, browser waterfall, Render request logs, queue activity and paid always-on compute before acting on a hosting split.

After the gate-off redeploy of `b5996aa302f9e9ebf1ee020a1b950272b6599706`, a second warm sequential sample from the same Mac was: homepage 0.67 s first byte / 1.05 s total; catalog 0.59 / 0.90; catalog API 0.63 / 0.63; login 0.62 / 0.63; cart shell 0.45 / 0.45; checkout shell 0.44 / 0.44. All returned 200 with successful TLS verification. The samples are too few and too variable to attribute the improvement to Basic Auth removal or a particular server component. The empty catalogue still prevents product-detail, add-to-cart and stocked checkout timing.

Code inspection found `cache: "no-store"` on public server catalog reads and client cart/auth requests. This protects live stock and private state, but repeats catalogue work. Home requests the featured products and categories in parallel. Product detail uses React `cache()` for duplicate detail reads within a render; related products may add one or two listing calls. The catalog listing fetches products plus all category pages; the auth provider probes `/auth/me` on navigation, and the cart provider fetches the cart when auth state changes. Product images already use bounded WebP derivatives, responsive source widths, native lazy loading and async decode. No cache or request-flow change was made without populated-catalogue measurements and invalidation rules; authenticated and admin responses must never become public CDN cache entries.

The October 9 dependency audit newly flagged Next.js 16.3.6, sharp 0.35.4 and source-map-js 1.2.1. Normal npm resolution, without `--force`, selected the patch versions Next.js and matching ESLint config 16.3.8, sharp 0.35.5 and source-map-js 1.2.2. The production audit then reported zero findings. The pre-existing five-node development-only ESLint chain remains under its narrow documented exception; it was not broadened.

## Read-only Vercel assessment

**A. Direct cross-origin Vercel → Render API: high migration risk.** Current browser calls are relative `/api/v1/*` and `/sanctum/csrf-cookie`, with credentials included and the XSRF cookie read on the page origin. Laravel Sanctum's SPA-cookie design requires a shared top-level domain. Separate `vercel.app` and `onrender.com` hosts do not meet that model. Even sibling custom subdomains would require reworking the deliberately host-only session cookie, credentialed CORS, CSRF origin/stateful-domain settings, guest-cart and guest-order capability cookies, customer/staff/MFA sessions, redirects and logout. [Laravel Sanctum's SPA guidance](https://laravel.com/framework/docs/13.x/sanctum) describes the domain and cookie requirements. This pattern would change approved security behavior and needs a full threat model and browser regression.

**B. Same-browser-origin Vercel rewrites to Render: medium-to-high migration complexity.** [Vercel external rewrites](https://vercel.com/docs/routing/rewrites) can proxy `/api/*` and `/sanctum/*` without changing the browser URL. This is closer to the current Nginx same-origin design, so host-only cookies may remain browser-visible on the Vercel hostname. It still needs explicit validation of forwarded Host/Origin, Set-Cookie and XSRF behavior, Sanctum stateful domains, guest carts/order capabilities, staff MFA and owner recent-auth, checkout ownership, Paystack return/webhook URLs, and signed media upload/read paths. SSR catalog/recommendation calls would move from loopback to a secured cross-provider API origin; the private renderer key must stay server-only. Rewrites must avoid caching private API and media responses. External proxy requests also have [provider limits](https://vercel.com/docs/limits), including a maximum processing timeout. This is a separate deployment and rollback project, not a configuration-only switch.

**Recommendation:** retain the combined Next.js/Laravel Render deployment for the initial paid, always-on service. Render Free sleeping does not demonstrate a production frontend bottleneck. Revisit a split only after representative paid-plan traces show a material benefit that outweighs the cookie, proxy, media and operational complexity.

## Deployed preview verification

Render marked the corrected redeploy **Deploy succeeded | Live** at `b5996aa302f9e9ebf1ee020a1b950272b6599706`. Anonymous HTTPS GETs to `/`, `/products`, `/search`, `/login`, `/register`, `/cart`, `/checkout`, the catalogue API and health returned 200 without a Basic Auth challenge. Every sampled response had `X-Robots-Tag: noindex, nofollow, noarchive`; `/robots.txt` returned `Disallow: /`, and `/sitemap.xml` contained an empty URL set. The preview noindex flag and `PRELAUNCH_GATE_ENABLED=false` were inspected in Render's saved environment. The paid-production default and profile tests remain indexable unless explicitly set otherwise.

The unauthenticated `/api/v1/auth/me` and `/api/v1/admin/products` requests returned 401. An anonymous browser visiting `/admin` was redirected to the application login. Chrome navigated homepage → catalog → cart → account → admin/login without any infrastructure authentication prompt. The session bootstrap returned 204 and set a host-only `Secure`, `HttpOnly`, `SameSite=Lax` Laravel session cookie; the XSRF cookie was `Secure`, `SameSite=Lax` and intentionally browser-readable. Repeated same-origin guest cart GETs returned 200 with a persistent cart capability cookie, and checkout/current returned 200. This verifies anonymous session continuity, **not** a complete customer or staff authentication lifecycle. No preview owner/customer credentials were used, so customer login/logout, staff MFA, recent-auth and authenticated session expiry remain **NOT VERIFIED** on Render. The owner selected the production session defaults, not the 24-hour local-UAT staff policy.

Render's saved nonsecret flags were read back: `PAYSTACK_MODE=test`, `PAYSTACK_LIVE_APPROVED=false`, `PAYMENTS_ENABLED=false`, and `PRODUCTION_PREVIEW_NOINDEX=true`. No LIVE payment attempt was made. The Free database is temporary, media is ephemeral, and an independent logical backup is outstanding. Populated-catalogue performance, real Resend delivery, staff/customer journey and Paystack TEST round trips remain separate Phase 3O checks. No Free-tier latency, memory or cold-start observation approves paid production capacity.
