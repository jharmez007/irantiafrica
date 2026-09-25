# IRANTI Africa — Non-functional requirements

**Phase 1 baseline v1.0 — 2026-09-20. Status: PHASE 1 READY FOR APPROVAL; approval pending.** Sources and detailed status are recorded below.

## Client-confirmed targets and constraints

| Evidence | Classification | Meaning and limit |
|---|---|---|
| Initial catalog 20–50 products (S2:I2) | CONFIRMED REQUIREMENT / CLIENT-CONFIRMED TARGET | Initial product count, not variant count, throughput or growth ceiling. |
| 2–3 staff originally estimated (S2:AK2); three role categories now confirmed (S4:V2–W2) | CONFIRMED REQUIREMENT / CLIENT-CONFIRMED TARGET | Role categories are not staff headcount or shopper concurrency. Job-restricted access is required. |
| 1 November 2026 (S2:AX2; S4:AJ2–AK2) | PREFERRED / NON-BINDING TARGET | Explicitly flexible and not linked to an event/campaign. Not a contractual delivery or service-level commitment. |
| Nigeria delivery and NGN (S2:V2–W2) | CONFIRMED REQUIREMENT | Launch market/currency context, not a data-residency or legal-compliance determination. |
| Africa expansion much later (S2:BC2) | CONFIRMED REQUIREMENT — future direction | Preserve future adaptability; no countries, traffic forecasts or multicurrency launch commitment. |

No client-confirmed numeric performance, availability, accessibility-conformance, backup, recovery or monitoring targets were supplied. Prior engineering targets remain proposals.

## Quality requirements

| ID | Classification / source | Requirement | Verification and open decisions |
|---|---|---|---|
| NFR01 | CONFIRMED REQUIREMENT — S1 | Secure defaults, least privilege, authorization, validation, secret protection and transaction safety. Complete preimplementation threat assessment in Phase 6. | Test IDOR/cross-customer access, injection/XSS/CSRF, authentication/session abuse, mass assignment, upload risks and tampering. S4:V2–W2 confirms three roles and job-restricted access; the matrix in document 02 is an ENGINEERING RECOMMENDATION requiring review (Q13). |
| NFR02 | CONFIRMED REQUIREMENT — S1; S2:N2 | Independently verify payments, authenticate webhooks, prevent replay/duplicate effects and overselling; no out-of-stock ordering. | Negative/concurrency tests: forged, repeated and reordered events; retries; final-unit races. Automatic gateway transfer confirmation, reservation during payment and same-order retry are confirmed by S4:K2–M2. Timeout/release, late success and retry races remain Q04/Q10. |
| NFR03 | CONFIRMED REQUIREMENT — S1 | Store no card details; log no passwords, secrets, access tokens, payment credentials or unnecessary personal information. | Inspect representative data/logs and define safe provider metadata; retention/redaction decisions Q20. |
| NFR04 | CONFIRMED REQUIREMENT — S1 | Mobile-first, responsive, accessible storefront/admin with semantic HTML and progressive enhancement where appropriate. | Manual keyboard/focus/screen-reader and small-screen journey checks plus automated checks. Exact conformance/browser matrix is proposed, not client-approved. |
| NFR05 | CONFIRMED REQUIREMENT — S1 | Set measurable performance/capacity targets; efficient queries, pagination, images, caching/CDN and background processing where appropriate. | S2 gives 20–50 products but no customer/order/traffic peaks. Approve load profile and measurement conditions Q18/Q19 before capacity claims. |
| NFR06 | CONFIRMED REQUIREMENT — S1 | Structured observability for APIs, payments, webhooks, queues, authentication, checkout and stock discrepancies. | Controlled faults must be diagnosable without secrets. Assign alerts, incident response and coverage Q22. |
| NFR07 | CONFIRMED REQUIREMENT — S1 | Document backups, recovery and deployment; production releases require successful mandatory checks. | Timed restore evidence and service availability checks against approved targets. Hosting is absent (S2:AT2); backup scope, ownership and budget Q19/Q22. |
| NFR08 | CONFIRMED REQUIREMENT — S1 | Maintainable, testable boundaries; appropriate SOLID/DRY/KISS; modular-monolith preference without unnecessary abstractions. | Review significant decisions in later architecture, verify compatibility Q23. No architecture selected in this update. |
| NFR09 | CONFIRMED REQUIREMENT — S1; S2:BC2 | API-first future integration readiness and gateway portability; avoid coupling order rules to one provider. | Later contract/review evidence. Africa expansion is future discovery, not current multicurrency or international logistics scope. |
| NFR10 | CONFIRMED REQUIREMENT — S1 | Referential integrity, historical order snapshots, safe money and inventory consistency. | Test rollback, retries, concurrency, catalog edits and rounding using approved business examples Q04–Q07. |
| NFR11 | CONFIRMED REQUIREMENT — S1 | Backend unit/feature/API, frontend unit/component/integration and key E2E coverage, including negative paths. | Guest purchase, tracking number/link, reservation/retry, zero-stock hiding, same-day returns and three-role authorization need coverage. V1 coverage includes accounts, saved addresses, order history and basic sales/order/stock reports (S6/Q29). Wishlist, reorder, marketing/cart reminders, reviews, bulk discounts and advanced reporting receive tests in their later release. |
| NFR12 | CONFIRMED REQUIREMENT — S1 | PR checks: backend dependency install, Pint/formatting, static analysis and tests; frontend dependency install, lint, strict TypeScript, tests and production build. | Confirm exact supported toolchain Q23. No checks/pipeline are implemented in Phase 1. |
| NFR13 | CONFIRMED REQUIREMENT — S1/S5 | Maintain requirements and later architecture/API/database/security/testing/deployment/operations/ADR documentation. | The seven Phase 1 baseline documents remain maintained; this update resolves Q29/Q30 without creating architecture or implementation. Later setup, payment/webhook, recovery and troubleshooting docs follow approved phases. |
| NFR14 | OPEN QUESTION — Q07/Q20 | Applicable privacy, tax, consumer, accessibility, residency, retention/deletion, consent and incident obligations need client/legal validation. Tax addition/separate presentation is confirmed (S4:I2–J2); rates and treatment are not. | Nigeria is business context, not sufficient evidence to invent policy or assert compliance. S4:AG2–AI2 assigns policy drafting to the developer; S5 requires client/legal approval before production. Drafting is not legal advice or approval. |
| NFR15 | CONFIRMED REQUIREMENT — S1; S4:V2–W2 | Audit critical changes with attributable actor/action context and restrict audit access. | Verify denied permission changes and attributable approved changes; define event list, audit retention and tamper protection Q13/Q20. |
| NFR16 | CONFIRMED REQUIREMENT — S1 | SEO baseline from FR-SEO-001. | Verify public product metadata/indexability and private content protection. Domain exists, but analytics, language and indexing decisions remain Q21. |
| NFR17 | CONFIRMED REQUIREMENT — S2:AH2, AJ2 | Minimal, premium/luxury, elegant, corporate presentation with attention to layout and checkout. | Review against approved brand assets and later UX acceptance; exact reference URLs remain Q33. No design work in this phase. |

## Proposed measurable targets

Every entry below is **ENGINEERING RECOMMENDATION / PROPOSED ENGINEERING TARGET**. None is client-approved. Preserve these proposals for explicit acceptance, modification or rejection under Q19/Q22; do not silently promote them to acceptance gates.

| Target | Proposed criterion | Measurement conditions still required |
|---|---|---|
| Customer experience | Mobile field p75 LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 on main catalog/product pages. | Nigerian customer network/device profile and observation window. Prelaunch lab evidence is provisional, not field evidence. |
| API response | p95 catalog reads ≤500 ms; internal checkout processing ≤1 s in a representative 30-minute load test. | Concurrent load, dataset/variants, cache state and error-rate threshold. Report provider latency separately and end-to-end purchase latency as well. |
| Availability | 99.9% monthly browsing and purchase-initiation availability. | External checks, exact service boundary, downtime policy, provider failures and operational budget. |
| Recovery | Critical commerce-data RPO ≤15 minutes, RTO ≤4 hours; restore drill before launch and quarterly. | Database/media/config coverage, retention, ownership, recovery order and payment reconciliation. |
| Accessibility | WCAG 2.2 AA target; automated plus manual keyboard/focus/contrast/screen-reader checks. | Approved conformance scope and assistive-technology/browser test matrix. |
| Browser/device support | Current and previous stable major versions of Chrome, Safari, Edge and Firefox at release; Android Chrome and iOS Safari; core layouts from 320 px through desktop. | Actual supported versions recorded at release, customer devices and representative testing budget. No versions verified here. |
| Detection | Alert on agreed repeated payment/webhook failures and stalled queues within 5 minutes of threshold breach. | Failure thresholds, monitoring location, response owner and staffed hours. |
| Security release gate | No unresolved critical/high findings without named, time-bound risk acceptance. | Severity method, risk owner and exception process. |

**ENGINEERING RECOMMENDATION:** Require recoverable orders even when email fails; observable pending states during provider outages; safe handling of late payment after stock expiry; backup access controls and tested restores. The technical mechanisms belong to later architecture/security phases.

**OPEN QUESTION:** Customer/variant/media counts, daily/peak orders, concurrent checkouts, growth horizon and support budget remain Q18/Q22. Initial catalog size and the desired launch date do not justify a throughput or availability guarantee.

## Completion gates and ownership

**DEVELOPER RESPONSIBILITY:** Propose and validate measurable targets with a representative load/data profile during approved architecture/testing planning; research exact runtime compatibility later. **CLIENT RESPONSIBILITY:** Review cost/service tradeoffs and approve required policy content. Quantitative targets above remain unapproved.

**NON-BLOCKING CONFIGURATION DECISIONS:** Q18/Q19 capacity and service targets, Q22 operational budget/ownership, and Q23 supported toolchain may be finalized during architecture before design sign-off or deployment commitments. Initial 20–50 product scale is known; no exceptional load or regulated infrastructure requirement has been asserted. Do not promise performance or choose production infrastructure before those decisions.

**THIRD-PARTY DEPENDENCY:** Gateway onboarding, logistics services, email and hosting must meet agreed operational needs. Absence of a selected logistics provider alone does not block Phase 2; Q30 is now resolved by S6: no additional first-version business-system integration is required. Existing operational dependencies and future integration-readiness goals remain unchanged.

**OPEN QUESTION — policy/design decisions before affected development:** Retention/access and consent Q20; permissions/MFA Q13; return timing Q26; stock visibility/release Q04. These are required inputs to later reviews, not authority to invent rules or reasons to hold up all discovery work.
