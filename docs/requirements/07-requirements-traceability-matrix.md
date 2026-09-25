# IRANTI Africa — Requirements traceability matrix

**Phase 1 baseline v1.0 — 2026-09-20. Status: PHASE 1 READY FOR APPROVAL; approval pending.** Sources and detailed status are recorded below.

**Status:** CONFIRMED means source-confirmed requirement/responsibility (including S1 project controls), not global Phase 1 approval. RECOMMENDED flags necessary engineering enablers rather than invented client answers. OPEN flags undecided requirements/policies. DEFERRED is explicitly later. OUT OF SCOPE identifies an explicit exclusion. S6 fixes the remaining release allocations. Baseline readiness does not constitute overall client approval.

## Functional, responsibility and schedule trace

| Requirement ID | Requirement | Source | Priority | Release | Related User Story | Acceptance Criteria Reference | Status |
|---|---|---|---|---|---|---|---|
| FR-CAT-001 | Browse/search physical catalog | S4:B2; S2:C2, I2, J2; S1 | MUST | V1 | [US-C01](04-user-stories.md#us-c01) | AC1 | CONFIRMED |
| FR-CAT-002 | Simple products and applicable variant price/stock | S4:D2–E2; S2:K2–L2 | MUST | V1 | [US-C01](04-user-stories.md#us-c01) | AC2–AC3 | CONFIRMED |
| FR-CAT-003 | Categories | S4:B2 | MUST | V1 | [US-C01](04-user-stories.md#us-c01) | AC1 | CONFIRMED |
| FR-CAT-004 | Product-selection detail (enabler) | S4:B2, D2–E2; S1 | MUST | V1 | [US-C01](04-user-stories.md#us-c01) | AC2–AC3 | RECOMMENDED |
| FR-CART-001 | Cart operations | S4:B2; S1 controls | MUST | V1 | [US-C02](04-user-stories.md#us-c02) | AC1–AC3 | CONFIRMED |
| FR-CHK-001 | Checkout/order creation (enabler) | S4:B2, I2–M2; S1 | MUST | V1 | [US-C04](04-user-stories.md#us-c04) | AC1–AC2 | RECOMMENDED |
| FR-ACC-001 | Accounts/registered checkout | S2:R2; S6:Q29 | MUST | V1 | [US-R01](04-user-stories.md#us-r01) | AC1 | CONFIRMED |
| FR-ACC-002 | Saved addresses/order history; account condition satisfied | S2:S2; S6:Q29 | MUST | V1 | [US-R01](04-user-stories.md#us-r01) | AC2–AC3 | CONFIRMED |
| FR-ACC-003 | Wishlist | S2:S2; S6:Q29 | SHOULD — later proposal | POST-MVP / LATER RELEASE | [US-R02](04-user-stories.md#us-r02) | AC1 | DEFERRED |
| FR-ACC-004 | Reorder | S2:S2; S6:Q29; S1 controls | SHOULD — later proposal | POST-MVP / LATER RELEASE | [US-R03](04-user-stories.md#us-r03) | AC1 | DEFERRED |
| FR-ACC-005 | Guest checkout | S2:R2; S4:T2 | MUST | V1 | [US-G01](04-user-stories.md#us-g01) | AC1–AC2 | CONFIRMED |
| FR-PRC-001 | NGN/common prices; variant-specific prices | S2:P2, V2; S4:E2, C2, H2 | MUST | V1 | [US-C03](04-user-stories.md#us-c03) | AC1 | CONFIRMED |
| FR-PRC-002 | Bulk discounts | S4:C2, H2 supersede S2:Q2 release uncertainty | SHOULD — later proposal | POST-MVP / LATER RELEASE | [US-C03](04-user-stories.md#us-c03) | AC3 | DEFERRED |
| FR-TAX-001 | Checkout tax and separate receipt presentation | S4:I2–J2 | MUST | V1 | [US-C03](04-user-stories.md#us-c03) | AC2 | CONFIRMED |
| FR-PAY-001 | Card and gateway-confirmed transfers | S4:B2, K2; S2:V2; S1 | MUST | V1 | [US-C04](04-user-stories.md#us-c04) | AC3 | CONFIRMED |
| FR-PAY-002 | Verification/webhook/idempotency controls | S1; supports S4:K2 | MUST | V1 | [US-C04](04-user-stories.md#us-c04) | AC4–AC5 | CONFIRMED |
| FR-PAY-003 | Same-order payment retry | S4:M2 | MUST | V1 | [US-C04](04-user-stories.md#us-c04) | AC6 | CONFIRMED |
| FR-PAY-004 | Payment/attempt records (enabler) | S4:K2, M2; S1 | MUST | V1 | [US-C04](04-user-stories.md#us-c04) | AC3–AC6 | RECOMMENDED |
| FR-INV-001 | Stock, zero-stock hiding, owner updates | S4:B2, F2–G2; S2:M2–N2; S1 controls | MUST | V1 | [US-C02](04-user-stories.md#us-c02); [US-A02](04-user-stories.md#us-a02) | US-C02 AC2–AC3; US-A02 AC1–AC2 | CONFIRMED |
| FR-INV-002 | Detailed stock/visibility policy | S4:D2, F2, L2; S1 | MUST decision before affected development | V1 configuration | [US-A02](04-user-stories.md#us-a02) | AC2–AC3 | OPEN |
| FR-INV-003 | Order reservation and stock protection | S4:L2; S2:N2; S1 | MUST | V1 | [US-C02](04-user-stories.md#us-c02); [US-C04](04-user-stories.md#us-c04) | US-C02 AC2; US-C04 AC6–AC7 | CONFIRMED |
| FR-ORD-001 | Client order milestones | S2:AB2; S1 | MUST | V1 | [US-O01](04-user-stories.md#us-o01) | AC1–AC2 | CONFIRMED |
| FR-ORD-002 | Historical snapshots | S1 | MUST | V1 | [US-A01](04-user-stories.md#us-a01) | AC2 | CONFIRMED |
| FR-ORD-003 | Authorized order-status visibility | S1; S2:AB2; S4:B2, Q2 | MUST | V1 | [US-C05](04-user-stories.md#us-c05) | AC2 | CONFIRMED |
| FR-SHP-001 | Location charges from provider prices | S4:B2, N2–P2, AF2; S2:W2, Z2 | MUST | V1 | [US-C04](04-user-stories.md#us-c04) | AC2 | CONFIRMED |
| FR-SHP-002 | Tracking number/link | S4:B2, Q2 | MUST | V1 | [US-C05](04-user-stories.md#us-c05); [US-O01](04-user-stories.md#us-o01) | US-C05 AC2–AC3; US-O01 AC3 | CONFIRMED |
| FR-RET-001 | Same-day eligible return requests | S4:R2–S2 supersede S2:AE2 window wording | MUST | V1 | [US-G02](04-user-stories.md#us-g02); [US-R04](04-user-stories.md#us-r04) | AC1–AC2 | CONFIRMED |
| FR-RET-002 | Detailed return/refund/cancellation policy | S4:R2–U2; S1 | MUST decision before affected development | V1 policy | [US-A06](04-user-stories.md#us-a06) | AC2–AC3 | OPEN |
| FR-RET-003 | Guest return requests | S4:T2 | MUST | V1 | [US-G02](04-user-stories.md#us-g02) | AC1–AC2 | CONFIRMED |
| FR-RET-004 | Owner refund approval | S4:U2 | MUST | V1 | [US-A06](04-user-stories.md#us-a06) | AC1–AC3 | CONFIRMED |
| FR-NOT-001 | Email confirmations | S4:B2; S2:AC2; S1 controls | MUST | V1 | [US-C05](04-user-stories.md#us-c05) | AC1 | CONFIRMED |
| FR-ADM-001 | Three roles/job restrictions | S4:V2–W2 supersede S2:AM2 role list; S1 | MUST | V1 | [US-A03](04-user-stories.md#us-a03); [US-I01](04-user-stories.md#us-i01) | US-A03 AC1–AC2; US-I01 AC1 | CONFIRMED |
| FR-ADM-002 | Basic administration (enabler) | S4:B2, G2, V2–W2; S1 | MUST | V1 | [US-A01](04-user-stories.md#us-a01); [US-A02](04-user-stories.md#us-a02); [US-O01](04-user-stories.md#us-o01) | US-A01 AC1–AC2; US-A02 AC1; US-O01 AC1 | RECOMMENDED |
| FR-RPT-001 | BASIC OPERATIONAL REPORTING — sales/orders/stock | S2:AN2; S6:Q29 | MUST | V1 | [US-A04](04-user-stories.md#us-a04) | AC1, AC3 | CONFIRMED |
| FR-RPT-002 | ADVANCED REPORTING / ANALYTICS | S4:C2; S6:Q29 | SHOULD — later proposal | POST-MVP / LATER RELEASE | [US-A04](04-user-stories.md#us-a04) | AC2 | DEFERRED |
| FR-REV-001 | Product reviews | S4:C2 supersedes S2:S2 release uncertainty | SHOULD — later proposal | POST-MVP / LATER RELEASE | [US-R05](04-user-stories.md#us-r05) | AC1 | DEFERRED |
| FR-MKT-001 | Marketing/promotional subscriptions/messages | S2:AP2; S6:Q29 | SHOULD — later proposal | POST-MVP / LATER RELEASE | [US-C09](04-user-stories.md#us-c09) | AC1 | DEFERRED |
| FR-MKT-002 | Abandoned-cart reminders | S2:AQ2; S6:Q29 | SHOULD — later proposal | POST-MVP / LATER RELEASE | [US-C09](04-user-stories.md#us-c09) | AC2 | DEFERRED |
| FR-SEO-001 | SEO baseline | S1; supports S2:H2 | MUST | V1 project baseline | [US-C10](04-user-stories.md#us-c10) | AC1–AC2 | CONFIRMED |
| FR-INT-001 | No additional V1 business-system integration | S6:Q30 supersedes S4:Y2 / S2:AO2 | OUT OF SCOPE | Additional V1 business-system integrations excluded | [US-A07](04-user-stories.md#us-a07) | AC1 — scope acceptance only | OUT OF SCOPE |
| FR-OPS-001 | Safe operational investigation | S1 | MUST | V1 project baseline | [US-A08](04-user-stories.md#us-a08) | AC1–AC2 | CONFIRMED |
| FR-FUT-001 | Later Africa expansion | S2:BC2 | COULD — later detail | POST-MVP / LATER RELEASE | — | — | DEFERRED |
| FR-DAT-001 | No legacy database migration | S4:X2 | OUT OF SCOPE | No legacy migration | — | Document 06: migration boundary | OUT OF SCOPE |
| FR-CNT-001 | Assigned catalog/content responsibilities | S4:Z2, AA2, AB2, AD2, AE2 | MUST deliverables | Before launch | [US-A01](04-user-stories.md#us-a01) | AC3 | CONFIRMED |
| FR-CNT-002 | Images and delivery-rate responsibility gap | S4:AC2, AF2 | MUST decision before affected work | V1 preparation | [US-A01](04-user-stories.md#us-a01) | AC3 | OPEN |
| FR-POL-001 | Developer drafts; client/legal approves policies | S4:AG2–AI2; current user instruction S5 §12 | MUST deliverables | Before production | [US-A06](04-user-stories.md#us-a06) | AC4 | CONFIRMED |
| PR-SCH-001 | Flexible preferred launch date | S2:AX2; S4:AJ2–AK2 | SHOULD — planning target | Planning | — | Document 06: launch-date statement | CONFIRMED |

Rows with no runtime story are planning/exclusion obligations: no migration is checked at scope acceptance; launch flexibility is checked in the schedule baseline; international expansion has no fabricated detailed story before future discovery. These deliberate omissions are not missing V1 journeys.

## Non-functional trace

NFR IDs retain their existing definitions in [03-non-functional-requirements.md](03-non-functional-requirements.md). Baseline obligations and numeric engineering targets are separate: confirmed accessibility/recovery goals do not mean their proposed numeric targets are approved.

| Requirement ID | Requirement | Source | Priority | Release | Related User Story | Acceptance Criteria Reference | Status |
|---|---|---|---|---|---|---|---|
| NFR01 | Secure validation/authorization | S1; S4:W2 | MUST baseline; details under review | V1 project baseline | US-A03; US-G01 | US-A03 AC1–AC2; US-G01 AC2 | CONFIRMED |
| NFR02 | Verified payment and inventory integrity | S1; S2:N2; S4:K2–M2 | MUST baseline; details under review | V1 project baseline | US-C02; US-C04 | US-C02 AC2–AC3; US-C04 AC4–AC7 | CONFIRMED |
| NFR03 | No sensitive credential/card logging/storage | S1 | MUST baseline; details under review | V1 project baseline | US-A08 | AC1; NFR03 data/log inspection | CONFIRMED |
| NFR04 | Mobile/accessibility baseline | S1 | MUST baseline; details under review | V1 project baseline | US-C10 | AC2; proposed conformance target remains unapproved | CONFIRMED |
| NFR05 | Measurable performance/capacity | S1; S2:I2 | MUST baseline; details under review | V1 project baseline | US-C01; US-C04 | NFR05 + document 03 proposed load/performance checks | CONFIRMED |
| NFR06 | Structured monitoring/investigation | S1 | MUST baseline; details under review | V1 project baseline | US-A08 | AC1 | CONFIRMED |
| NFR07 | Recovery/deployment gates | S1 | MUST baseline; details under review | V1 project baseline | US-A08 | AC2; numeric RPO/RTO remain proposed | CONFIRMED |
| NFR08 | Maintainability/testability | S1 | MUST baseline; details under review | V1 project baseline | — | NFR08 later design/static review | CONFIRMED |
| NFR09 | Integration readiness/gateway portability | S1; S2:BC2 | MUST baseline; details under review | V1 project baseline | US-A07 | NFR09 later contract/design review; Q30 resolved — no additional V1 integration | CONFIRMED |
| NFR10 | Historical/data/money consistency | S1 | MUST baseline; details under review | V1 project baseline | US-A01; US-C03 | US-A01 AC2; US-C03 AC2; NFR10 rollback checks | CONFIRMED |
| NFR11 | Testing pyramid/negative journeys | S1 | MUST baseline; details under review | V1 project baseline | US-C04; US-O01 | Cross-journey verification in document 04 | CONFIRMED |
| NFR12 | Mandatory CI/static/test/build checks | S1 | MUST baseline; details under review | V1 project baseline | — | NFR12 required checks before release | CONFIRMED |
| NFR13 | SDLC documentation | S1; S5 | MUST baseline; details under review | V1 project baseline | — | Seven Phase 1 files now; later documents by approved phase | CONFIRMED |
| NFR14 | Legal/privacy/tax configuration | S4:I2–J2, AG2–AI2; S5 §12 | MUST baseline; details under review | V1 project baseline | US-A06; US-C03 | US-A06 AC4; US-C03 AC2; Q07/Q20 | OPEN |
| NFR15 | Critical-action auditability | S1; S4:V2–W2 | MUST baseline; details under review | V1 project baseline | US-A03 | AC2 | CONFIRMED |
| NFR16 | SEO/indexing | S1 | MUST baseline; details under review | V1 project baseline | US-C10 | AC1 | CONFIRMED |
| NFR17 | Premium/minimal brand direction | S2:AH2, AJ2 | MUST baseline; details under review | V1 project baseline | US-C01 | NFR17 later brand/UX review; Q33 inputs | CONFIRMED |

**ENGINEERING RECOMMENDATION / RECOMMENDED:** Numeric performance, availability, recovery, detection, browser support and accessibility targets remain the proposal table in document 03. Their approval is Q19, not inferred from S4. No implementation test result is claimed.

## Final questionnaire answer coverage

This compact reconciliation index covers every response column, including blanks and unallocated answers. It prevents a worksheet answer from being lost between requirements, stories and release scope. S4:A2 is response timestamp metadata, not a product requirement; both S4 worksheets were inspected and `Sheet1` is empty.

| Question / source cell | Actual response / interpretation | Requirement(s) | Story / acceptance | Scope / question disposition |
|---|---|---|---|---|
| 1 / B2 | Browse/search, categories, cart, card, transfer, stock, delivery calculation, tracking, email | FR-CAT-001/003, FR-CART-001, FR-PAY-001, FR-INV-001, FR-SHP-001/002, FR-NOT-001 | US-C01 AC1; US-C02 AC1–AC3; US-C04 AC2–AC3; US-C05 AC1–AC3 | V1 confirmed; residual allocations resolved by S6/Q29 |
| 2 / C2 | Reviews, bulk discounts, advanced reports later | FR-REV-001, FR-PRC-002, FR-RPT-002 | US-R05 AC1; US-C03 AC3; US-A04 AC2 | POST-MVP / LATER RELEASE; Q06/Q28 deferred; Q14/Q15 narrowed |
| 3 / D2 | Some products only — question asks own price AND stock per option | FR-CAT-002, FR-INV-001 | US-C01 AC2–AC3 | V1 applicable variant capability; Q24 data examples remain |
| 4 / E2 | Yes, variants may have different prices | FR-CAT-002, FR-PRC-001 | US-C01 AC3; US-C03 AC1 | V1; Q05/Q24 partial |
| 5 / F2 | Product hidden automatically at zero stock | FR-INV-001/002 | US-A02 AC2–AC3 | V1; Q04 mixed-variant/restock rules remain |
| 6 / G2 | Business owner updates stock | FR-INV-001, FR-ADM-001 | US-A02 AC1; US-I01 AC1 | V1 initial responsibility; Q13 grants review |
| 7 / H2 | Bulk rules: decide later | FR-PRC-002 | US-C03 AC3 | POST-MVP; Q06/Q28 deferred |
| 8 / I2 | Taxes added during checkout | FR-TAX-001 | US-C03 AC2 | V1 behavior; Q07 rates/treatment open |
| 9 / J2 | Yes, tax separately on invoice/receipt | FR-TAX-001 | US-C03 AC2 | V1; Q07 legal configuration |
| 10 / K2 | Automatically through payment gateway | FR-PAY-001/002 | US-C04 AC3–AC5 | V1; Q25 mechanism resolved, exception subpart Q10 |
| 11 / L2 | Yes, order reserved during payment | FR-INV-003 | US-C02 AC2; US-C04 AC7 | V1 order reservation; stock protection enabler; Q04 |
| 12 / M2 | Yes, failed payment retry on same order | FR-PAY-003/004 | US-C04 AC6–AC7 | V1; Q10 retry/late rules |
| 13 / N2 | Logistics provider supplies price | FR-SHP-001 | US-C04 AC2 | V1 / THIRD-PARTY DEPENDENCY; Q08 |
| 14 / O2 | Blank: no rate sheet or promise of a sheet supplied | FR-SHP-001 | US-C04 AC2 conditional on rates | OPEN configuration; Q08/Q31 |
| 15 / P2 | Delivery provider not yet decided | FR-SHP-001/002 | US-C04 AC2; US-O01 AC3 | THIRD-PARTY DEPENDENCY; Q08 non-blocking |
| 16 / Q2 | Customer gets logistics tracking number/link | FR-SHP-002 | US-C05 AC2–AC3; US-O01 AC3 | V1; Q27 definition resolved, actor remains |
| 17 / R2 | Same day to request return | FR-RET-001 | US-G02 AC1–AC2; US-R04 AC1–AC2 | V1 policy; Q26 clock open |
| 18 / S2 | Damaged, wrong delivered, defective | FR-RET-001 | US-G02 AC1–AC2 | V1 eligible reasons; Q11 residual policy |
| 19 / T2 | Yes, guest can request return | FR-RET-003 | US-G02 AC1–AC2 | V1; Q32 entitlement resolved, channel remains |
| 20 / U2 | Business owner approves refund | FR-RET-004 | US-A06 AC1–AC3 | V1; Q11/Q13 execution detail |
| 21 / V2 | Owner/Super Admin, Order Processing, Inventory/Store Staff | FR-ADM-001 | US-A03 AC1; US-O01 AC1–AC2; US-I01 AC1 | V1 three roles; Q13 matrix approval |
| 22 / W2 | Yes, job-restricted staff functions | FR-ADM-001 | US-A03 AC1–AC2 | V1; exact permissions proposed |
| 23 / X2 | No database migration | FR-DAT-001 | Scope exclusion; no runtime story | OUT OF SCOPE legacy migration; Q17 subpart closed |
| 24 / Y2 | Historical answer Other; superseded by S6/Q30: no additional V1 integration | FR-INT-001 | US-A07 AC1 | RESOLVED Q30; additional business-system integration out of V1 scope |
| 25 names / Z2 | Client will provide | FR-CNT-001 | US-A01 AC3 | CLIENT RESPONSIBILITY; Q31 remaining gaps only |
| 25 prices / AA2 | Client will provide | FR-CNT-001 | US-A01 AC3 | CLIENT RESPONSIBILITY; Q31 |
| 25 descriptions / AB2 | Developer should prepare | FR-CNT-001 | US-A01 AC3 | DEVELOPER RESPONSIBILITY; no facts invented |
| 25 images / AC2 | To be discussed | FR-CNT-002 | US-A01 AC3 | OPEN responsibility; Q31 |
| 25 stock / AD2 | Client will provide | FR-CNT-001, FR-INV-001 | US-A01 AC3; US-A02 AC1 | CLIENT RESPONSIBILITY; Q31 |
| 25 logo/branding / AE2 | Client will provide | FR-CNT-001; NFR17 | US-A01 AC3; NFR17 review | CLIENT RESPONSIBILITY; Q31/Q33 |
| 25 rates / AF2 | To be discussed | FR-CNT-002, FR-SHP-001 | US-A01 AC3; US-C04 AC2 | OPEN responsibility; Q31/Q08 |
| 25 returns policy / AG2 | Developer should prepare | FR-POL-001 | US-A06 AC3–AC4 | DEVELOPER DRAFT; client/legal approval; Q11/Q31 |
| 25 privacy / AH2 | Developer should prepare | FR-POL-001; NFR14 | US-A06 AC4 | DEVELOPER DRAFT; client/legal approval; Q20 |
| 25 terms / AI2 | Developer should prepare | FR-POL-001; NFR14 | US-A06 AC4 | DEVELOPER DRAFT; client/legal approval; Q20 |
| 26 / AJ2 | Date can be changed | PR-SCH-001 | Document 06 launch statement; no runtime story | PREFERRED / NON-BINDING TARGET; Q01 |
| 27 / AK2 | No event/campaign/commitment tie | PR-SCH-001 | Document 06 launch statement | PREFERRED / NON-BINDING TARGET; Q01 event subpart resolved |
| 27A / AL2 | Blank after No; no event explanation needed | PR-SCH-001 | No additional runtime criterion | NO LONGER APPLICABLE subquestion; not another open record |
| 28 / AM2 | Historical request for thinking time; S6 supplies final allocation, with no other essential V1 feature declared | No additional feature ID invented | Q29 scope acceptance | RESOLVED Q29; future additions require scope review |

## Traceability limits and release gate

Every populated workbook answer remains mapped above; superseded Q29/Q30 evidence is explicitly historical. S6 is the final source for those decisions; no new feature or integration is invented.

The matrix covers 47 functional/project/responsibility entries and all 17 existing NFRs. Detailed sources, classifications and exceptions remain in documents 01–06; this index does not replace them. Q29/Q30 are RESOLVED; baseline v1.0 is PHASE 1 READY FOR APPROVAL; deferred features, recommended permission grants and proposed numeric targets are not silently promoted into confirmed V1 scope.

No architecture or implementation is included.

## Final client clarification trace — S6, 2026-09-20

| Client answer | Requirement / acceptance | Final release / decision |
|---|---|---|
| Customer account V1 | FR-ACC-001; US-R01 AC1 | MUST / V1 |
| Saved addresses and history V1 if accounts included | FR-ACC-002; US-R01 AC2–AC3 | Condition satisfied; MUST / V1 |
| Wishlist later | FR-ACC-003; US-R02 AC1 | POST-MVP |
| Reorder later | FR-ACC-004; US-R03 AC1 | POST-MVP |
| Marketing / abandoned-cart reminders later | FR-MKT-001/002; US-C09 AC1–AC2 | POST-MVP; transactional email unchanged |
| Basic sales/order/stock reports V1 | FR-RPT-001; US-A04 AC1, AC3 | MUST / V1 operational reporting |
| Advanced analytics/reports later | FR-RPT-002; US-A04 AC2 | POST-MVP |
| Nothing / no additional third-party integration | FR-INT-001; US-A07 AC1 | Q30 RESOLVED; additional V1 business systems excluded; existing operating dependencies retained |
| No other essential V1 feature declared | Q29 scope acceptance | Q29 RESOLVED; no feature invented |

Source S6 is the final client clarification supplied directly in the user's message. Scope baseline version/date: **v1.0 / 2026-09-20**. Readiness is not approval or permission to start Phase 2.
