# PHASE 3I SHIPPING & FULFILMENT REPORT

Client status: **FORMALLY APPROVED — 2026-09-24** under the Phase 3J authorization. The report below preserves the Phase 3I completion evidence.

Implementation baseline **v1.0 — 2026-09-24**. Phase 3H is formally approved as the implementation baseline; actual external Paystack verification remains a separate production/UAT gate. This phase implements manual fulfilment only. The next phase has not begun.

## Implementation record

| # | Required item | Result |
| --- | --- | --- |
| 1 | Migrations | `2026_09_24_000012_create_fulfilment` adds shipment/history/event tables and narrowly extends order lifecycle guards. Additively applied to persistent `iranti_local`; no reset or seeding there. Destructive tests use only guarded `iranti_test` on port 54320. |
| 2 | Shipment schema | UUID/order FK, unique order, neutral carrier label, tracking number/URL, PREPARED/SHIPPED/DELIVERED, recording actor, timestamps, private notes/evidence; composite history FK, immutable histories/events and deferred order/shipment consistency constraints. |
| 3 | V1 assumptions | Client-confirmed one shipment per order. Unique order constraint can be replaced by a later reviewed multi-shipment migration; no partial shipment/warehouse implementation. |
| 4 | Manual operating model | Staff explicitly starts processing, creates/edits the prepared shipment, dispatches and confirms delivery with evidence. Server timestamps are authoritative. |
| 5 | Provider boundary | No selected carrier, fake adapter, SDK or booking integration. Checkout continues to own versioned local rate quoting. Future provider code/reference and status observation adapter can be added without changing customer projections or bypassing fulfilment commands. |
| 6 | Order transitions | PAID → PROCESSING → SHIPPED → DELIVERED only through intent-specific commands. Existing pending/cancelled/review paths retained; no post-payment cancellation/refunds/returns. |
| 7 | Processing | Existing `orders.prepare` permission, MFA, current version, verified applied receipt, COMMITTED reservation and no financial hold. Payment itself still leaves PAID. Processing time, staff history, audit and event commit together. |
| 8 | Dispatch | Requires PROCESSING/PREPARED, saved carrier, tracking number, approved HTTPS URL, current version and no financial hold. Atomic shipment/order SHIPPED plus histories, event and audit. Unsaved UI edits disable dispatch. |
| 9 | Delivery | Existing `delivery.record` permission; shipped order plus required internal staff evidence. Atomic delivery time/status/history/audit/event. A financial issue after dispatch does not erase or prevent recording the delivery fact. |
| 10 | Tracking | Carrier-neutral bounded number, no global uniqueness or authorization role. Exact configured HTTPS host allowlist, no credentials/ports/unsafe schemes or server URL fetching; safe named external customer link. Draft tracking may be absent, dispatch requires both number/link. |
| 11 | RBAC | Existing document 17 grants unchanged: Owner/Order Processing use orders.read/prepare, shipments.record and delivery.record. Inventory staff cannot view/mutate fulfilment or customer addresses. Authentication, staff TOTP, CSRF/origin and throttles retained. |
| 12 | Admin UI | Existing order detail gains the branded Fulfilment section, immutable destination nearby, verified-payment/stock summary, current-state capabilities, draft controls and delivery evidence. Backend capabilities govern action visibility; service enforces authorization/state. |
| 13 | Customer UI | Recorded ordered lifecycle, carrier/tracking and real shipment times only; no invented progress or internal notes. Updated payment text no longer denies an already dispatched/delivered shipment. |
| 14 | Guest access | Same safe view through existing order-scoped capability. No order-number/email access, expiry extension or recovery redesign. Absolute initial capability lifetime and deferred email recovery remain unchanged. |
| 15 | Events/notifications | Durable unique OrderProcessingStarted, ShipmentCreated, OrderShipped, OrderDelivered journal hooks. No notification transport/templates, new email sends or carrier callbacks; those consumers remain future approved work. |
| 16 | Audit/history | Atomic privileged-action audit plus immutable order/shipment history; draft tracking correction context stays private. No request bodies or tracking links are written to application logs. |
| 17 | Idempotency | Repeated completed milestones return current state without duplicate history/audit/events. Identical shipment-create replay returns existing record; conflicting create and stale draft edits return 409. |
| 18 | PostgreSQL concurrency | Separate-process/connection tests cover simultaneous processing, dispatch, delivery, dispatch vs invalid paid cancellation, and draft update vs dispatch. One consistent transition wins; repeated milestones are safe, stale competing edits fail. |
| 19 | Backend tests | Final executed result is recorded below. Coverage includes auth/MFA, catalog, inventory, cart, checkout, orders, payments, fulfilment/tracking, strict states, rollback, audit/history, replay, security and real PostgreSQL races. |
| 20 | Frontend tests | Final executed result below. Fulfilment tests cover capability-gated actions, customer/guest tracking, long/unsafe values, missing tracking, field errors/focus, pending/duplicate submits, unmount safety, refreshed versions, unsaved dispatch guard and delivered state. |
| 21 | Responsive QA | Final Chrome checks cover six states at 320/375/768/1024/1440: admin PAID/PREPARED/SHIPPED/DELIVERED, guest DELIVERED and customer SHIPPED. All 30 geometry checks show no horizontal overflow; visible form/action controls meet 44px minimum height. Long addresses, 148–154-character tracking numbers and 1200+ character URLs exercised. |
| 22 | Accessibility | Real Tab/Enter dispatch, visible 2px focus, live transition feedback, labelled bordered fields and associated validation errors; ordered milestone structure and named safe external link. Four rendered WCAG 2 A/AA/2.1 AA axe scans have zero violations/incomplete results, including contrast. Admin/customer 200% CSS zoom reflow and reduced-motion preference checked. Error-alert focus corrected and retested separately. No claim of a manual screen-reader or native browser-zoom audit. |
| 23 | Security findings | Denied customer/staff mutations, missing MFA, CSRF, cross-account IDOR, missing guest proof, guessed order references, arbitrary status/ownership input, unsafe/unapproved URLs, stale edits and duplicate commands tested. Draft/staff data excluded from customer/guest projection. No unresolved defect identified by these checks; not a penetration-test certification. |
| 24 | Dependency audits | Locked Composer audit: no advisories. npm full dependency audit: zero vulnerabilities. Clean npm ci executed; no dependency versions changed in this phase. Existing approved ESLint 9 lifecycle exception remains. |
| 25 | Architecture deviations | No material deviation/new ADR. Existing PREPARED/SHIPPED/DELIVERED shipment naming, HTTPS/approved-host policy and permissions retained. Intent endpoints supersede conceptual generic PUT/transition paths; physical mappings and staged internal event journal documented in architecture amendments. |
| 26 | Remaining logistics | Client must supply carrier/process, approved tracking hosts, production rates/coverage, tracking handoff/evidence procedure and failed-delivery policy. Existing content/font/photo/policy dependencies remain. No carrier API or delivery operation has been externally verified. |
| 27 | Paystack status | **EXTERNAL PROVIDER VERIFICATION OUTSTANDING.** Synthetic server/provider fixtures do not verify actual initialization, redirect, verification, signed/duplicate webhooks, card/transfer success/failure, callback race or reconciliation with real test credentials. These remain production/UAT payment gates and explicitly do not block this implementation phase. |
| 28 | Next-phase readiness | Await Phase 3I approval. The next phase requires its own instruction; no returns/refunds, promotions, advanced analytics, loyalty or multi-warehouse implementation started. |

## Verification evidence

Ignored local evidence: `.runtime/shipping-verification/`. Runtime logs/screenshots use synthetic identities, addresses, product and provider responses. Neither real Paystack credentials nor carrier network calls were used. Successful fixture settlement still exercises the real Laravel payment service and PostgreSQL inventory/order integration.

| Check | Executed result |
| --- | --- |
| Full PHP 8.5/PostgreSQL regression | PASS — **170 tests / 4,029 assertions**, including all five fulfilment races and late extra-receipt cases |
| New fulfilment suite | PASS — 12 tests / 440 assertions, including all five required races and real payment-service extra-receipt regression for PROCESSING/SHIPPED/DELIVERED |
| Empty migration rollback/reapply and populated rollback refusal | PASS in PostgreSQL regression |
| Persistent local migration | PASS — additive only, `iranti_local` at 127.0.0.1:5432 |
| Pint / Larastan level 8 | PASS / no errors |
| Composer strict validation / locked audit | PASS / no advisories |
| Clean npm ci | PASS; existing ESLint 9 deprecation disclosed by npm |
| Frontend lint / formatting / TypeScript / Vitest | PASS — **147 tests in 16 files** |
| Production build | PASS — clean isolated Next.js production build after the final UI fix |
| npm audit | PASS — zero vulnerabilities, full dependency tree |
| Final Chrome responsive matrix | PASS — 30 state/viewport checks; representative screenshots visually inspected across all five widths |
| Rendered axe WCAG scans | PASS — admin prepared/delivered, guest delivered, customer shipped; no violations or incomplete checks |
| Keyboard dispatch / transition focus | PASS — Tab to dispatch, Enter activates; focus moves to status feedback |
| Validation error / safe tracking | PASS — unapproved host rejected, field associated with focused alert; corrected link saves |
| Zoom / reduced motion | PASS — 200% CSS zoom without horizontal overflow in admin and customer views; reduced-motion media enabled, auto scroll behaviour |
| Simulated owned-order GET failure/retry | PASS — final 375px retest focuses the mounted alert, has no overflow and recovers on Retry |
| Real Paystack test merchant / real logistics provider | NOT VERIFIED — external gates, not implied by local fixtures |

## Defects found and fixed

1. Preserved `paid_at` when later payment review arrives after processing/dispatch/delivery. Real payment-service regression verifies original payment time, one stock sale, retained receipts and unchanged milestone.
2. Added the existing `.input`/`.textarea` styling to the new fulfilment form so fields have visible borders and usable padding.
3. Made successful payment messaging aware of SHIPPED/DELIVERED; it no longer says shipment is unconfirmed after a recorded dispatch.
4. Moved newly mounted order-load error focus to a post-render effect. Browser-injected failure had revealed the earlier microtask could focus before the alert existed.

Additional preventative guards tested: unsaved shipment edits block UI dispatch; fresh backend versions replace stale form values; unmounted requests cannot update another order view; all writes still enforce server version and permission checks.

## Operating limits and responsibilities

- Client/logistics: approve carrier and exact tracking hosts, supply actual rates/coverage, name operational handoff/confirmation owners and confirm failed-delivery/return-to-sender process. Shipment details cannot be corrected after dispatch through this V1 API; a future correction workflow needs reviewed evidence/audit semantics.
- Developer: configure approved values privately, migrate additively, keep least privilege/MFA, verify actual carrier links/process and complete the separate Paystack acceptance gate. Empty carrier host configuration deliberately prevents dispatch.
- Initial guest order access remains 24 hours without renewal. Email recovery is explicitly deferred, so later delivery tracking requires the existing authorized account/grant or staff support process until that task is approved.
- Optional shipping notification triggers/templates, email delivery, exceptional financial resolution and post-payment cancellation/refunds remain later phases. Durable hooks do not claim external delivery.
- Existing client content/licensed webfonts, real catalog imagery/text, final contact/policy copy and production tax/rate configuration remain unchanged external acceptance dependencies.
- Browser QA used Chrome/CDP and CSS zoom; VoiceOver/NVDA, real carrier pages and native browser zoom were not tested. No new modal/drawer was introduced.

## Final disposition

The final PHP regression passed with 170 tests / 4,029 assertions; the frontend passed 147 tests / 16 files and its production build after the final UI correction. Pint, level-8 Larastan, lint, formatting, TypeScript, strict Composer validation and dependency audits passed. No unresolved implementation or visual blocker remains from this review.

Owned QA Chrome (9227), Laravel (8030), Next.js (3030) and test PostgreSQL (54320) were stopped and their ports verified closed. The generated browser placeholder image was removed. Existing native development PostgreSQL (5432), Redis and user-owned development processes were left running as found. Runtime evidence stays ignored; no runtime file, test key or generated QA order is committed to the persistent development database.

**PHASE 3I READY FOR APPROVAL**

This is implementation readiness, not production logistics or Paystack acceptance. The next phase has not begun.

