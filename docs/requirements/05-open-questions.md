# IRANTI Africa — Final question adjudication and remaining decisions

**Phase 1 baseline v1.0 — 2026-09-20. Status: PHASE 1 READY FOR APPROVAL; approval pending.** Sources and detailed status are recorded below.

## Status summary

| Status | Count | Interpretation |
|---|---:|---|
| RESOLVED | 2 | Q29 and Q30 are resolved by S6, the final client clarification. |
| PARTIALLY RESOLVED | 26 | Confirmed answers retained; only actual residual decisions remain. |
| OPEN | 3 | Q19, Q23 and Q33 retain their non-blocking review inputs. |
| DEFERRED | 2 | Q06/Q28 bulk-discount rules explicitly moved after launch. |
| NO LONGER APPLICABLE | 0 | Obsolete subparts were removed or closed within their parent rather than relabeling a still-open compound record. |
| Total reviewed | 33 | 29 active unresolved records = 26 partial + 3 open; 2 resolved and 2 deferred are excluded from active-open count. |

**Blocking decisions: 0. Non-blocking active records: 29.** Q29/Q30 are closed; other record statuses are preserved. Directly affected parent references below reflect the settled allocations without reopening decisions. Source-backed resolved subdecisions include categories, variant price/stock capability, owner stock updates, zero-stock hiding, tax presentation, gateway transfer confirmation, payment reservation/retry, tracking number/link, guest returns, owner refund approval, three roles/restrictions, no legacy migration, most content responsibilities and flexible/event-independent date.

Question status and gate are different: PARTIALLY RESOLVED does not automatically block architecture. A required policy may be settled during later review before its implementation. No missing answer is treated as client approval.

## Review of all existing records

| ID | Status | Original subject | Client answer / adjudication | Affected requirements |
|---|---|---|---|---|
| Q01 | PARTIALLY RESOLVED | Business identity/objectives, approval, budget and schedule | IRANTI Africa and objectives retained (S2:B2/H2/BB2). Date can change and has no event/campaign tie (S4:AJ2–AK2). | PR-SCH-001; BO01–BO04 |
| Q02 | PARTIALLY RESOLVED | Customers, market, language, devices and purchasing model | Nigeria-based diplomats/tourists/corporate buyers and NGN remain confirmed (S2:D2–E2/V2). | FR-CAT-001; NFR04 |
| Q03 | PARTIALLY RESOLVED | Catalog types/count, taxonomy, fields, media and publication | 20–50 physical products (S2:I2/J2); categories selected (S4:B2); descriptions assigned to developer, core catalog data to client (Z2–AE2). | FR-CAT-001–FR-CAT-004; FR-CNT-001 |
| Q04 | PARTIALLY RESOLVED | Stock sources/locations, reservation, movements and zero stock | Auto tracking/no out-of-stock orders retained; hide zero-stock products, owner updates, reserve during payment (S4:F2–G2/L2). | FR-INV-001–FR-INV-003 |
| Q05 | PARTIALLY RESOLVED | Prices, currency, tax display, rounding and promotions | NGN/common customer prices retained. Variant price differences allowed (S4:E2); tax added at checkout/separate on receipt (I2–J2). Bulk discounts deferred (C2/H2). | FR-PRC-001; FR-TAX-001 |
| Q06 | DEFERRED | Bulk promotions, thresholds, eligibility, stacking and allocation | S4:C2 puts bulk discounts after launch; H2 says decide later. | FR-PRC-002 |
| Q07 | PARTIALLY RESOLVED | Tax business behavior and legal configuration | S4:I2–J2 confirms checkout tax addition and separate invoice/receipt display. | FR-TAX-001; NFR14 |
| Q08 | PARTIALLY RESOLVED | Delivery operator, location prices, serviceability and tracking operations | Provider supplies prices (S4:N2); provider not decided (P2); rate sheet O2 blank; tracking number/link Q2. | FR-SHP-001/002 |
| Q09 | PARTIALLY RESOLVED | Order milestones, transitions, actors and exceptions | S2:AB2 milestones retained; payment reserve/retry and job restrictions clarified (S4:L2–M2/W2). | FR-ORD-001/003 |
| Q10 | PARTIALLY RESOLVED | Payment provider readiness, channels and exceptions | Cards/transfers in V1 (S4:B2); transfer confirmation automatic through gateway (K2); reserve and same-order retry (L2–M2). Paystack mandated by S1. | FR-PAY-001–FR-PAY-004; FR-INV-003 |
| Q11 | PARTIALLY RESOLVED | Cancellation/return/refund eligibility and outcomes | Same-day, damaged/wrong/defective, guest entitlement and owner approval confirmed (S4:R2–U2). | FR-RET-001–FR-RET-004; FR-POL-001 |
| Q12 | PARTIALLY RESOLVED | Accounts, guest data/access, addresses/cart and recovery | Prior guest/account request retained (S2:R2–S2); guest returns explicitly confirmed (S4:T2). | FR-ACC-001–FR-ACC-005; FR-CART-001 |
| Q13 | PARTIALLY RESOLVED | Roles, duties, permission grants, MFA and audit | Three launch roles and job restriction confirmed (S4:V2–W2); owner initially updates stock and approves refunds (G2/U2). | FR-ADM-001/002; NFR15 |
| Q14 | PARTIALLY RESOLVED | Reports, definitions, audience and releases | S6/Q29 fixes the boundary: basic sales/order/stock reporting V1; advanced reports/analytics later. Q14 retains only report definitions and presentation configuration. | FR-RPT-001/002 |
| Q15 | PARTIALLY RESOLVED | Customer extras, review policy and marketing messages | Reviews remain deferred (S4:C2). S6/Q29 also defers wishlist, reorder and marketing/cart reminders; their later policy details do not block V1. | FR-REV-001; FR-ACC-003; FR-MKT-001/002 |
| Q16 | PARTIALLY RESOLVED | Email events/provider/templates/sender | Email notifications confirmed in V1 (S4:B2); prior order/payment confirmations retained (S2:AC2). | FR-NOT-001 |
| Q17 | PARTIALLY RESOLVED | Integrations, migration and systems of record | No database migration (S4:X2) and no additional V1 external business-system integration (S6/Q30) are settled. Remaining internal stock/source documentation is covered by Q04; no new integration discovery is required. | FR-DAT-001; FR-INT-001 |
| Q18 | PARTIALLY RESOLVED | Capacity, variants/media, customer/order peaks and growth | Initial 20–50 products still known (S2:I2); S4 adds no traffic forecast. | NFR05 |
| Q19 | OPEN | Performance, availability, accessibility, browser and recovery targets | No new client-approved numeric targets in S4. | NFR04–NFR07 |
| Q20 | PARTIALLY RESOLVED | Privacy/legal content, retention/consent and approval | Developer prepares return/privacy/terms drafts (S4:AG2–AI2). S5 requires client/legal approval before production. | FR-POL-001; NFR14/15 |
| Q21 | PARTIALLY RESOLVED | SEO/domain/indexing and analytics scope | Domain and no existing website retained (S2:F2/AS2); no final analytics service named. | FR-SEO-001; NFR16 |
| Q22 | PARTIALLY RESOLVED | Hosting, support, monitoring, backup and recovery ownership | No hosting and business email remain last known facts (S2:AT2–AU2); no contrary S4 answer. | FR-OPS-001; NFR06/07 |
| Q23 | OPEN | Compatibility, repository/environment ownership and UAT | S4 does not answer engineering compatibility or ownership. | NFR08–NFR13 |
| Q24 | PARTIALLY RESOLVED | Applicable variants, separate pricing/stock and actual examples | S4:D2's Some products only answers own price AND stock per option; E2 confirms price differences. Conditional variant stock is confirmed, not merely assumed. | FR-CAT-002; FR-INV-001/002 |
| Q25 | PARTIALLY RESOLVED | Transfer confirmation mechanism and unmatched/late transfers | Gateway-managed automatic confirmation is RESOLVED by S4:K2; direct manual proof approval is not the chosen process. | FR-PAY-001/002/003 |
| Q26 | PARTIALLY RESOLVED | Return window and its start/cutoff | S4:R2 states same day. It supersedes S2:AE2 wording; neither delivery anchor nor rolling 24 hours is approved. | FR-RET-001 |
| Q27 | PARTIALLY RESOLVED | Tracking promise and recording responsibility | Number/link from logistics is RESOLVED by S4:Q2; live tracking/event integration is not required by that answer. | FR-SHP-002 |
| Q28 | DEFERRED | Common prices versus bulk-discount interpretation | Bulk discounts explicitly later and rules decide later (S4:C2/H2). | FR-PRC-002 |
| Q29 | RESOLVED | Complete MVP/later allocation and additional essentials | S6/Q29 confirms V1 accounts, saved addresses/history (account condition satisfied), and basic sales/order/stock reports. Wishlist, reorder, marketing/cart reminders and advanced analytics/reports are later. No other essential V1 feature is declared. | FR-ACC-001–FR-ACC-004; FR-MKT-001/002; FR-RPT-001 |
| Q30 | RESOLVED | Unidentified first-version external business software | S6/Q30 confirms no additional V1 external business-system integration; Other is closed. Existing payment/logistics/email/hosting dependencies remain. No new integration is selected. | FR-INT-001 |
| Q31 | PARTIALLY RESOLVED | Asset/service responsibility and launch feasibility | Client names/prices/stock/branding; developer descriptions/policies; images and delivery rates to discuss (S4:Z2–AI2). Date flexible/no event (AJ2–AK2). | FR-CNT-001; FR-POL-001; FR-SHP-001; PR-SCH-001 |
| Q32 | PARTIALLY RESOLVED | Guest return entitlement and secure route | Guest entitlement is RESOLVED by S4:T2; do not keep asking whether guests may return. | FR-RET-003 |
| Q33 | OPEN | Exact reference URLs and usable brand assets | Earlier reference names retained; client explicitly provides logo/branding (S4:AE2). | NFR17; FR-CNT-001 |

## Concise unresolved-decision table

“Blocks Phase 2?” concerns a safe architecture/database/API/security/estimate boundary, not production readiness. “No” never means permission to ship without the decision.

| ID | Decision required | Why it matters | Blocks Phase 2? Yes/No | Owner | Required gate |
|---|---|---|---|---|---|
| Q01 | Name sign-off/legal seller, agree commercial scope/budget and asset milestones; release allocation is settled by S6/Q29. | Commercial approval and planning; preferred date is not a fixed deadline. | No | Client owner | Before scope sign-off; planning during architecture |
| Q02 | Confirm required storefront languages and actual device/accessibility needs during UX planning. No separate wholesale accounts or special restrictions are inferred. | Localisation and UX acceptance; hypothetical business models are not retained as mandatory questions. | No | Client + developer | UX/architecture planning |
| Q03 | Provide representative catalog/attributes/categories and approve publication/content rules; images Q31 and options Q24. | Concrete data and content readiness; no digital-delivery discovery needed for physical-only scope. | No | Client + developer | Before catalog development/content loading |
| Q04 | Define stock locations/source, reservation timeout/release, variant/whole-product zero-stock behavior, replenishment visibility, adjustments/damage/restocking and ledger need. | Concurrency/visibility policy must be fixed before inventory implementation; numeric timeout can be selected during architecture. | No | Client owner + developer | Architecture and before inventory development |
| Q05 | Approve rounding/allocation and price-change presentation; no wholesale tiers/minimum order are assumed. Tax configuration Q07. | Accurate financial examples before checkout implementation; bulk rules are removed from V1 work. | No | Client + developer | Before checkout development |
| Q07 | Supply applicable rates, taxable products/exemptions, legal/invoice treatment and approved calculation examples. | Configuration/legal input before tax implementation; no rate or tax exemption invented. | No | Client / tax adviser; developer implements | Before affected development and production approval |
| Q08 | Select provider, obtain rates, assign rate-supply responsibility, serviceability/failed-delivery/return rules and how references reach staff. No live rating/label API is confirmed. | Provider details can be accommodated as a later dependency; any demand for additional live API behavior needs scope review. | No | Client owner / logistics provider | During architecture; before delivery integration/development |
| Q09 | Approve allowed cancellation/failure/partial-shipment transitions and who records dispatch/delivery; developer proposes in later design. | Necessary process detail for later domain/API design, not a new unbounded feature demand. | No | Client owner + developer | During architecture/domain review before implementation |
| Q10 | Complete merchant onboarding; approve expiry/retry eligibility, late success, duplicates, disputes and reconciliation owner/outcomes. Transfer mechanism itself is resolved. | Provider setup and exception policy before payment development; no manual transfer-confirmation assumption. | No | Client owner + developer / gateway | Architecture/payment review; onboarding before live use |
| Q11 | Decide exchange versus refund, return-shipping cost/responsibility, condition/evidence, method, partial returns/refunds, restocking and cancellation policy. Clock Q26. | Material policy before returns implementation, but configurable policy details do not independently prevent initial architecture. | No | Client owner; developer drafts; client/legal reviews | Before affected development and production policy approval |
| Q12 | Accounts/history/addresses are V1 (S6/Q29). Define required fields, guest identification, verification/recovery and cart persistence/merge for allocated scope; no blanket account requirement. | Security/UX implementation policy; release allocation is settled. | No | Client + developer | During security/UX design |
| Q13 | Review document 02 matrix, staff provisioning/revocation, MFA and audit readers/events; inventory role does not automatically get adjustment rights. | Known RBAC scope supports later design; individual grants must be approved before implementation. | No | Client owner + developer | During architecture/security review |
| Q14 | Define V1 basic sales/order/stock metrics, fields, date/timezone and access; do not add advanced analytical scope. | Release boundary is settled. Definitions are non-blocking design configuration; advanced-report details are later work. | No | Client owner | Before basic-report development |
| Q15 | Approve consent, channel, timing/suppression/content when the deferred marketing features are scheduled. Review moderation remains deferred. | Deferred marketing and moderation are not V1 blockers; transactional emails remain in V1. | No | Client owner + developer | Policy before later-release development |
| Q16 | Select sender/provider, approve exact triggers/templates/language and support address; optional event notifications require explicit scope. | Notification configuration can be finalized during architecture; mailbox readiness is not provider readiness. | No | Client + developer | During architecture; before notification implementation |
| Q17 | No remaining additional-integration or legacy-migration decision. Internal stock/source documentation remains under Q04; no new provider connection is implied. | No external-system or migration scope to estimate; internal operating documentation remains non-blocking. | No | Client owner | Internal operating documentation during design |
| Q18 | Developer proposes a representative load/data test profile with client demand estimates; no high-scale guarantee inferred. | Needed for sizing/testing, can be agreed during architecture without speculative scalability scope. | No | Developer + client | During architecture, before capacity commitments |
| Q19 | Review proposed targets in document 03 with test profile/cost tradeoffs. | Engineering acceptance targets, not questionnaire-approved SLAs; complete before design/service sign-off. | No | Developer + client | During architecture before design sign-off |
| Q20 | Approve actual business/legal content, retention/deletion/access/consent rules and risk owner; special obligations must be surfaced before affected design. | Drafting responsibility is resolved, substantive policy is not; not an assertion of legal compliance. | No | Developer drafts; client/legal approves | Security design; before relevant development/production |
| Q21 | Confirm domain access and indexing/URL/language rules. Additional analytics integrations are not part of V1. Legacy redirects are not required without existing URLs. | SEO details can follow; no additional analytics/business-system integration is included under resolved Q30. | No | Client + developer | During architecture/UX; before launch |
| Q22 | Agree hosting/payer/support budget, operators, response hours, incident/recovery owners and escalation. | Operational plan and affordability before production commitments, not a mandate for infrastructure work now. | No | Client + developer | During architecture; before deployment approval |
| Q23 | Validate exact framework/runtime support; assign GitHub/environment/maintenance and UAT owners during approved planning. | Engineering due diligence belongs before architecture sign-off, not application scaffolding or a client questionnaire blocker. | No | Developer; client assigns business approver | During architecture; before its approval |
| Q24 | Provide actual attributes/options/SKUs and sample product data. Do not invent combinations or identifier format. | Sample data before detailed catalog design; support for simple/applicable variant products is settled. | No | Client supplies data; developer reviews | During domain/catalog review |
| Q25 | Unmatched/late-transfer reconciliation ownership and outcomes remain within Q10; no repeated question about manual versus automatic confirmation. | Compound record kept partial only for its exception-policy subpart. | No | Client + developer / gateway | Payment design; before implementation |
| Q26 | Same day as order creation, payment, delivery or another event? Which timezone/cutoff, and what is required before that cutoff? | Eligibility boundaries before policy/code; an event/cutoff decision does not itself require different overall architecture. | No | Client owner; developer drafts | Before returns development/legal approval |
| Q27 | Assign who obtains/records tracking and delivery evidence via Q08/Q13. | Keep only recording responsibility open, not the now-answered tracking-definition question. | No | Client + logistics provider | During fulfilment design |
| Q31 | Assign images and delivery-rate supply; schedule assets/provider access and legal review; confirm any hosting/domain/provider setup and support commercial responsibility. | Known gaps must close before affected work/launch; no arbitrary requirement that all assets already exist for architecture. | No | Client + developer; logistics provider supplies prices | Before affected work; production-readiness check |
| Q32 | Specify secure guest identification/request channel during design; do not impose account creation. | Authorization and usability before implementation; entitlement is settled. | No | Developer proposes; client approves operational route | Security/UX design before implementation |
| Q33 | Supply exact reference URLs and usable/licensed assets for later UX review. | Content/design input, not a database/API/security architecture blocker. | No | Client owner | Before UX/brand implementation |

## Deferred and obsolete subquestions

**DEFERRED REQUIREMENT:** Q06/Q28 discount thresholds, stacking, eligibility and common-price interaction are POST-MVP / LATER RELEASE (S4:C2/H2). Review moderation and advanced-report detail likewise follow their explicit feature deferrals, not V1 implementation.

**RESOLVED subquestion:** Existing product/customer/order database migration is not required (S4:X2); do not continue asking for a migration inventory under Q17. Initial catalog creation is separate.

**RESOLVED subquestions:** Automatic versus manual transfer confirmation (S4:K2), tracking definition (Q2), guest return entitlement (T2), initial staff role list (V2), owner refund approval (U2) and launch event tie (AK2) are settled. Their broad parent records retain only remaining exception/operation/design details.

No evidence calls for a new wholesale identity model, digital fulfilment, international V1 logistics, live tracking map or manual bank-transfer confirmation. These are not retained as mandatory discovery hurdles. Exact visual reference URLs remain a later UX input.

## Conflict reconciliation

- Earlier “Payment” alone as a first-version answer is superseded by S4:B2's explicit feature list. S6/Q29 now also closes prior allocation gaps and the operational/advanced reporting boundary; no additional essential feature is declared.
- Common pricing versus bulk discount tension no longer affects V1 because bulk discounts/rules are explicitly deferred. Variant-specific prices (S4:E2) concern selected options, not customer-specific wholesale pricing.
- Same-day return requests (S4:R2) supersede the earlier “24 hours after purchase” wording. They do not establish a new delivery-based anchor or rolling duration. Q26 retains only start/cutoff semantics.
- The former two-role list is superseded by three launch roles (S4:V2). Owner stock maintenance and existence of Inventory / Store Staff are compatible with initially restricted staff access; grants remain review work.
- Logistics supplies pricing (S4:N2) while no provider has yet been selected (P2). This describes the intended price source, not completed onboarding or a confirmed API integration.
- Guest returns are now explicitly permitted (T2). Secure channel selection is later design, not an entitlement conflict.

No direct unresolved contradictory instructions remain. Q29/Q30 are RESOLVED; there is no remaining blocking scope question.

## Integration boundary after Q30

**CONFIRMED REQUIREMENT — S6/Q30:** No additional V1 business-system integration. Existing gateway, logistics, email and hosting dependencies remain. Logistics selection and detailed rates are still non-blocking configuration. No new integration is proposed; later additions require scope approval. The earlier assessment that unidentified Other blocked estimation is superseded by this explicit exclusion.

## Approval record

**PHASE 1 READY FOR APPROVAL — baseline v1.0, 2026-09-20.** Q29 and Q30 are resolved from the final client answers (S6). The 29 remaining active records are non-blocking policy/configuration/design decisions with existing completion gates. Readiness is not approval; Phase 2 requires explicit user instruction. No architecture or implementation is authorized or performed.


### Subsequent Phase 3L clarification — Q14, 2026-09-24

The client approved Africa/Lagos reporting days, UTC storage, gross applied receipts including delivery/tax by application date, successful refunds by completion date, net collections as their difference, and historical item performance excluding tax/delivery. Unapplied receipts and financial holds are separately labelled. The approved 31-permission matrix remains in force. A09 metric/timezone/access definitions are resolved; per-variant launch threshold values remain non-blocking operational tuning. See [reporting definitions](../development/reporting.md). Earlier Phase 1 status entries above are historical; advanced analytics remains deferred.
