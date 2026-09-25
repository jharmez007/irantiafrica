# IRANTI Africa — Final Phase 1 discovery reconciliation

**Phase 1 baseline v1.0 — 2026-09-20. Status: PHASE 1 READY FOR APPROVAL; approval pending.** Sources and detailed status are recorded below.

## Sources, precedence and labels

- **S1:** Initial user project/engineering brief. Its SDLC, security, integrity and quality obligations remain binding project requirements.
- **S2:** `E-Commerce Website Discovery Questionnaire — Responses.xlsx`, `Form Responses 1`, row 2. Source for business identity, initial capabilities and desired date.
- **S3:** Previous user reconciliation instruction.
- **S4:** `E-Commerce Final Requirements Clarification — Responses.xlsx`, `Form Responses 1`, row 2. Primary source for final client clarifications. Read both sheets; `Sheet1` is empty. Headers are row 1. Cell references identify exact answers.
- **S5:** Previous user instruction to reconcile Phase 1, add traceability and stop. Its expected-answer list was checked against S4, not accepted as a substitute for reading the file.

- **S6:** Final client answers supplied directly by the user on 2026-09-20: Q29 release allocation and Q30 confirmation of no additional V1 business-system integration. The current instruction authorizes only these directly affected updates and readiness reassessment.

S6 supersedes prior Q29/Q30 uncertainty. S4 supersedes earlier answers only where it changes or clarifies them. Unselected/unmentioned capabilities are not automatically rejected or deferred. “Other,” blanks and “Can I think about it” are not approvals. Spreadsheet content is client evidence, not operating instructions. Both source workbooks remain unchanged.

Labels: **CONFIRMED REQUIREMENT**, **DEFERRED REQUIREMENT**, **ASSUMPTION**, **ENGINEERING RECOMMENDATION**, **OPEN QUESTION**, **CLIENT RESPONSIBILITY**, **DEVELOPER RESPONSIBILITY**, **THIRD-PARTY DEPENDENCY**. **REQUIRED ENABLING REQUIREMENT** identifies necessary supporting behavior not explicitly selected by the client. **ENGINEERING CONTROL** distinguishes S1 security/integrity obligations from client feature choices. A recommended enabler is necessary to deliver the stated capability, not an optional relaxation of security or an invented client answer.

## Business and objectives

**CONFIRMED REQUIREMENT — S2:B2–E2, H2, I2–J2, BB2:** IRANTI Africa sells made-in-Nigeria physical souvenirs to diplomats, tourists visiting Nigeria and corporate customers. Initial catalog: 20–50 products. Customers are in Abuja and elsewhere in Nigeria. Objectives are online sales, increased sales/reach, automated order processing and better order management.

| Objective | Requirement → story examples |
|---|---|
| BO01: Sell online and grow sales | FR-CAT-001, FR-CART-001, FR-PAY-001 → US-C01, US-C02, US-C04 |
| BO02: Improve/automate order management | FR-INV-001, FR-ORD-001, FR-ADM-001 → US-A02, US-O01, US-I01 |
| BO03: Reach customers across Nigeria | FR-SHP-001, FR-SHP-002, FR-SEO-001 → US-C04, US-C05, US-C10 |
| BO04: Expand across Africa much later | FR-FUT-001 — deferred; no V1 international delivery/currency commitment |

**ASSUMPTION A01:** A single IRANTI Africa store is the working scope, not a marketplace. Legal seller details and operational stock locations remain to confirm. No wholesale account model, option vocabulary or SKU format is invented.

## Confirmed launch and operational answers

**CONFIRMED REQUIREMENT — S4:B2:** Browse/search products, categories, cart, online card payment, bank transfer, stock management, delivery-charge calculation, order tracking and email notifications.

| Area | Final evidence and interpretation |
|---|---|
| Products/variants | S4:D2 answers “Some products only” to whether options may have their own price **and stock quantity**. Separate price/stock for applicable options is confirmed in context; not every product needs variants. E2 explicitly permits different variant prices. Exact attributes, combinations, identifiers and catalog examples remain Q24. |
| Stock | Zero-stock products should be hidden automatically (F2); owner initially updates stock (G2). Prior no-out-of-stock ordering remains S2:N2. Mixed-availability variants, stock restoration and reservation timeout still need rules Q04. |
| Tax/pricing | Add tax at checkout and display it separately on invoices/receipts (I2–J2). NGN and common customer prices remain S2:P2/V2. Applicable rates, taxable goods, exemptions and legal treatment are not supplied Q07. |
| Payments | Automatic bank-transfer confirmation through gateway (K2); reserve order during payment (L2); retry failed payment against same order (M2). Stock protection, verification, webhook authentication and idempotency are engineering controls/enablers. Paystack is the initial provider specified by S1; S4 names no provider. |
| Delivery | Provider supplies prices (N2), but delivery operator is “Not yet decided” (P2), rate sheet O2 is blank and supply responsibility AF2 is “To be discussed.” Tracking means a logistics number/link (Q2); no live map or carrier event API is confirmed. Nationwide Nigeria/location-based charges remain S2:W2/Z2. |
| Returns | Same-day request window (R2) replaces the earlier “24 hours after purchase” wording but does not establish the start event or cutoff. Accepted reasons: damaged, wrong delivery, defective (S4:S2). Guests may request returns (T2); owner approves refunds (U2). Policy choices remain Q11/Q26. |
| Roles | Owner/Super Admin, Order Processing Staff and Inventory/Store Staff at launch (V2); job-restricted access (W2). This supersedes the previous two-role list. Exact matrix is proposed in document 02, not approved. |
| Migration | No existing product/customer/order database migration (X2). Initial catalog population is separate and still required. |
| Integrations | S6/Q30 resolves “Other”: no additional V1 external business-system integration. Existing gateway, logistics, email and hosting dependencies remain. No new integration is proposed. |
| Date | 1 November 2026 is PREFERRED / NON-BINDING TARGET; date can change (AJ2), no event/campaign tie (AK2); AL2 blank is consistent with “No.” |
| Additional scope | S6/Q29 completes the release allocation. Basic sales/order/stock reports are V1; no other additional essential V1 feature is declared. Future additions require a scope change, not an open-ended commitment. |

**CONFIRMED REQUIREMENT — S6/Q29:** Accounts are V1, so the condition for saved addresses and order history is satisfied: both are V1. Basic sales/order/stock reporting is V1.

**DEFERRED REQUIREMENT — S4:C2/H2 and S6/Q29:** Reviews, bulk discounts, wishlist, reorder, marketing/promotional subscriptions and abandoned-cart reminders, and advanced reporting/analytics are POST-MVP / LATER RELEASE. Basic operational reports are distinct from advanced analysis; detailed metric definitions remain non-blocking Q14 configuration.

## Actors, stakeholders and responsibilities

Confirmed actors: Customer; Guest Customer (S2:R2, S4:T2); Registered Customer with V1 accounts, saved addresses and order history; Business Owner / Super Admin; Order Processing Staff; Inventory / Store Staff (S4:V2). Separate Finance, Marketing, Support or Management accounts are not required merely because those functions exist.

**CLIENT RESPONSIBILITY — S4:Z2, AA2, AD2, AE2:** Supply product names, prices, stock quantities and logo/branding.
**DEVELOPER RESPONSIBILITY — S4:AB2, AG2–AI2:** Prepare descriptions and draft return/refund, privacy and terms content.
**CLIENT RESPONSIBILITY — S5 §12:** Approve business policy and obtain appropriate legal approval before using drafted legal content in production. Developer drafts are not legal advice.
**OPEN QUESTION — S4:AC2/AF2:** Who provides product images and delivery rates? “To be discussed” is preserved. Exact asset deadlines, hosting/support budget and named approvers remain planning tasks.

Prior confirmed facts remain: owned domain `Irantiafrica.com`, existing business email, no hosting/provider account/current operations software at S2 submission (S2:U2, AR2–AW2). S4 does not establish completed onboarding or hosting. Branding is minimal, premium/luxury, elegant and corporate; reference names are not verified URLs (S2:AG2–AJ2; Q33).

## Boundaries and readiness

**CONFIRMED PROJECT REQUIREMENT — S1/S5:** Proposed stack and modular-monolith preference remain constraints for later evaluation, not architecture designed here: Next.js 16+, React/strict TypeScript/Tailwind; Laravel 13+/PHP 8.3+, REST/JSON; PostgreSQL, Redis, S3-compatible storage, Docker where appropriate, Paystack, transactional mail, Git/GitHub and test/static-analysis gates. Exact compatibility is unverified and belongs to later approved work.

**Q29 and Q30 are RESOLVED (S6). No remaining decision currently blocks a stable architecture/database/API/security design or reasonable estimate boundary.** Provider selection, tax configuration, return-policy details, permission matrix and operating targets remain visible non-blocking decisions with required completion gates. This does not waive them before implementation/production.

See [06-scope.md](06-scope.md) for the scope baseline, [05-open-questions.md](05-open-questions.md) for all 33 adjudicated records, and [07-requirements-traceability-matrix.md](07-requirements-traceability-matrix.md) for source-to-acceptance coverage. Baseline v1.0 is ready for approval, not already approved. No architecture or implementation begins.
