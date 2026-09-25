# PHASE 3H PAYMENTS REPORT

**Client disposition — 2026-09-24: formally APPROVED as the implementation baseline.** External Paystack test-account verification remains a production/UAT gate and does not block the explicitly authorized Phase 3I. The report below preserves Phase 3H completion evidence; its historical phase-boundary statements are superseded by this approval.

Implementation baseline **v1.0 — 2026-09-23**. Phase 3G is formally approved. Scope is payments only; approved brand, cart retention, commercial snapshots, original hold timing, guest access and pre-payment cancellation rules are preserved. Phase 3I has not begun.

## Implementation record

| # | Required item | Result |
| --- | --- | --- |
| 1 | Migrations | `2026_09_23_000011_create_payments`: payment-owned tables plus narrowly extended order state/history guards. Additively applied to persistent `iranti_local`; no development reset or sample data. Fresh/reset/reapply tests use only isolated `iranti_test` at port 54320. Populated financial rollback fails closed. |
| 2 | Payment schema | UUID attempts, receipts, durable webhook inbox, append-only observations and internal events; real/composite FKs, exact bigint money, string transaction IDs, unique reference/idempotency/receipt identity, partial active-intent/applied-receipt uniqueness. |
| 3 | Internal states | Attempt INITIALIZING/PENDING/UNKNOWN/SUCCEEDED/FAILED/ABANDONED/REQUIRES_REVIEW. Separate order summary NOT_STARTED/PENDING/SUCCESSFUL/FAILED/ABANDONED/REQUIRES_REVIEW. Unknown is never an inferred failure. |
| 4 | Provider abstraction | `PaymentGateway` contract and neutral `Verification` observations. OrderService accepts neutral lifecycle updates and has no Paystack client dependency. |
| 5 | Paystack adapter | Hosted initialization, fixed HTTPS server verification, status normalization, raw HMAC authentication; exact unsigned transaction-ID handling; bounded HTTP timeouts; no initialize POST retry; strict hosted URL validation; only necessary financial fields retained. |
| 6 | Initialization | Owned/scoped order, active original reservation, positive immutable NGN total, ready configuration and eligible state. Persist intent before network I/O. Browser supplies method only; server derives reference/amount/currency/email/callback. UUID key replays the same intent; conflicting method returns 409. |
| 7 | Verification | Stored reference only; ownership precedes provider access. Verify reference, amount, currency, environment and channel. Browser query-string success never establishes payment. API, worker and owner action share one finalizer. |
| 8 | Webhook validation | Exact POST ingress before body transforms/session middleware. 256 KiB cap; constant-time HMAC-SHA512 raw-body validation before trusted parse. Browser CSRF remains enforced elsewhere. |
| 9 | Inbox/idempotency | Commit minimal normalized event/checksum before 200; DB failure does not acknowledge success. Exact payload duplicates reuse inbox row; receipt/event uniqueness protects business effects even for differently encoded repeated deliveries. Fenced leases and bounded retries recover worker failures. |
| 10 | Finalization transaction | Provider-transaction serialization → order/attempt locks → existing inventory locks. Receipt application, stock consumption, PAID transition, history, audit and unique internal success event commit atomically. Network calls occur outside those locks. |
| 11 | Inventory consumption | Sole writer remains `InventoryService::consume`; database-clock expiry is checked after stock locks. No balance-column writes, duplicate hold, extension or automatic reacquisition. |
| 12 | Order transition | PENDING_PAYMENT → PAID only after verified receipt and committed hold; never PROCESSING. Anomaly/late payment may move pending order to PAYMENT_REVIEW. CANCELLED and existing PAID milestones are retained. |
| 13 | Retry | Provider-confirmed failed/abandoned attempt is retained; fresh attempt/reference against the same eligible order and unchanged hold. Any unresolved active intent blocks a fresh attempt. Cancellation stays blocked once payment activity exists. |
| 14 | Late/extra money | Unapplied verified receipt plus review/financial hold; no fulfillment, silent loss of evidence, manual paid toggle or automatic refund. Colliding provider identity remains observation evidence without stealing an existing receipt. |
| 15 | Bank transfer | Paystack-hosted `bank_transfer` channel through the same abstraction, verified like card. Outgoing transfer events quarantined; no manual proof upload or bank-account workflow. Merchant channel availability remains external acceptance work. |
| 16 | Reconciliation | Minute scheduler, bounded due scans, Redis jobs, inline recovery command, fenced verification/inbox leases, backoff/jitter/Retry-After and 12-check automatic budget. Owner can reverify; exhaustion and exceptions emit safe warnings. |
| 17 | Customer UI | Method selection, guarded hosted redirect, owned return verification, pending/success/failure/review text, explicit recheck/retry and safe attempt history on order detail. Payment confirmed does not claim shipment. |
| 18 | Admin UI | `/admin/payments`: owner/MFA access, references, exact amounts, channel, timestamps, receipts, checks, review reason and history; provider reverify only. Order Processing staff retain paid/pending summary; no detailed provider evidence. |
| 19 | Backend tests | Final full-suite result recorded below. Coverage spans auth/MFA, catalog, inventory, cart, checkout, orders, payment APIs, adapter, inbox, retry, late/extra money, scheduler and real Redis payment-job execution. |
| 20 | PostgreSQL concurrency | All five required races exercised with separate processes/connections: browser vs webhook; duplicate webhooks; competing initialization; retry vs previous late success; expiry vs verified payment. Assertions cover one applied receipt, one stock sale, one PAID/history/success event, or preserved unapplied review evidence. |
| 21 | Frontend tests | Clean isolated npm install; **131 tests in 15 files passed**. Payment tests cover server-only amounts, stable retry key, return query distrust, pending/review/success gating, failed/abandoned retry, keyboard error focus, unsafe URL rejection and owner/staff visibility. |
| 22 | Responsive QA | Chrome rendered selection, pending, failure/retry, success, review and owner views at **320/375/768/1024/1440**. No horizontal overflow in final checks; controls at least 44px high. Long references wrap. Real keyboard focus, reduced motion, zoom and accessibility checks described below. |
| 23 | Provider integration | Signed fixtures, official-response HTTP fixtures, real Laravel/PostgreSQL/Redis integration and isolated Chrome hosted redirect/return harness passed. **Actual external Paystack test-account flows NOT VERIFIED:** no configured test key. **LIVE PROVIDER WEBHOOK DELIVERY NOT VERIFIED.** No real-money/live credential use. |
| 24 | Security findings | Tampering, CSRF/origin, ownership/guessing, invalid/raw-byte signatures, replay, collisions, expired/cancelled/paid eligibility and late/extra money covered. Raw card/customer authorization payload discarded; hosted URL encrypted. Application source/client bundle literal-secret scan passed. No unresolved application defect found within this review; not a penetration-test certification. |
| 25 | Dependency audits | Composer strict validation passed; locked Composer audit no advisories. npm production and full audits zero vulnerabilities. No dependency versions changed in Phase 3H. Existing approved ESLint 9 lifecycle exception remains historical project context. |
| 26 | Architecture deviations | No material policy deviation or new ADR. Order-scoped verify URL preserves existing guest-cookie path. Minimal normalized inbox replaces raw payload retention per approved data minimization. Durable internal payment-event journal continues the staged event approach; notification/shipping consumers remain absent. |
| 27 | Remaining inputs | Private merchant test keys; hosted card/transfer acceptance; approved production API/frontend origins and dashboard webhook; live activation approval; named alert recipient/response coverage; approved exception/refund resolution and guest email recovery later. These do not prevent implementation review but gate relevant production operations. |
| 28 | Phase 3I readiness | Payment foundation is ready to review for phase approval, subject to the explicit external-provider limitation. This report does not authorize shipping implementation or production payment activation. Phase 3I requires its own instruction. |

## Verification evidence

Evidence is retained locally under ignored `.runtime/payment-verification/`; no runtime file or synthetic secret is intended for commit.

| Check | Executed result |
| --- | --- |
| Full PHP 8.5/PostgreSQL regression | PASS — **158 tests, 3,590 assertions**, including 19 payment integration/security/concurrency tests and a real Redis worker payment job |
| Empty migration rollback/reapply; populated financial rollback refusal | PASS |
| Pint | PASS |
| Level-8 Larastan | PASS, no errors (768 MiB analysis limit) |
| Composer validate --strict / audit --locked | PASS / no advisories |
| Clean npm ci | PASS, ignored isolated copy of frontend |
| ESLint / Prettier / TypeScript | PASS |
| Vitest | PASS — 131 tests, 15 files |
| Next.js production build | PASS after final UI corrections |
| npm audit production / full | PASS — zero vulnerabilities |
| Test key availability | Absent; inspected without printing any secret |
| Real provider initialize/callback/verify/card/transfer | NOT VERIFIED |
| Real externally delivered webhook | LIVE PROVIDER WEBHOOK DELIVERY NOT VERIFIED |

The first regression rounds found and corrected test-fixture isolation, fractional due-time comparison and empty-schema rollback behavior. Only the final successful runs are listed as PASS. No skipped/unexecuted external exercise is counted as a success.

### Browser and accessibility evidence

Chrome CDP used an isolated profile and production frontend at port 3030, Laravel at 8030, PostgreSQL `iranti_test` at 54320, synthetic owner TOTP and server-side HTTP fixtures. Hosted requests were intercepted by the QA harness; no Paystack network payment occurred. The ignored router/harness is not application source or a deployable fake-payment feature.

- Six principal states/views × five widths = **30 route/state layout combinations** measured and captured. Success/review and all admin widths were rechecked after affected changes. Representative full-page screenshots were visually inspected across all five widths, plus mobile/desktop admin and corrected zoom screenshots.
- A real guest cart → checkout → reservation → order → bank-transfer selection → intercepted hosted redirect → pending callback → provider-declared failure → fresh same-order retry → verified card success completed. A separate mismatched success displayed retained review evidence without fulfillment. Owner password/TOTP, history and provider reverify were exercised.
- Tab navigation showed a visible 2px solid outline, logical passage through payment controls and no focus trap. Text labels and live status/error regions distinguish outcomes without color. No payment modal/drawer was added, so payment-specific ESC/focus-trap behavior is not applicable.
- Browser axe WCAG 2 A/AA and 2.1 AA scans on success, review and admin pages reported **zero violations and zero incomplete checks**, including browser contrast checks. This is not a screen-reader usability certification.
- Reduced-motion emulation produced zero transition duration for the inspected control. **200% CSS zoom** at 768px passed after the container fix. Native browser menu zoom, native assistive technology and external Paystack-hosted accessibility were not separately certified.

Discovered UI/integration defects fixed, then retested:

1. Callback `no-referrer` prevented existing same-origin cookie recognition. Changed only that page to `same-origin`; CSRF/identity rules were not weakened.
2. Verified callback state initially left the parent order header stale. It now refreshes the parent; screenshot confirms PAID and matching payment summary.
3. Owner UI assumed a permissions field not returned by the identity API. It now uses the established authenticated-role presentation contract; backend granular permission/MFA enforcement remains authoritative.
4. Existing order totals cramped under CSS zoom. A container-width rule stacks columns when actual available width shrinks.
5. Adjacent admin actions lacked spacing. A wrapping flex row gives them 12px separation at all five widths.

Remaining client-content dependencies are unchanged: final policies/contact content, licensed brand fonts and real catalog assets where still outstanding. Payment merchant activation and alert ownership are operational dependencies, not invented client content.

## Operational limits and handoff

Persistent development payments remain **disabled** without a privately configured test key. The additive local migration is applied. QA server/browser processes are stopped; the temporary test PostgreSQL cluster is stopped after final checks. Native daily PostgreSQL and Redis services are left running as found. No production database reset, production seed, dependency upgrade, live payment, tunnel publication, commit or deployment was performed.

Read [payments](payments.md), [Paystack setup](paystack.md) and [reconciliation](payment-reconciliation.md) for API/schema details and exact operating commands. Merchant test acceptance and monitored production readiness must be completed before live activation. Financial exception resolution/refunds and guest email recovery remain explicitly deferred.

**PHASE 3H READY FOR APPROVAL**
