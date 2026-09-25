# IRANTI Africa — Final Phase 1 scope baseline

**Phase 1 baseline v1.0 — 2026-09-20. Status: PHASE 1 READY FOR APPROVAL; approval pending.** Sources and detailed status are recorded below.

Source definitions: [01-project-discovery.md](01-project-discovery.md). Requirements/acceptance: [02-functional-requirements.md](02-functional-requirements.md), [04-user-stories.md](04-user-stories.md). All 33 question adjudications: [05-open-questions.md](05-open-questions.md). Traceability: [07-requirements-traceability-matrix.md](07-requirements-traceability-matrix.md).

## Version 1 / MVP — Confirmed

**CONFIRMED REQUIREMENT — S4:B2:** Product browsing/search, product categories, shopping cart, online card payment, bank-transfer payment, stock management, delivery-charge calculation, order tracking and email notifications.

The following final operating requirements accompany that list:

| Confirmed behavior | Evidence / requirement |
|---|---|
| Physical made-in-Nigeria catalog, initially 20–50 products; NGN and nationwide Nigeria delivery | S2:C2/I2/J2/V2/W2; FR-CAT-001, FR-PRC-001, FR-SHP-001 |
| Simple products plus applicable variants with separate price and stock; differing variant prices permitted | S4:D2–E2; FR-CAT-002 |
| Hide products automatically at zero stock; owner initially updates quantities; prohibit out-of-stock orders | S4:F2–G2; S2:N2; FR-INV-001 |
| Add applicable tax at checkout and show tax separately on invoices/receipts | S4:I2–J2; FR-TAX-001; no rate/treatment supplied |
| Automatically confirm bank transfers through gateway; reserve during payment; retry failed payment on the same order | S4:K2–M2; FR-PAY-001/003, FR-INV-003 |
| Logistics-provider prices and a logistics tracking number/link | S4:N2/Q2; FR-SHP-001/002; selection/pricing implementation still dependent |
| Same-day return requests for damaged/wrongly delivered/defective items; guests may request; owner approves refunds | S4:R2–U2; FR-RET-001/003/004; clock and detailed policy open |
| Owner/Super Admin, Order Processing Staff, Inventory/Store Staff; job-restricted access | S4:V2–W2; FR-ADM-001; exact matrix not approved |
| Guest checkout carried forward, reinforced by guest-return requirement; no compulsory account creation | S2:R2; S4:T2; FR-ACC-005 |
| Existing business milestones and order/payment emails retained | S2:AB2–AC2; S4:B2; FR-ORD-001, FR-NOT-001 |

S1 specifies Paystack initially; it is a **CONFIRMED PROJECT REQUIREMENT**, not a newly inferred S4 selection. Merchant onboarding and actual enabled channels still require verification. Secure verification, idempotency, auditing, accessibility, SEO, tests and operational quality remain S1 project obligations.

**CONFIRMED REQUIREMENT — S6/Q29:** Customer accounts, saved addresses and order history are V1; the conditional address/history allocation is satisfied by including accounts. BASIC OPERATIONAL REPORTING for sales, orders and stock is V1. Wishlist, reorder, marketing/promotional subscriptions, abandoned-cart reminders and ADVANCED REPORTING / ANALYTICS are later. No additional essential V1 feature is declared. Q29 is RESOLVED.

## Version 1 — Required Technical Enablers

**REQUIRED ENABLING REQUIREMENT:** These are necessary to deliver confirmed capabilities but were not individually confirmed as new client checklist items. Their inclusion does not claim an unprovided client answer.

| Enabler | Why it is necessary | Requirement |
|---|---|---|
| Product-selection/detail information | Customers must identify what they select and its current option/price/availability. | FR-CAT-004 |
| Checkout and recoverable order creation | Payment and delivery require an identified basket, contact/address and authoritative total. | FR-CHK-001 |
| Payment/attempt records and verification | Automatic confirmation and same-order retries need verifiable evidence and attributable outcomes. | FR-PAY-004; S1 controls FR-PAY-002 |
| Inventory protection during the order reservation | A reserved purchasable order cannot permit another buyer to consume the same final unit. | Enabling portion of FR-INV-003 |
| Basic catalog/stock/order administration | Owner/staff must load/maintain products, update stock, process orders and record tracking. | FR-ADM-002 |
| Secure access and reliable confirmation processing | Tracking, guest returns and notifications must protect order ownership and survive retries/failures. | FR-ORD-003, FR-RET-003, FR-NOT-001; S1 controls |

**ENGINEERING CONTROL — S1:** Never trust client financial values/payment status; verify gateway evidence and webhook signatures; preserve historical purchases; use safe money storage, transaction safety and no-overselling/idempotency controls. These are not optional features to trade away for schedule.

## Post-MVP / Deferred

**DEFERRED REQUIREMENT — POST-MVP / LATER RELEASE:**

- Product reviews (S4:C2; FR-REV-001).
- Bulk discounts and their rules (S4:C2/H2; FR-PRC-002).
- Advanced reports (S4:C2; FR-RPT-002).
- Expansion to other African markets much later (S2:BC2; FR-FUT-001).

**DEFERRED REQUIREMENT — S6/Q29:** Wishlist, reorder, marketing/promotional subscriptions and abandoned-cart reminders are also later. Advanced analytics/reporting remains later; basic operational sales/order/stock reporting is V1. This is explicit client allocation, not a deduction from unselected checkboxes.

**BASIC OPERATIONAL REPORTING:** Routine store sales, order and stock views. **ADVANCED REPORTING / ANALYTICS:** Analytical reporting beyond those operational needs is deferred. Specific metrics, periods, fields and access are non-blocking Q14 design details; this boundary does not add a BI tool, forecasting or a custom report builder.

**CONFIRMED PROJECT REQUIREMENT — S1:** Future integration readiness for mobile, accounting/ERP, logistics, analytics/marketing, recommendations and marketplaces remains a quality goal, not a commitment to build those integrations.

## Out of Scope

- **CONFIRMED REQUIREMENT — EXCLUSION:** Existing product/customer/order database migration (S4:X2; FR-DAT-001). Initial product data preparation/loading is still in scope.
- **CONFIRMED REQUIREMENT — EXCLUSION:** Out-of-stock ordering/backorders (S2:N2).
- Digital-product fulfilment, non-NGN payments and international V1 delivery are outside the stated physical/NGN/Nigeria baseline; adding them requires an explicit scope change.
- **ENGINEERING RECOMMENDATION:** Do not include unsupported marketplace sellers, subscriptions, loyalty, negotiated wholesale-account tiers, live delivery maps, mobile apps or generic ERP integrations without an approved requirement.
- **CONFIRMED EXCLUSION — S6/Q30:** No additional V1 external business-system integration. Existing gateway, logistics, email and hosting dependencies are retained; no additional integration is invented.
- **CONFIRMED PHASE BOUNDARY — S5:** No architecture, ERD/schema, API design, application code, migrations, pages, controllers, services, infrastructure or deployment in this task.

## Client Responsibilities

**CLIENT RESPONSIBILITY — explicitly assigned by S4:**

| Deliverable | Evidence | Remaining boundary |
|---|---|---|
| Product names | Z2 | Supply complete approved launch catalog names. |
| Product prices | AA2 | Include applicable variant prices; tax rates/treatment require separate client/adviser confirmation. |
| Stock quantities | AD2; owner maintains initially G2 | Include applicable variant quantities and accurate opening stock. |
| Logo/branding materials | AE2 | Provide usable/licensed files and brand guidance. |

**CLIENT RESPONSIBILITY — S5:** Approve business policies and obtain client/legal review of developer-drafted returns, privacy and terms before production use. Supply the factual business/tax/operational inputs; drafting does not resolve unanswered policy.

**ENGINEERING RECOMMENDATION — assignment needs agreement:** Client owns merchant verification/settlement decisions and selects delivery operator; confirm domain/DNS authority, hosting/payment account ownership/payer, final decision/UAT owner and acceptance dates. Provider readiness is not inferred from owning a domain/business email.

**OPEN QUESTION — Q31:** Product images (S4:AC2) and delivery-rate supply (AF2) are “To be discussed.” The fact that a provider supplies the price does not assign who obtains/maintains that rate sheet for the project. Do not assign either deliverable to client or developer by default.

## Developer Responsibilities

**DEVELOPER RESPONSIBILITY — explicitly assigned by S4:**

| Deliverable | Evidence | Required limit |
|---|---|---|
| Product descriptions | AB2 | Draft from client-approved product facts; do not invent material/product claims. |
| Return/refund policy draft | AG2 | Reflect resolved client decisions; unresolved timing/outcomes stay open. |
| Privacy policy draft | AH2 | Require confirmed data practices and client/legal review. |
| Terms & conditions draft | AI2 | Require accurate business facts and client/legal review. |

Policy drafts may be prepared in later authorized work. They are not legal advice and are not approved for production solely because the developer wrote them. No policy drafting or legal determination was performed in this requirements update.

**CONFIRMED PROJECT RESPONSIBILITY — S1/S5:** Reconcile/document requirements and, after later approval, design, implement, test and document the agreed scope. Technical integration/setup and ongoing support must follow agreed ownership and commercial scope; this update does not authorize provider account changes.

**OPEN QUESTION:** Image production, photography, rate sourcing, asset deadlines, service charges and ongoing operational ownership remain to be assigned. Initial catalog entry/import format can be agreed during architecture/content preparation; legacy database migration is excluded.

## Third-Party Dependencies

| Dependency | Current evidence | Required before live use |
|---|---|---|
| Gateway | S1 specifies Paystack; S2:U2 had no account; S4:K2 requires automatic transfer confirmation | Merchant onboarding, enabled NGN card/transfer channels, settlement/refund operations and secure credentials; no provider-capability verification asserted here. |
| Logistics | Provider not yet decided (S4:P2); provider supplies prices (N2); rate sheet blank (O2) | Provider selection, serviceable areas/rates, delivery/return process, tracking reference/link and accountable rate maintenance. |
| Hosting/storage/email | No hosting and business email are last reported facts (S2:AT2–AU2) | Approved service accounts/budget, sender/domain access, operating and recovery ownership. |
| Domain | Irantiafrica.com reportedly owned (S2:AR2–AS2) | Authorized DNS access and renewal/account ownership. |
| Additional external business software | None required for V1 (S6/Q30) | No additional integration dependency. Future additions require scope approval. |

**ENGINEERING RECOMMENDATION:** Provider-independent logistics handling keeps provider selection/rate details non-blocking for later authorized architecture work. Q29/Q30 are now resolved. This is not a designed adapter, API or commitment to live carrier integration. A later requirement for live rating/labels/events may change scope.

## Unresolved Before Development

The [decision register](05-open-questions.md) separates Phase 2 blockers from later gates.

**No remaining Phase 1 blockers.** Q29 and Q30 are RESOLVED by S6. Accounts/address/history and operational reporting allocations are fixed, remaining convenience/marketing/advanced features are deferred, and no additional V1 business-system integration is required.

**NON-BLOCKING CONFIGURATION DECISIONS and policy gates:** Tax rates/products/exemptions and treatment; same-day start/cutoff; exchange/refund, shipping cost, condition/evidence, method and partial-return/refund rules; stock reservation/release/zero-variant/restoration rules; payment retry/late-success handling; delivery rates/provider operations; exact permissions/guest request method; retention/consent; email sender/templates. These must be agreed before the affected implementation or production acceptance. Non-blocking does not mean optional.

## Can Be Finalized During Architecture

**ENGINEERING RECOMMENDATION — requires review:** Permission matrix, authentication/guest access method, reservation timeout/recovery policies, order exception transitions, bounded logistics provider handling, email service, measurable performance/availability/recovery targets, load profile, hosting/support budget and ownership, exact supported stack versions and deployment/UAT ownership.

These are review inputs for later architecture/security/design work, not a design delivered now. Detailed catalog attributes/identifiers, exact reference URLs, images and legal content approvals have clear later development/UX/launch gates; finished assets need not already exist to approve a requirements boundary.

**ASSUMPTION A01 awaiting approval:** Single-store operating model. No extra assumption grants a tax rate, delivery provider, reservation interval, return anchor, automatic staff permission or a V1 allocation to an omitted feature.

## Launch date and final review

**1 November 2026 — PREFERRED / NON-BINDING TARGET.** S4:AJ2 permits changing the date; AK2 says no event/campaign tie. No committed delivery date or SLA is inferred.

**Final review:** All seven existing Phase 1 documents updated only for Q29/Q30 and directly affected entries. Of 33 question records, 2 are resolved, 26 partially resolved, 3 open and 2 deferred. All 29 active unresolved records are non-blocking; other decisions have not been reopened.

**PHASE 1 READY FOR APPROVAL — baseline v1.0 dated 2026-09-20.** Scope is sufficiently bounded for system architecture, database/API/security design and reasonable estimation. Approval is still pending. Proposed numeric targets, exact permission grants and existing responsibility gaps retain their review gates. No architecture or implementation is created; stop here until explicit authorization for Phase 2.
