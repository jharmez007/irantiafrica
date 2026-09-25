# 31 — Open decisions and implementation gates
Architecture v0.1, 2026-09-20. Phase 1 remains approved; Q29/Q30 stay RESOLVED. The classifications below concern **the affected future implementation**, not a reopening of Phase 1. “Before implementation” does not mean every foundation task must wait for every operational value.

## MUST RESOLVE BEFORE IMPLEMENTATION
| Decision | Phase 1 records | Owner / affected phase | Proposed direction / evidence required |
|---|---|---|---|
| A01 Stack patch/extension/tool compatibility and repository/UAT ownership | Q23 | Developer + client approver; 3A | Confirm supported patches/provider availability, approve ADRs; authorized foundation spike proves dependency resolution/build before full scaffolding |
| A02 Single store/stock pool and actual variant examples/SKU normalization | Q01/Q03/Q04/Q24 | Client + developer; 3C/3D | One default SKU for simple products; one pool. Multiple allocation locations would require schema ADR before stock code |
| A03 Reservation expiry/retry/zero-stock/restoration/adjustment rules | Q04/Q10/Q25 | Client owner + developer; 3D/3H | DB reservations; failed attempt retains eligible order; late money review; approve timeout/max extension and example outcomes |
| A04 Financial rounding/tax calculation semantics | Q05/Q07 | Client/tax adviser + developer; 3F | Exact money arithmetic, separate tax, original refund allocations; approve worked examples, shipping tax/exemptions model |
| A05 Fulfillment/cancellation/partial shipment and payment-exception outcomes | Q09/Q10/Q25/Q27 | Client owner + developer; 3G/3H/3I | One shipment/order, explicit transitions; late/duplicate collections held for review; no manual bank-transfer confirmation |
| A06 Return clock/outcomes/partial/evidence/restock/refund method | Q11/Q26 | Client/legal + developer; 3J | Same calendar day remains undefined until anchor/timezone/cutoff agreed; owner refund approval; no guessed 24-hour rule |
| A07 Identity/guest proof/cart merge and RBAC/MFA/recovery | Q12/Q13/Q32 | Client owner + developer; 3B/3E | Sanctum sessions, scoped guest link, proposed matrix, mandatory staff MFA recommendation; review required fields and limits |
| A08 Language/device scope and policy affecting data/security design | Q02/Q20/Q33 | Client + developer; relevant UX/security work | English-first assumption, modern browsers; surface material legal/localization requirements before affected implementation |
| A09 Basic reporting definitions — RESOLVED | Q14 | Client approval, 2026-09-24; Phase 3L | Africa/Lagos, applied receipts by application date, completed refunds by completion date, net collections; historical item performance; existing matrix and per-variant thresholds. Launch threshold values remain tuning. See reporting guide. |
| A10 Notification trigger set | Q16 | Client + developer; 3K | Required order/payment and auth enablers; separately approve optional transactional updates |

Numeric values such as reservation minutes or tax rates can be loaded later **once their semantics and edge-case behavior are approved**. Gate A03/A04 does not demand all production values before generic configuration components can be built. No blocking answer is requested in this architecture-only turn.

## MUST RESOLVE BEFORE PRODUCTION
| Decision | Records | Owner / closure evidence |
|---|---|---|
| P01 Legal seller/approver, budget, operational support/incident owners | Q01/Q22/Q23/Q31 | Client + developer; signed responsibilities, payer/access/escalation/recovery roster |
| P02 Merchant onboarding, live card/transfer/refund capability and reconciliation | Q10/Q25 | Client + Paystack + developer; account/channel and controlled live verification evidence |
| P03 Delivery provider, nationwide coverage/rates and tracking handoff | Q08/Q27/Q31 | Client/logistics; source prices, named supply actor, tested destination/rate cases; no API assumed |
| P04 Actual tax rates/categories/effective dates and receipt/invoice treatment | Q07 | Client/tax adviser; approved configuration/examples |
| P05 Policy content, retention, privacy/processors and return terms | Q11/Q20/Q26/Q31 | Developer drafts; client/legal approves; configuration consistent with policy |
| P06 Hosting/vendor/region, supported versions, budget, availability/recovery and operators | Q18/Q19/Q22/Q23 | Client + developer; measured load/restore and cost plan; no unapproved SLA |
| P07 Sender/provider, domain access, DNS/email authentication, support contact | Q16/Q21/Q22 | Client + developer; deliverability/TLS/renewal checks |
| P08 Catalog names/prices/stock, descriptions, images/licensing and branding | Q03/Q24/Q31/Q33 | Client core data/branding; developer descriptions; image ownership still assign; approved launch dataset |
| P09 UAT, security review, backup drill and production release authorization | Q19/Q23 | Named business/technical owners; reviewed evidence and explicit release decision |

## CAN BE CONFIGURED LATER
| Decision | Records | Boundary |
|---|---|---|
| Cache TTL, queue retry tuning, dashboard thresholds, media sizes | Q18/Q19/Q22 | Engineering defaults reviewed/tested before live use; values can evolve without changing scope |
| Approved low-stock thresholds, report date presets | Q04/Q14 | Definitions/access resolved first; operational tuning later |
| Validity dates/rate values/tax values, approved templates | Q05/Q07/Q08/Q16 | Must be correct before any affected live transaction; “later” never means missing config may charge zero |
| Reference URLs, final visual tokens/content layout | Q21/Q33 | Before UX acceptance, no schema blocker |
| Deferred feature policy | Q06/Q15/Q28 | Only when approved later release is planned; no V1 implementation |

Q17 has no new integration/migration discovery; its remaining internal stock documentation is A02/A03. Q24 representative data is A02/P08. Q29 and Q30 are closed and not gates. Q32 guest entitlement is settled; only secure mechanism A07 needs review. This maps all 33 Phase 1 records without reclassifying resolved business decisions.

## Risks, assumptions and change control
No confirmed business contradiction or implementation impossibility was found. Engineering ADRs are proposed, not client-approved policy. Single stock pool, English-first presentation, one shipment/order, manual carrier rate/tracking entry and managed-platform operating model require later confirmation at the gates above. A requirement for warehouses, internationalization, partial shipments or live carrier automation can alter cost/schema and must be recorded as a change request/ADR amendment before affected work.

External side effects cannot promise mathematical exactly-once delivery: durable logical intents and reconciliation are the chosen control (ADR-004/007). Numeric availability/performance/recovery recommendations need cost and measured evidence. No support/version/build claim here substitutes for installing/testing the authorized foundation.

**Readiness:** architecture review package complete; ready for Phase 2 approval. Implementation has not begun and is not authorized by this document. After approval, 3A may proceed only with A01 ownership/version review; subsequent phases respect their specific gates.

## A07 identity/RBAC disposition — 2026-09-21
The client has now approved document 17 exact grants and mandatory staff TOTP MFA, hashed one-use recovery codes and controlled administrative reset. These Phase 3B gates are resolved; customer MFA is not required. Guest order capabilities/cart merge remain with their affected later commerce phases under the narrowed Phase 3B instruction. No other gate is reopened.

## A02 catalog disposition — 2026-09-22
The client authorized Phase 3C on the approved generic model and explicitly approved administrator-entered SKUs normalized by trimming/uppercasing, globally unique through archival. Catalog schema implementation is complete without stock fields. Representative real product/option data and images remain content acceptance inputs (P08), not missing generic schema authorization. The single stock pool and stock behavior portion remains with A02/A03 before Phase 3D; no warehouse/allocation decision was invented. See [catalog implementation](../development/catalog.md) and its Phase 3C approval report.

## A02/A03 inventory policy disposition — 2026-09-22
The client confirmed **one shared stock pool** for Phase 3D. Availability is on-hand minus reserved. Listings/search/category results/sitemap exclude a product with no available active variant; unavailable variant choices are disabled. Published informational out-of-stock detail pages remain accessible. Replenishment restores browsing eligibility only if publication conditions still hold. These implementation policies are resolved; operational TTL and thresholds remain configurable, and payment-specific policy remains with its affected phase. ADR-013 revision 1 was returned for revision. Revision 2 was approved in principle with explicit implementation authorization and implemented on 2026-09-23 using fully inventory-owned references. The configurable engineering TTL is 900 seconds with no in-place extension; final operational values remain non-blocking. See the Phase 3D report for completed PostgreSQL/API/concurrency verification. The client subsequently formally approved Phase 3D and authorized Phase 3E.

## A07 cart disposition — 2026-09-23
The client explicitly approved preserving requested merge quantities with stock-limited suggestions requiring customer acceptance, and configurable defaults of 99 units/line, 100 distinct variants/cart and 30-day guest inactivity. Account carts persist until explicitly cleared. Phase 3E implements these policies with PostgreSQL ownership, opaque encrypted guest capability, atomic bounded merge, current server prices and read-only inventory availability. Hard-limit merge overflow preserves both carts for correction/retry. The cart portion of A07/Q12 is resolved; guest order proof remains with its later affected phase. See [cart contract](../development/cart.md) and [Phase 3E report](../development/phase-3e-report.md). No checkout implementation or production authorization follows from this disposition.

## Phase 3F review / A04 pending — 2026-09-23
The client formally approved Phase 3E and authorized checkout preparation. Cart/Inventory policies remain unchanged. [ADR-014](adr/014-checkout-before-orders.md) documents the requested pre-order checkout session/reservation staging. A04 is still OPEN before tax calculation implementation: [worked proposal](../development/checkout-policy-review.md) covers per-line half-up rounding, separate configured delivery tax and deterministic unit allocation. An explicit client answer is pending. Actual rates, exemption labels, coverage/prices/provider and production invoice/retention inputs remain later configuration once semantics are approved. No checkout runtime or Phase 3G implementation has started.

## A04 approved and Phase 3F implemented — 2026-09-23
The client formally approved the reviewed calculation proposal with binding tax-exclusive, per-line HALF-UP, sum-of-lines, explicit separate delivery-taxable/rate, exact-kobo and deterministic historical allocation rules. A04 calculation semantics are RESOLVED. Actual applicable rates/exemptions/delivery taxability/effective dates remain business/accounting configuration, not missing arithmetic authorization. [ADR-014](adr/014-checkout-before-orders.md) records the implemented checkout-session staging and atomic configuration bundles. See [tax examples](../development/tax.md) and [Phase 3F report](../development/phase-3f-report.md). No production rate or Phase 3G/payment authorization is inferred.

## Phase 3G disposition — 2026-09-23

Phase 3F is formally approved. A05/Q09/Q11 unpaid cancellation subset is resolved under the client's explicit delegation: owning customer/scoped guest or Super Admin, PENDING_PAYMENT only with no payment activity, idempotent release/history retention. Other staff cannot cancel. Paid cancellation, fulfillment and payment exceptions remain later gates.

A07/Q12 initial guest order access is explicitly approved: separate order-scoped HttpOnly capability, configurable 24-hour absolute default with no read renewal. Email-link recovery is explicitly deferred. Matching email/reference alone grants no access. [ADR-015](adr/015-checkout-order-promotion.md) records the exact handoff and deviations. No remaining order-specific policy blocker was identified for this pre-payment phase.

## Phase 3H scoped implementation — 2026-09-23

Phase 3G is formally approved. The latest Phase 3H authorization explicitly requires late/expired/cancelled and extra payments to retain evidence for review, with no automatic fulfillment/refund. Existing hold lifetime is unchanged; retries after provider-confirmed failed/abandoned attempts use the same eligible order/hold and a fresh reference. No unresolved active/unknown attempt may be bypassed. PENDING_PAYMENT may become PAID only through verified receipt plus InventoryService consumption, or PAYMENT_REVIEW for anomalies. CANCELLED and already-PAID milestones are preserved. This closes the payment-correctness subset of A03/A05 for implementation; financial exception resolution/refund policy, merchant channel readiness, alert ownership and production origins remain later gates. See [payment operations](../development/payments.md). No new fulfillment or refund policy is inferred.

## Phase 3I shipping disposition — 2026-09-24

The client explicitly confirmed one shipment/order and provider-neutral manual fulfilment with staff delivery confirmation. These V1 implementation assumptions are resolved. Existing HTTPS/approved-host tracking policy and approved RBAC remain in force; no logistics company/API is invented. P03 remains a production operational gate for carrier/rates/coverage, approved tracking hostnames and evidence/handoff procedure. A financial hold blocks new preparation/dispatch but leaves already shipped delivery facts recordable. Optional fulfilment notification delivery remains with A10/Phase 3K. Actual Paystack external verification is still a separate production/UAT payment gate and explicitly does not block Phase 3I. See [shipping](../development/shipping.md) and [fulfilment](../development/fulfilment.md).
