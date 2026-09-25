# PHASE 3E CART REPORT

> Subsequent disposition — 2026-09-23: the client formally APPROVED Phase 3E and authorized Phase 3F checkout preparation. The submission below is retained as historical verification evidence. See [Phase 3F report](phase-3f-report.md) for the current pre-implementation gate.

**Implementation baseline: Phase 3E v1.0 — 2026-09-23. Status: READY FOR APPROVAL.** Phase 3D is formally approved; Phase 3C.5 remains approved and closed. Scope is cart and cart persistence only. Phase 3F has not begun.

The client approved explicit, non-destructive reconciliation and configurable defaults of 99 units per line, 100 distinct variants per cart and 30-day guest inactivity. Authenticated carts persist until explicitly cleared. The implementation and operational contract are in [cart.md](cart.md).

| # | Required report item | Implementation and executed evidence |
|---|---|---|
| 1 | Migrations created | `2026_09_23_000008_create_carts.php`; PostgreSQL fresh migration and full regression passed on isolated iranti_test:54320. Applied additively to guarded iranti_local:5432 without reset or business-data seed. |
| 2 | Cart schema | carts/cart_items only; UUIDs, XOR guest/user ownership, real user/variant FKs, positive quantity/version, unique cart/variant and one active cart/user, expiry/history indexes. No prices or inventory balances duplicated. No checkout/order/payment tables. |
| 3 | Guest ownership | 256-bit random capability in Laravel-encrypted HttpOnly, SameSite=Lax, host-only cookie; SHA-256 digest in DB. Production Secure follows enforced session configuration. Expired/stale capability cannot mutate a cart; GET rotates to a fresh empty cart. |
| 4 | Authenticated ownership | Current authenticated user determines ownership; one active persistent cart across sessions/devices. Logout preserves it. No caller user/cart ID accepted, no staff ownership bypass; approved current-identity and staff MFA gates remain. |
| 5 | Merge behavior | Atomic duplicate summing with user/account/guest row locks. Stock conflicts preserve requested quantity and offer explicit reduction. Hard quantity/line overflow preserves both complete carts and capability for correction/retry. Retired source cannot merge twice. Registration/login flows tested. |
| 6 | Pricing strategy | Current catalog NGN integer kobo, checked exact multiply/sum, decimal-string JSON. Every response reprices; browser monetary fields rejected. Subtotal includes AVAILABLE lines only, clearly labeled partial when review is required. No tax/shipping/order totals. |
| 7 | Inventory interaction | Read-only Inventory service availability projection; no reserve/release/consume or stock/ledger mutation from cart actions. Existing approved inventory contract and concurrency behavior retained. |
| 8 | Revalidation strategy | Every read/mutation resolves current catalog, options/media, price and stock. AVAILABLE, QUANTITY_REVIEW, OUT_OF_STOCK, UNAVAILABLE, AMOUNT_REVIEW preserve unresolved rows. Archived details are not leaked. Version conflicts require refresh; retries do not double-add. |
| 9 | API endpoints | GET /api/v1/cart; POST /api/v1/cart/items; PATCH and DELETE /api/v1/cart/items/{id}; DELETE /api/v1/cart. Strict allowlists, integer/version validation, CSRF/origin, ownership, rate limiting and private no-store conventions. |
| 10 | Frontend cart UI | Product-detail Add to cart, selected variant/options/media, current prices and line totals, quantity/update/remove/clear, explicit reduction acceptance, error/empty/loading/merge states, responsive summary. Checkout stays disabled and explanatory. Approved brand retained. |
| 11 | Cart badge | Server-confirmed quantity sum, guest/account support, mutation/identity/focus refresh, full accessible count and visual 99+ cap. No localStorage authority or blind retry. |
| 12 | Accessibility | Labeled controls, associated errors/states, live announcements, semantic list/summary, stable input focus and heading focus after removal. Axe/component checks pass. Real Chrome Tab/input focus, 2px visible outline, Space-key removal/heading recovery, 44px controls, reduced-motion zero transition and CSS 200% reflow verified. Native screen-reader and physical-device testing not performed. |
| 13 | Backend tests/results | Full unfiltered PostgreSQL regression: **108 tests / 2,149 assertions pass**. New cart coverage: 15 tests / 369 assertions including exact money and a real two-process same-version race. Pint and level-8 Larastan pass; Composer validate --strict passes. |
| 14 | Frontend tests/results | Clean lockfile npm ci; lint, full formatting, TypeScript and **91 Vitest tests in 11 files pass**. Final default Turbopack production build passes with /cart. Tests/format/build rerun after the small browser-discovered CSS fix. |
| 15 | Integration results | Existing auth/MFA/RBAC/catalog/media/Redis/inventory regressions pass. Browser production-preview flows pass: guest add/update/remove; register merge; logout privacy; login persistent cart plus duplicate merge; external stock/price change and explicit acceptance; product archival retaining unavailable line. Backend integration additionally covers archived variants, out-of-stock, cross-device/user ownership and constraints. |
| 16 | Security findings | No unresolved cart security blocker found in performed checks. IDOR/token guessing, CSRF/origin, mass assignment, disabled identity/MFA, stale versions, exact arithmetic and ownership tested. Private cart IDs/digests omitted; exceptional auth-merge logs contain exception class only. No noisy click audit events. This is implementation verification, not an external penetration test. |
| 17 | Dependency audits | Composer locked audit: no security advisories. npm audit: 0 vulnerabilities. No dependency changes in this phase. Existing approved ESLint 9.39.5 support exception remains under ADR-010. |
| 18 | Architecture deviations | No material deviation requiring a new ADR. Approved A07 reconciliation/defaults documented in architecture register. Quantity review replaces automatic reduction so requested data is retained. Required account expiry field uses a non-expiring sentinel; cleanup explicitly excludes accounts. DELETE /cart is the authorized clear endpoint. |
| 19 | Remaining non-blocking cart decisions | Launch content/media, final privacy retention wording, operational limit tuning, production cookie/domain/limiter/scheduler monitoring. Initial visits show current prices without historical comparison; cross-device freshness occurs on focus/read/mutation rather than push. No unresolved cart-specific implementation gate. |
| 20 | Readiness for Phase 3F Checkout | Cart foundation is ready for approval. Phase 3F still requires explicit authorization and its own tax/rounding, address/rate/quote and order-to-inventory binding decisions. No quote, order, payment, shipping, promotion or abandoned-cart feature was implemented. |

## Executed verification record

Run date: 2026-09-23. PHP 8.5.8, PostgreSQL 18.6, Node 24.14.0/npm 11.9.0 and existing lockfiles. Destructive backend tests used only guarded loopback **iranti_test at port 54320**. The full suite includes fresh/reset/reapply, real PostgreSQL constraints/races, auth/session/MFA, catalog/media, inventory and Redis queue/cache checks. Persistent development data was not reset.

Representative executed commands (backend commands from `backend`, frontend commands from the ignored clean verification copy):

```sh
IRANTI_INFRA_TESTS=1 /opt/homebrew/bin/php vendor/bin/phpunit
/opt/homebrew/bin/php vendor/bin/pint --test
/opt/homebrew/bin/php vendor/bin/phpstan analyse --memory-limit=1G
composer validate --strict
composer audit --locked
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm audit
```

The isolated browser used the actual production Next build on localhost:3030, its same-origin API proxy to Laravel on 127.0.0.1:8030, database sessions, and synthetic catalog/user/stock fixtures in the isolated test DB. No real customer, external email/payment or production credentials were involved. The connected browser tool could not open Chrome; the installed Chrome binary worked through its debugging protocol with a separate ignored profile. Browser work was therefore completed rather than marked passed from DOM tests alone.

| Viewport | Browser measurements | Visual inspection |
|---|---|---|
| 320px | No cart horizontal overflow; quantity buttons/input >=44px | Populated and unavailable cart screenshots inspected; mobile header, wrapping, subtotal and stacked summary readable |
| 375px | No cart horizontal overflow; controls >=44px | Initial populated cart screenshot inspected; usable stacked summary and product/quantity hierarchy |
| 768px | No cart horizontal overflow; controls >=44px | Screenshot inspected; full-width stacked summary and aligned line controls |
| 1024px | No cart horizontal overflow; controls >=44px | Screenshot captured; geometric assertions executed; no separate screenshot-based visual sign-off claimed |
| 1440px | No cart horizontal overflow; controls >=44px | Screenshot inspected; separate line/summary columns and retained branded header/footer |

Real browser routes exercised: product detail fixture, /cart, /register, /login and /account. Existing browse/variant selection and admin regressions are covered by the full tests; this phase did not repeat the closed Phase 3C.5 all-route human review. Native page zoom was not driven; the 200% check used CSS zoom/reflow. Screen-reader announcements are implemented/tested as DOM semantics, not certified by a live screen-reader session.

Browser findings: a narrow unavailable-image placeholder clipped its text. A cart-scoped CSS rule now constrains width, removes square aspect forcing and permits text wrapping with smaller padding. The rebuilt 320px screenshot was inspected again: the placeholder client/scroll sizes both measure 64×80px and the page has no horizontal overflow. No brand redesign or business-logic change was needed. The first logout automation navigated before its asynchronous action completed; waiting for the actual sign-out redirect passed without an application change. Space-key removal and focus recovery passed; the first Enter-key protocol attempt did not activate the button and is not recorded as an application pass.

Cart verification artifacts are ignored under `.runtime/cart-verification/`; synthetic browser services/profile are separate from daily development. Task-owned preview/backend/Chrome/test-PostgreSQL processes are stopped after verification. Pre-existing development PostgreSQL, Redis and application processes are retained.

## Approval boundary

The user-approved cart policies are resolved. Remaining content, production configuration and later-phase financial/fulfillment decisions do not block this cart baseline. Checkout must not trust a previously viewed cart's prices/availability and must bind real order ownership to the approved inventory reference/generation model when separately authorized.

**PHASE 3E READY FOR APPROVAL**
