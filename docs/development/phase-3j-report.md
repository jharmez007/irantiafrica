# PHASE 3J RETURNS & REFUNDS REPORT

**Subsequent client decision — 2026-09-24:** Phase 3J implementation baseline is formally APPROVED. External Paystack payment/refund verification and return-window/receipt/reverse-shipping production gates remain. The original readiness evidence below is preserved; Phase 3K is separately authorized.

Implementation baseline **v1.0 — 2026-09-24**. Phase 3I is formally approved. Phase 3J implements returns and refunds only; Phase 3K has not begun. This report records implementation readiness for client approval; it does not approve the phase on the client’s behalf.

| # | Required item | Implementation / evidence |
| --- | --- | --- |
| 1 | Migrations | `2026_09_24_000013_create_returns_and_refunds`: additive Phase 3J tables, historical order-item composite uniqueness, guarded rollback once operational evidence exists. Isolated PostgreSQL fresh-migration coverage; additively applied to persistent `iranti_local` without resetting or seeding it. |
| 2 | Return schema | Immutable policy versions; return requests/items; numbered historical unit allocations; history/events; UUID FKs, quantities, active-claim uniqueness and deferred count consistency. |
| 3 | Refund schema | One immutable approved intent per return; one provider creation attempt; append-only observations; provider ID uniqueness, captured-budget guard, original payment/order/return linkage. |
| 4 | Eligibility | Owning account or scoped guest, delivered order, configured open window, same-order historical lines, valid positive quantities and remaining unclaimed units. |
| 5 | Window | No production semantics inferred. Default unconfigured/fail closed; explicit calendar-midnight and elapsed-24-hour modes are supported. Explicit development example: delivery anchor, Africa/Lagos, next local midnight exclusive, receipt required. Production activation requires owner-approved policy. |
| 6 | Reasons | DAMAGED_PRODUCT, WRONG_PRODUCT_DELIVERED, DEFECTIVE_PRODUCT with readable labels. No preference/change-of-mind reasons. |
| 7 | Return states | SUBMITTED / UNDER_REVIEW / APPROVED / REJECTED / RECEIVED / CLOSED. Intent-specific versioned commands; immutable decision/history; no core order status rewrite. |
| 8 | Staff approval | Owner final decisions; Order Processing intake/review/receipt only. Partial approved quantity releases unapproved unit claims. |
| 9 | Receipt/disposition | Explicit all-approved-unit receipt then per-line SALEABLE/DAMAGED/QUARANTINED/DISPOSED inspection. Mixed-disposition/split-receipt extensions are not silently assumed. |
| 10 | Calculation | Historical integer-kobo unit price plus original allocated tax; verified applied payment; no current catalog/tax lookup; no delivery or delivery-tax refund. |
| 11 | Partial allocation | Test allocation 369 + 369 + 368 = 1,106 kobo for three historical units. Claims cannot reuse tax remainders. Multiple requests remain bounded by purchased units and captured amount. |
| 12 | Provider boundary | PaymentGateway refund creation and GET verification; disabled by default; live approval flag; no blind POST replay; identity/mode/amount/reference checks; UNKNOWN retains budget. |
| 13 | Restock | Separate explicit InventoryService operation after receipt and saleable inspection; unique compensating RESTOCK movement; no mutation of original sale; refund completion has no inventory effect. |
| 14 | Customer UI | Existing account order detail: remaining quantities, three reasons, explanation, confirmation/status/history and safe refund amount. |
| 15 | Guest UI | Same form under existing order detail/capability scope; no email/order-number recovery bypass. Existing absolute capability expiry remains. |
| 16 | Admin UI | Paginated return queue, original order link, requester, reason/age/quantities/state, payment/refund totals, history, permitted actions and explicit confirmation forms. |
| 17 | RBAC/MFA | Existing permission matrix unchanged. Staff MFA plus five-minute recent authentication for refund approval, submission and reconciliation. UI password and fresh TOTP reauthentication; server-enforced authorization. |
| 18 | Audit/history | Request/review/decision/receipt/inspection/restock/refund intent/success/failure evidence; append-only histories, versioned transitions, safe normalized observations; no provider secrets/raw payloads. |
| 19 | Notifications | Durable database events commit with changes. Actual email/template delivery remains Phase 3K. |
| 20 | PostgreSQL races | All six required races passed: simultaneous approval, duplicate finalization, restock, approval versus rejection, competing partial refunds, and finalization versus payment reconciliation. One financial/inventory effect per intent. |
| 21 | Backend tests | **180 tests, 4,368 assertions passed**, including all six PostgreSQL races. Added IDOR, guest scope, validation/replay, boundary clock, exact tax, stock, immutable evidence, provider mismatch/fencing, signed event replay and staff/recent-auth tests. |
| 22 | Frontend tests | Clean `npm ci`; 158 tests across 17 files. Returns tests cover selection, partial quantity, reasons, submission, guest status, ineligibility, error focus/retry, admin intents and refund reauthentication. |
| 23 | Responsive QA | Real Chrome production-build review: 45 viewport/state cases across 320, 375, 768, 1024 and 1440 pixels; no horizontal overflow or visible return controls below 44px. Screenshots inspected at all widths. |
| 24 | Accessibility | Native keyboard quantity, Tab order, Enter submission/disclosure, 2px visible focus, labeled fields/error association and textual status checked. Seven axe WCAG scans: zero violations/incomplete checks. 200% CSS zoom has no overflow; reduced motion uses auto scrolling. No new modal/drawer; screen-reader certification/native browser zoom not claimed. |
| 25 | Security | Unknown/mass-assigned financial fields rejected; no client amounts; historical units/receipt/payment enforced; order-scoped capabilities, authenticated owner checks, MFA/recent auth, immutable financial evidence and fenced observations. |
| 26 | Dependency audits | Composer audit and npm audit: no vulnerabilities reported. Approved ESLint 9 exception retained; npm emits its existing end-of-support warning. No dependency/version changes for this phase. |
| 27 | Architecture refinement | ADR-016 documents normalized historical return units, narrow return-policy storage and single safe provider creation attempt. Approved fulfilment/RBAC unchanged. Partial quantities are expressly authorized by Phase 3J. |
| 28 | External verification | **PAYSTACK REFUND PROVIDER FLOW NOT VERIFIED.** Only synthetic HTTP/signed events tested. Real test/live credentials and provider outcomes remain UAT/production gates. |
| 29 | Non-blocking policies | Owner must confirm production anchor/timezone/cutoff, receipt requirement, reverse-shipping responsibility/costs and customer policy wording. Delivery refunds disabled. Failed/ambiguous provider operations require investigation; any new retry/split/exchange workflow needs explicit later review. |
| 30 | Readiness | Implementation ready for approval; external provider UAT and production policy activation remain separately documented gates. Phase 3K not started. |

## Verification record

- Backend: full PHPUnit **180 tests / 4,368 assertions**; fresh migrations and auth/MFA, catalog, inventory, cart, checkout, orders, payments, fulfilment, returns/refunds/restock regression passed. All six required forked PostgreSQL races passed.
- Frontend: clean npm installation; lint, Prettier, TypeScript, **158 tests / 17 files**, and production build passed after the browser-discovered fixes.
- Static checks: Pint and level-8 Larastan passed with no errors.
- Audits: Composer validate and Composer audit passed; npm audit reports zero vulnerabilities. Existing ESLint support warning/approved exception retained.
- Persistent local database: migration 000013 applied additively; no local data reset or demo policy insertion.
- Cleanup: owned Chrome, Laravel 8030, Next.js 3030 and isolated PostgreSQL 54320 stopped. Persistent Homebrew PostgreSQL 5432 and native Redis instances were left running. Synthetic browser image removed; ignored test evidence retained.


Evidence files are ignored under `.runtime/returns-verification/`. Destructive test/QA fixtures use only `iranti_test` at loopback port 54320. Real provider credentials are neither required nor used. Browser QA uses a production build and synthetic fixture responses; it cannot verify Paystack itself.

### Browser evidence and fixes

Routes: `/orders/{guest-order}`, `/account/orders/{account-order}`, `/admin/returns`, with `/login` and staff MFA exercised as prerequisites. Nine states were reviewed at each of the five widths: guest selection, guest submitted status, account selection, admin queue, approval, inspection, refund approval, completed admin refund, completed guest refund.

Chrome completed guest/account partial requests → staff approval → physical receipt → saleable inspection → explicit restock → owner password/fresh-TOTP reauthentication → refund approval → provider submission/fresh-GET completion (synthetic adapter only). Original DELIVERED state remained visible. Staff totals showed original capture, successful refunds, budget held and net collection; the guest saw only its safe refund summary.

Visual review found missing textarea borders and cramped separation from delivery progress; the existing input class and spacing tokens fixed those. Browser integration also found the refund form omitted the existing reauthentication endpoint's required TOTP. The form now accepts password plus a fresh code, reuses the recent-authentication window for subsequent actions, and leaves every authorization check on the server. Frontend tests, lint, formatting, TypeScript and production build were rerun after these fixes and passed.

A final policy-edge review prevented offering inspection before physical receipt when an explicitly approved no-receipt-before-refund policy closes the return early. The dedicated backend test confirms later receipt/inspection/restock can occur while CLOSED remains intact. Guest request audit actors are classified as guest.

The final 1px textarea borders and readable long labels were visually inspected at all five widths. Native keyboard evidence shows quantity → reason → explanation → submit, all with 2px visible focus; history expands with Enter. No additional overlay requires ESC/focus trapping. The native select uses browser behavior. Full-page screenshot captures can show the existing fixed skip link at the captured scroll position; no new floating UI was introduced.

`browser-results.json` records the 45 cases and seven accessibility scans. `final-detail-*.png`, `tab-order.json`, `visual-detail.log`, build/test/audit logs and fixture scripts remain ignored under the verification directory. An early test-only catalog TOTP fixture used a previous interval and intermittently expired at an interval boundary; using the current interval corrected that fixture without changing authentication behavior.

## Operations and remaining responsibilities

Client/owner: approve the production return clock and physical-receipt rule, reverse-shipping terms, policy wording, and real provider refund operational behavior. Developer: configure approved versions, perform real provider UAT with authorized credentials, confirm supported methods/reference round trips, and retain review/runbook evidence. Refund submission stays disabled until intentionally configured. Guest capability recovery remains the previously deferred later security/notification task.

See [returns](returns.md), [refunds](refunds.md) and [ADR-016](../architecture/adr/016-return-unit-allocation.md). No promotion, loyalty, exchange, support-ticket or reverse-logistics integration was introduced.


## Changed areas

- Backend: Phase 3J migration; return policy/service/controller; refund service/provider DTO/configuration; refund queue job/scan; PaymentGateway/Paystack adapter and signed inbox extension; InventoryService restock method; API/scheduler routes and example flags.
- Frontend: customer/guest return panel, staff return queue/actions, shared return API types, admin route/navigation, existing order-page integration and brand-token spacing/input styling.
- Tests: return/refund PostgreSQL and six-race coverage, frontend returns suite; existing inventory phase-boundary assertion, catalog TOTP test fixture and isolated order-panel test mock updated.
- Documentation: return/refund guides, this report, ADR-016 and architecture database/API/return refinements, Phase 3I approval record, README and local setup notes. No dependency upgrades or commerce scope beyond Phase 3J.


**PHASE 3J READY FOR APPROVAL**

This is implementation approval readiness, not authorization to activate production refunds or begin Phase 3K.
