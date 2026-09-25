# 30 — Test strategy and release gates
Trace: NFR02/04/05/11/12 and Phase 1 stories. Tests are planned, not executed. Prioritize money, stock, access and recoverability over arbitrary coverage percentage.

| Layer | Coverage | Tool / environment |
|---|---|---|
| Unit | Money/rounding allocations, tax examples, return-clock boundaries, allowed states, option signatures | PHPUnit and Vitest pure functions |
| Backend feature/API | Auth/CSRF, validation, permissions/ownership, response schemas/idempotency | Laravel tests on PostgreSQL |
| Integration | Real DB constraints/locks/outbox, Redis queue recovery, storage/mail/provider adapters | Isolated PostgreSQL/Redis; provider sandbox/contract fixtures |
| Frontend component | Forms, errors, variant selection, cart pending states, keyboard/focus | Vitest + compatible Testing Library |
| E2E | Server-rendered catalog, guest/account checkout, history/returns/admin flows | Playwright against production build/staging |
| Security | IDOR, denied matrix, mass assignment, XSS/CSRF, upload abuse, replay, secret/log leakage | Automated negative cases + manual review |
| Performance/recovery | Agreed load profile, contention, dependency outages, restore drills | Representative environment, controlled fault injection |

## Required critical journeys
- US-C01/C02/C03: simple/variant selection, unavailable stock hidden/unbuyable, server price/tax/shipping changes require review, cart update/merge.
- US-G01/R01: guest purchase without account; registration/login/reset/verification; saved addresses and authorized history; cross-user access denied.
- US-C04: order+reservation atomicity; card and automatic transfer verification; same-order retry; redirect forgery; wrong amount/currency/reference; duplicate/out-of-order webhook; no stock/notification duplication.
- US-C05/O01: accurate order/payment confirmations, authorized state progression, tracking URL safety, staff job restrictions.
- US-G02/R04/A06: guest/account returns; same-day cutoff using approved anchor/timezone; invalid item/quantity; owner approval; refund budget and uncertain outcome; restock only after approved disposition.
- US-A01/A02/A03/I01: snapshots survive catalog edits, owner-only initial adjustment, audit records, role revocation and denied actions.
- US-A04/A08/C10: exact basic report totals, no advanced scope, monitoring/redaction, backup restore, mobile/keyboard/SEO output.

## Deterministic concurrency and failure cases
Use separate database connections/processes with synchronization barriers, not sequential calls labeled concurrent. Last unit has exactly one winner; multi-line failure leaves no partial hold. Race expiry vs payment, two payment-success consumers, two refund approvals, two stock adjustments and retry vs cancelled order. Assert final ledger/balances/unique constraints, not only HTTP responses.

Crash after order commit before queue dispatch, after webhook persistence before processing, after provider success before local save and after refund send before acknowledgment. Recover from durable records without duplicate charge/refund/stock changes. Redis eviction/loss, DB outage, storage decode error, mail timeout and provider rate limit tests verify safe pending/retry behavior.

Proposed performance targets remain Q19 recommendations: mobile p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1; internal API p95 reads ≤500ms and checkout ≤1s excluding external gateway time, measured over agreed 30-minute profile. Traffic/concurrency and dataset must be approved first; no unsupported scale claim. Accessibility target WCAG 2.2 AA needs automated plus manual evidence; browser matrix respects Tailwind/runtime floors.

Test data contains no real secrets/PII. Money fixtures include multi-item rounding, shipping tax, duplicate receipt and refund. Provider test mode does not prove every live bank-transfer/refund behavior; controlled merchant readiness verification is a production gate. Exit: all required checks pass, critical journeys and security/recovery evidence reviewed, unresolved risks have named approved disposition, client signs UAT.
