# IRANTI Africa — Functional requirements baseline

**Phase 1 baseline v1.0 — 2026-09-20. Status: PHASE 1 READY FOR APPROVAL; approval pending.** Sources and detailed status are recorded below.

## Reading the baseline

Client confirmation, release allocation and engineering necessity are separate. **MUST** applies to explicit V1 capabilities, necessary enablers or S1 project controls. **SHOULD/COULD** are proposals unless the source explicitly sets priority. Deferred functionality is never a V1 MUST. **OUT OF SCOPE** records exclusions.

**REQUIRED ENABLING REQUIREMENT:** Product-selection detail, checkout/order creation, payment records and basic administration are necessary to deliver shopping, payment and fulfilment; the client did not separately select each in S4:B2. They are visibly labeled rather than presented as new client answers. S1 controls remain project requirements.

Acceptance references below point to [04-user-stories.md](04-user-stories.md). Detailed policy-dependent cases cannot be finalized until their Q decisions are answered. Recommended acceptance wording is not an executed test or client sign-off.

## Catalog

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-CAT-001 — CONFIRMED REQUIREMENT | Browse and search the initial physical-product catalog; filtering remains a project-brief requirement, not an added client checkbox. | S4:B2; S2:C2, I2, J2; S1 | MUST; V1 | US-C01: AC1; Q03 |
| FR-CAT-002 — CONFIRMED REQUIREMENT | Support simple products and products with options. For applicable products, options may have their own price and stock; prices may differ between variants. Do not prescribe option types, combinations or SKU syntax. | S4:D2–E2; S2:K2–L2 | MUST; V1 | US-C01: AC2–AC3; Q24 |
| FR-CAT-003 — CONFIRMED REQUIREMENT | Organize browsable products into categories. | S4:B2 | MUST; V1 | US-C01: AC1; Q03 |
| FR-CAT-004 — REQUIRED ENABLING REQUIREMENT | Show sufficient product/selected-option information and current price/availability to make an informed cart selection. Necessary for catalog selection and payment, not an explicitly selected product-detail feature. | S4:B2, D2–E2; S1 | MUST; V1 | US-C01: AC2–AC3; Q03 |

## Purchase

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-CART-001 — CONFIRMED REQUIREMENT | Add, remove and change cart quantities; accepted amounts and availability are validated server-side. | S4:B2; S1 controls | MUST; V1 | US-C02: AC1–AC3; Q12 |
| FR-CHK-001 — REQUIRED ENABLING REQUIREMENT | Collect purchase/contact/delivery information, calculate authoritative NGN item/tax/delivery totals, and create a recoverable order. Necessary to charge for the cart and deliver it; checkout/order creation were not separate selections in S4:B2. | S4:B2, I2–M2; S1 | MUST; V1 | US-C04: AC1–AC2; Q07, Q09, Q12 |
| FR-ACC-001 — CONFIRMED REQUIREMENT | Customer account creation and registered checkout are included in V1; guest checkout remains available. | S2:R2; S6:Q29 | MUST; V1 | US-R01: AC1; Q12 |
| FR-ACC-002 — CONFIRMED REQUIREMENT | Registered customers save delivery addresses and view order history in V1. The client condition is satisfied because accounts are included. | S2:S2; S6:Q29 | MUST; V1 | US-R01: AC2–AC3; Q12 |
| FR-ACC-003 — DEFERRED REQUIREMENT | Wishlist/favourite products are explicitly deferred. | S2:S2; S6:Q29 | SHOULD — later proposal; POST-MVP / LATER RELEASE | US-R02: AC1; Q29 resolved |
| FR-ACC-004 — DEFERRED REQUIREMENT | Reorder previous purchases is explicitly deferred; later delivery must revalidate current price/stock and preserve historical orders. | S2:S2; S6:Q29; S1 controls | SHOULD — later proposal; POST-MVP / LATER RELEASE | US-R03: AC1; Q29 resolved |
| FR-ACC-005 — CONFIRMED REQUIREMENT | Allow guest purchases. This carries forward explicit guest checkout and is reinforced by the final guest-return requirement; no compulsory account creation. | S2:R2; S4:T2 | MUST; V1 | US-G01: AC1–AC2; Q12 |

## Pricing

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-PRC-001 — CONFIRMED REQUIREMENT | Use NGN and common customer pricing; different variants may have different prices. No MVP bulk-discount tiers. | S2:P2, V2; S4:E2, C2, H2 | MUST; V1 | US-C03: AC1; Q05 |
| FR-PRC-002 — DEFERRED REQUIREMENT | Bulk purchase discounts are POST-MVP / LATER RELEASE; calculation rules will be decided later. | S4:C2, H2 supersede S2:Q2 release uncertainty | SHOULD — later proposal; POST-MVP / LATER RELEASE | US-C03: AC3; Q06, Q28 |
| FR-TAX-001 — CONFIRMED REQUIREMENT | Add applicable tax at checkout and show tax separately on invoices/receipts. Rate, taxable products, exemptions and regulatory treatment are configuration dependencies, not invented rules. | S4:I2–J2 | MUST; V1 | US-C03: AC2; Q07 |

## Payments

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-PAY-001 — CONFIRMED REQUIREMENT | Accept card and bank transfer in NGN; automatically confirm bank transfers through the gateway. Paystack remains the initial provider required by S1, not merely a new recommendation or a named S4 choice. | S4:B2, K2; S2:V2; S1 | MUST; V1 | US-C04: AC3; Q10 |
| FR-PAY-002 — ENGINEERING CONTROL — CONFIRMED PROJECT REQUIREMENT | Verify payment server-side against expected reference/amount/currency; authenticate webhooks, reconcile idempotently and resist replay. No card storage or fulfilment based solely on redirects. | S1; supports S4:K2 | MUST; V1 | US-C04: AC4–AC5; Q10 |
| FR-PAY-003 — CONFIRMED REQUIREMENT | Allow failed payments to be retried against the existing order; the retry must not silently create another order. | S4:M2 | MUST; V1 | US-C04: AC6; Q10 |
| FR-PAY-004 — REQUIRED ENABLING REQUIREMENT | Retain payment identity, order association, provider/reference, amount/currency, attempts/status and timestamps needed to verify, reconcile and retry a payment safely. | S4:K2, M2; S1 | MUST; V1 | US-C04: AC3–AC6; Q10 |

## Inventory

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-INV-001 — CONFIRMED REQUIREMENT | Track stock, prevent out-of-stock orders, and automatically hide products when their stock reaches zero. Enforce no overselling. Owner initially updates stock. | S4:B2, F2–G2; S2:M2–N2; S1 controls | MUST; V1 | US-C02; US-A02: US-C02 AC2–AC3; US-A02 AC1–AC2; Q04 |
| FR-INV-002 — OPEN QUESTION / CONFIGURATION DEPENDENCY | Finalize the stock source/locations, reservation duration/release, damaged/returned goods and adjustment policy. Define how zero-stock hiding applies when only one variant is unavailable and when stock is restored. | S4:D2, F2, L2; S1 | MUST decision before affected development; V1 configuration | US-A02: AC2–AC3; Q04, Q24 |
| FR-INV-003 — CONFIRMED REQUIREMENT + REQUIRED ENABLING REQUIREMENT | Reserve the order while payment is being completed (client-confirmed). Protect the associated stock capacity to honor that reservation without overselling (engineering enabler); timeout and retry/late-success handling remain open. | S4:L2; S2:N2; S1 | MUST; V1 | US-C02; US-C04: US-C02 AC2; US-C04 AC6–AC7; Q04, Q10 |

## Orders

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-ORD-001 — CONFIRMED REQUIREMENT | Retain client milestones: order received, payment confirmed, preparing order, order in delivery, delivered. Allowed exceptions and permissions require later design/policy review; payment status remains separate. | S2:AB2; S1 | MUST; V1 | US-O01: AC1–AC2; Q09 |
| FR-ORD-002 — ENGINEERING CONTROL — CONFIRMED PROJECT REQUIREMENT | Preserve purchase-time product name, SKU/reference, selected variant, quantity, unit price, discount, tax and line total; catalog changes cannot rewrite historical orders. | S1 | MUST; V1 | US-A01: AC2; Q03 |
| FR-ORD-003 — CONFIRMED REQUIREMENT | Customers can see their order's status with authorized access; carrier number/link is additionally required by FR-SHP-002. | S1; S2:AB2; S4:B2, Q2 | MUST; V1 | US-C05: AC2; Q12 |

## Delivery

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-SHP-001 — CONFIRMED REQUIREMENT / THIRD-PARTY DEPENDENCY | Calculate location-based delivery charges for nationwide Nigeria from logistics-provider prices. Provider is not selected; rate sheet is absent and rate-supply responsibility remains to be discussed. Live rate API is not confirmed. | S4:B2, N2–P2, AF2; S2:W2, Z2 | MUST; V1 | US-C04: AC2; Q08, Q31 |
| FR-SHP-002 — CONFIRMED REQUIREMENT | Expose the order's logistics tracking number/link to its customer. This does not commit live map tracking or an automated carrier event feed. | S4:B2, Q2 | MUST; V1 | US-C05; US-O01: US-C05 AC2–AC3; US-O01 AC3; Q08 |

## Returns

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-RET-001 — CONFIRMED REQUIREMENT | Accept same-day return requests for damaged, wrongly delivered or defective products. The clock's start and cutoff remain unresolved; do not equate same-day with rolling 24 hours. | S4:R2–S2 supersede S2:AE2 window wording | MUST; V1 | US-G02; US-R04: AC1–AC2; Q11, Q26 |
| FR-RET-002 — OPEN QUESTION | Set cancellation, exchange/refund outcome, return-shipping responsibility, condition/evidence, refund method, partial returns/refunds and restocking rules; no defaults presumed. | S4:R2–U2; S1 | MUST decision before affected development; V1 policy | US-A06: AC2–AC3; Q11 |
| FR-RET-003 — CONFIRMED REQUIREMENT | Permit guest customers to request returns without requiring an account. Secure identification and the request channel must be specified before development. | S4:T2 | MUST; V1 | US-G02: AC1–AC2; Q32 |
| FR-RET-004 — CONFIRMED REQUIREMENT | The business owner approves refunds. Request acknowledgement is not approval or a completed refund. | S4:U2 | MUST; V1 | US-A06: AC1–AC3; Q11, Q13 |

## Notifications

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-NOT-001 — CONFIRMED REQUIREMENT | Send email notifications, including previously requested order and payment confirmations, without duplicate business effects on retries. | S4:B2; S2:AC2; S1 controls | MUST; V1 | US-C05: AC1; Q16 |

## Administration

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-ADM-001 — CONFIRMED REQUIREMENT | Launch roles: Business Owner / Super Admin, Order Processing Staff, Inventory / Store Staff. Restrict staff to job-relevant functions; exact permissions require review. | S4:V2–W2 supersede S2:AM2 role list; S1 | MUST; V1 | US-A03; US-I01: US-A03 AC1–AC2; US-I01 AC1; Q13 |
| FR-ADM-002 — REQUIRED ENABLING REQUIREMENT | Provide controlled catalog/stock/order administration and attributable critical changes so the confirmed catalog, inventory and fulfilment operations can be maintained. | S4:B2, G2, V2–W2; S1 | MUST; V1 | US-A01; US-A02; US-O01: US-A01 AC1–AC2; US-A02 AC1; US-O01 AC1; Q13 |

## Reporting

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-RPT-001 — CONFIRMED REQUIREMENT | BASIC OPERATIONAL REPORTING: V1 sales, order and stock reports for routine store operations. Metric/date/refund treatment, fields and permitted viewers are non-blocking configuration under Q14. | S2:AN2; S6:Q29 | MUST; V1 | US-A04: AC1, AC3; Q14 |
| FR-RPT-002 — DEFERRED REQUIREMENT | ADVANCED REPORTING / ANALYTICS is later-release scope, distinct from V1 operational sales/order/stock reports. Specific analytical outputs require later requirements review. | S4:C2; S6:Q29 | SHOULD — later proposal; POST-MVP / LATER RELEASE | US-A04: AC2; Q14 |

## Later-release features

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-REV-001 — DEFERRED REQUIREMENT | Product reviews are POST-MVP / LATER RELEASE; moderation/eligibility policy can be decided for that release. | S4:C2 supersedes S2:S2 release uncertainty | SHOULD — later proposal; POST-MVP / LATER RELEASE | US-R05: AC1; Q15 |
| FR-MKT-001 — DEFERRED REQUIREMENT | Marketing/newsletter/promotional subscriptions and associated promotional messages are deferred; transactional order/payment emails remain V1. | S2:AP2; S6:Q29 | SHOULD — later proposal; POST-MVP / LATER RELEASE | US-C09: AC1; Q15 |
| FR-MKT-002 — DEFERRED REQUIREMENT | Abandoned-cart reminders are explicitly deferred. | S2:AQ2; S6:Q29 | SHOULD — later proposal; POST-MVP / LATER RELEASE | US-C09: AC2; Q15 |

## Engineering and integration

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-SEO-001 — CONFIRMED PROJECT REQUIREMENT | Retain S1 semantic/indexable public content, metadata, canonical URLs, Open Graph, product structured data, sitemap, robots and friendly URLs. | S1; supports S2:H2 | MUST; V1 project baseline | US-C10: AC1–AC2; Q21 |
| FR-INT-001 — CONFIRMED REQUIREMENT — EXCLUSION | No additional external business-software/system integration is required for V1. This resolves Other; existing payment, logistics, email and hosting dependencies remain unchanged. No integration is invented or selected. | S6:Q30 supersedes S4:Y2 and S2:AO2 | OUT OF SCOPE; Additional V1 business-system integrations | US-A07: AC1; Q30 resolved |
| FR-OPS-001 — CONFIRMED PROJECT REQUIREMENT | Investigate API/payment/webhook/queue/authentication/checkout/stock failures using structured safe operational records. | S1 | MUST; V1 project baseline | US-A08: AC1–AC2; Q22 |
| FR-FUT-001 — DEFERRED REQUIREMENT | Expansion to other African markets remains a much-later direction; countries, currencies and international logistics require later discovery. | S2:BC2 | COULD — later detail; POST-MVP / LATER RELEASE | —: —; Q01 |

## Responsibilities

| ID / classification | Requirement | Source | Priority / release | Acceptance reference / decisions |
|---|---|---|---|---|
| FR-DAT-001 — CONFIRMED REQUIREMENT — EXCLUSION | No existing product/customer/order database migration is required. Initial catalog preparation/loading is still needed. | S4:X2 | OUT OF SCOPE; No legacy migration | —: Document 06: migration boundary; Q17 |
| FR-CNT-001 — CLIENT RESPONSIBILITY / DEVELOPER RESPONSIBILITY | Client provides names, prices, stock and logo/branding; developer prepares descriptions from client-approved product facts. | S4:Z2, AA2, AB2, AD2, AE2 | MUST deliverables; Before launch | US-A01: AC3; Q31 |
| FR-CNT-002 — OPEN QUESTION / RESPONSIBILITY GAP | Assign who supplies product images and who obtains/maintains delivery rates. Both are explicitly To be discussed; no assignment is inferred. | S4:AC2, AF2 | MUST decision before affected work; V1 preparation | US-A01: AC3; Q31 |
| FR-POL-001 — DEVELOPER RESPONSIBILITY / CLIENT RESPONSIBILITY | Developer drafts return/refund, privacy and terms content. Client/legal approval is required before production use; drafting does not grant authority to decide business policy or legal treatment. | S4:AG2–AI2; current user instruction S5 §12 | MUST deliverables; Before production | US-A06: AC4; Q11, Q20, Q31 |
| PR-SCH-001 — CONFIRMED REQUIREMENT | 1 November 2026 is a PREFERRED / NON-BINDING TARGET; it can change and is not connected to a specific event/campaign. | S2:AX2; S4:AJ2–AK2 | SHOULD — planning target; Planning | —: Document 06: launch-date statement; Q01 |

## Reporting boundary

**CONFIRMED REQUIREMENT — S6/Q29:** BASIC OPERATIONAL REPORTING covers routine sales, orders and stock in V1. ADVANCED REPORTING / ANALYTICS is POST-MVP. The baseline does not add a BI platform, forecasting, custom report builder or an analytics integration. These examples explain the boundary, not new later-release commitments. Existing requested dimensions/periods are retained as input to Q14; exact fields, calculations and presentation can be finalized during design without reopening release allocation.

## Inventory and financial invariants

**ENGINEERING CONTROL — CONFIRMED PROJECT REQUIREMENT (S1):** Sensitive totals and state are server-authoritative; money uses safe minor-unit/decimal storage, not floating point. Prevent overselling and negative stock. Preserve purchase-time history. Retry-safe transactions and verified webhooks cannot duplicate orders, stock deductions, confirmations or fulfilment. Payment status and order status remain distinct.

**CONFIRMED REQUIREMENT (S4:D2–G2, L2):** Simple products and applicable variant stock must coexist; hide zero-stock products; owner initially updates stock; reserve the order during payment. No particular option combination, SKU generator, reservation timeout or re-publication rule is approved.

**OPEN QUESTION (Q04/Q24):** For one sold-out variant of an otherwise stocked product, hide the variant or whole product? Does zero mean physical or currently available unreserved stock? What happens when stock is replenished? These are rule choices, not permission to sell unavailable stock. Movement-ledger need and exact deduction/release rules remain later design decisions; if adopted, preserve actor, quantity, type, reference, timestamp and reason as required by S1.

**BUSINESS REQUIREMENT (S4:I2–J2):** Add tax and show it separately.
**LEGAL/TAX CONFIGURATION (Q07):** Rate, taxable products, exemptions, rounding/allocation, invoicing details and treatment need client/adviser input. No VAT rate or zero-tax default is approved.

## Proposed role permission matrix

**ENGINEERING RECOMMENDATION — REQUIRES APPROVAL.** Rows are business permissions, not endpoint or implementation design. “Allow” is proposed only. Two responsibilities are explicitly confirmed: owner initially updates stock (S4:G2), and owner approves refunds (S4:U2). The three roles and restriction principle are confirmed; no other cell is client-approved.

| Function | Owner / Super Admin | Order Processing Staff | Inventory / Store Staff | Evidence / limitation |
|---|---|---|---|---|
| View catalog and availability | Allow | Allow | Allow | Proposed |
| Create/edit/publish catalog | Allow | Deny | Deny initially | Proposed; developer preparation does not grant staff permissions |
| Set prices | Allow | Deny | Deny | Proposed; client supplies prices |
| View stock | Allow | Allow as needed for orders | Allow | Proposed |
| Update stock | Allow — confirmed initial responsibility | Deny | Deny initially; later grant needs approval | Owner responsibility confirmed; staff restriction proposed |
| View necessary order/customer delivery details | Allow | Allow | Minimum packing details only if assigned | Proposed least privilege; no blanket customer-data access |
| Process orders and attach tracking | Allow | Allow | Deny unless fulfilment duty assigned | Proposed |
| View return requests / gather evidence | Allow | Allow | Deny | Proposed |
| Approve refunds | Allow — confirmed | Deny | Deny | Owner approval confirmed; explicit no bypass recommended |
| Execute an approved refund | Allow | Deny | Deny | Proposed; execution process/method Q11 |
| Manage staff/roles/settings | Allow | Deny | Deny | Proposed; not blanket permission to bypass controls |
| View audit logs | Allow | Deny | Deny | Proposed |
| View business reports | Basic V1 reports; owner-only access proposed | Deny | Deny | Release confirmed by S6/Q29; grants still require Q13 review; advanced reports deferred |

Inventory / Store Staff is a confirmed launch role even though owner initially maintains quantities. The role can be read-restricted initially; granting adjustment rights later requires review. Review provisioning/revocation, MFA, audit retention and exact permission grants during security/architecture review (Q13), not by treating this matrix as approved.

## Prior requirement identifiers and changes

All prior FR domain IDs are retained. FR-PAY-003 now captures explicitly confirmed same-order retries; its former unresolved exception issues live in Q10. FR-SHP-002 is now confirmed number/link tracking. FR-RET-001 uses S4's same-day/reason policy; account requests accompany the now-confirmed V1 account scope. FR-RET-003/004 separate guest entitlement and owner approval. FR-RPT-002 isolates deferred advanced reporting; FR-RPT-001 now defines confirmed V1 sales/order/stock operational reporting.

Original FR01–FR18 crosswalk remains:
FR01 → FR-CAT-001/002; FR02 → FR-CART-001; FR03 → FR-ACC-001/002; FR04 → FR-ACC-005/FR-CHK-001; FR05 → FR-CHK-001/FR-PRC-001/002/FR-TAX-001; FR06 → FR-PAY-001; FR07 → FR-PAY-002/004; FR08 → FR-ORD-003/FR-NOT-001/FR-SHP-002; FR09 → FR-RET-001/002/003/004; FR10 → FR-REV-001; FR11 → FR-ADM-002/FR-INV-001/002; FR12 → FR-ORD-001; FR13 → FR-ADM-001/002; FR14 → FR-RPT-001/002; FR15 → FR-PRC-002; FR16 → FR-SEO-001; FR17 → FR-OPS-001; FR18 → FR-MKT-001/002/FR-INT-001.

No database tables, API contracts, provider interface methods or technical state-machine design are introduced.
