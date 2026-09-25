# IRANTI Africa — User stories and acceptance criteria

**Phase 1 baseline v1.0 — 2026-09-20. Status: PHASE 1 READY FOR APPROVAL; approval pending.** Sources and detailed status are recorded below.

AC numbers are local to each stable story ID. Each criterion uses GIVEN/WHEN/THEN; wording is a reviewable translation of evidence/controls, not proof of implementation. Criteria dependent on an open policy remain conditional until that policy is approved.

V1 features, required technical enablers, the newly allocated account/reporting requests and POST-MVP / LATER RELEASE features are explicitly separated below. A deferred acceptance criterion is not a V1 test requirement. Confirmed staff roles now include Inventory / Store Staff. Finance, marketing, support and management responsibilities do not imply additional role categories.

## Customer

<a id="us-c01"></a>
### US-C01 — Discover products and select applicable options

**V1 — CONFIRMED REQUIREMENT; detail behavior is REQUIRED ENABLING REQUIREMENT.** Trace: BO01/BO03 → FR-CAT-001, FR-CAT-002, FR-CAT-003, FR-CAT-004; S4:B2, D2–E2.

- **AC1:** GIVEN published products and categories, WHEN I browse a category or search, THEN matching products are available with an understandable empty state.
- **AC2:** GIVEN a simple product, WHEN I view/select it, THEN purchase does not require nonexistent variant options and the current price and availability are clear.
- **AC3:** GIVEN a product whose options have separate prices and stock, WHEN I select an applicable option, THEN that option's approved price and quantity availability apply; another option's stock cannot satisfy its purchase.

Real attributes/SKUs and mixed-variant hiding behavior remain Q03/Q24/Q04; no size/colour combination is invented.

<a id="us-c02"></a>
### US-C02 — Manage cart and available inventory

**V1 — CONFIRMED REQUIREMENT plus S1 engineering controls.** Trace: BO01/BO02 → FR-CART-001, FR-INV-001, FR-INV-003; S4:B2, F2, L2; S2:N2.

- **AC1:** GIVEN a valid cart, WHEN I add/change/remove a quantity, THEN the accepted total is recalculated server-side and invalid quantities or fabricated prices cannot control it.
- **AC2:** GIVEN one available unit and competing payment reservations, WHEN customers attempt to secure it, THEN at most one can reserve/buy that unit and inventory never becomes negative.
- **AC3:** GIVEN a stale cart containing now-unavailable stock, WHEN checkout is attempted, THEN it cannot purchase that stock even if the product was visible when added.

Q04 defines timeout, availability versus physical stock, deduction/release and retry rules.

<a id="us-c03"></a>
### US-C03 — See NGN prices and separately disclosed tax

**V1 for AC1–AC2; POST-MVP / LATER RELEASE for AC3.** Trace: BO01 → FR-PRC-001, FR-TAX-001, FR-PRC-002; S2:P2, V2; S4:C2, E2, H2–J2.

- **AC1:** GIVEN common customer prices and an applicable variant, WHEN the basket is priced, THEN the selected product/variant price is used in NGN without a V1 bulk-discount tier.
- **AC2:** GIVEN approved applicable tax rules, WHEN checkout totals and an invoice/receipt are produced, THEN tax is added and shown separately; missing tax configuration is not treated as client-approved zero tax.
- **AC3:** GIVEN a future approved bulk-discount policy, WHEN a later-release basket crosses an approved threshold, THEN the discount follows that policy; this criterion is not a V1 acceptance gate.

Q07 supplies legal/tax configuration; Q06/Q28 are deferred, not V1 blockers.

<a id="us-c04"></a>
### US-C04 — Reserve, pay and retry the same order

**V1 — CONFIRMED REQUIREMENT with required enablers and S1 controls.** Trace: BO01/BO02/BO03 → FR-CHK-001, FR-PAY-001, FR-PAY-002, FR-PAY-003, FR-PAY-004, FR-INV-003, FR-SHP-001; S4:B2, I2–N2.

- **AC1:** GIVEN a valid purchasable cart and required contact/delivery data, WHEN I continue to payment, THEN a recoverable order identifies the selected items and authoritative NGN totals.
- **AC2:** GIVEN an approved Nigerian delivery destination and provider-supplied pricing, WHEN delivery is calculated, THEN the applicable charge is shown before payment; missing rates cannot silently become free delivery.
- **AC3:** GIVEN a successful card or gateway-managed transfer for the expected order/reference/amount/currency, WHEN independently verified gateway evidence arrives, THEN the payment result is recorded automatically; a manual proof upload is not the confirmed transfer-confirmation process.
- **AC4:** GIVEN a browser success redirect or unauthenticated webhook, WHEN it arrives without valid independent evidence, THEN it cannot mark the order paid or authorize fulfilment.
- **AC5:** GIVEN repeated/reordered verified payment events, WHEN processing is retried, THEN order creation, stock deduction, confirmations and fulfilment are not duplicated.
- **AC6:** GIVEN an existing order with a failed payment and valid retry eligibility, WHEN I retry, THEN the same order is used and attempts/results remain traceable without duplicate charges or stock commitments.
- **AC7:** GIVEN an order reserved while payment is completed, WHEN payment times out, fails or succeeds late, THEN the approved reservation/reconciliation policy determines the outcome; no overselling or unverified fulfilment is permitted.

AC6–AC7 require Q04/Q10 timeout/retry/late-success rules; rate/provider setup Q08, tax Q07. No timeout value is assumed.

<a id="us-c05"></a>
### US-C05 — Receive email and a logistics tracking reference

**V1 — CONFIRMED REQUIREMENT.** Trace: BO02/BO03 → FR-NOT-001, FR-ORD-003, FR-SHP-002; S4:B2, Q2; S2:AC2.

- **AC1:** GIVEN an approved order/payment confirmation event, WHEN notification processing repeats or email temporarily fails, THEN one logical confirmation is generated and the order is preserved.
- **AC2:** GIVEN authorized access to my dispatched order and a supplied logistics reference, WHEN I view tracking, THEN its tracking number/link and approved order progress are available without exposing another customer's details.
- **AC3:** GIVEN no tracking number/link is yet available, WHEN I view the order, THEN the system does not invent a carrier reference or imply live tracking.

Email provider/templates Q16; carrier/reference entry workflow Q08/Q13.

<a id="us-c09"></a>
### US-C09 — Choose promotional messages

**DEFERRED REQUIREMENT — POST-MVP / LATER RELEASE (S6/Q29).** Trace: BO01/BO03 → FR-MKT-001, FR-MKT-002; S2:AP2–AQ2.

- **AC1:** GIVEN this feature is allocated to a release and an approved consent policy, WHEN I subscribe or withdraw, THEN future promotional sends honor that choice.
- **AC2:** GIVEN approved reminder timing/eligibility/suppression rules and an eligible abandoned cart, WHEN a reminder is due, THEN sends obey those rules; no interval or guest consent is invented.

Q15/Q20 policy belongs to the later marketing release. Transactional order/payment email remains V1.

<a id="us-c10"></a>
### US-C10 — Use an accessible and discoverable storefront

**V1 — CONFIRMED PROJECT REQUIREMENT (S1).** Trace: BO03 → FR-SEO-001, NFR04, NFR16; S1.

- **AC1:** GIVEN a published product, WHEN its public page is inspected, THEN approved content, product metadata and indexing controls are present and private customer/order data remain protected.
- **AC2:** GIVEN the agreed device/accessibility matrix, WHEN the core shopping journey is used by keyboard or assistive technology, THEN labels, focus, validation and controls permit completion.

Q19/Q21 targets/indexing decisions remain engineering review work, not new client feature selections.

## Guest Customer

<a id="us-g01"></a>
### US-G01 — Purchase without an account

**V1 — CONFIRMED REQUIREMENT.** Trace: BO01 → FR-ACC-005, FR-CHK-001; S2:R2; S4:T2.

- **AC1:** GIVEN valid purchase/contact/delivery information and available stock, WHEN I use guest checkout, THEN I can place and pay for the order without creating an account.
- **AC2:** GIVEN a guest order, WHEN payment, tracking or confirmation is accessed, THEN the same financial integrity and ownership protections apply as for any order.

Secure access mechanics Q12 are later design work. Registered accounts are also confirmed for V1 (S6/Q29).

<a id="us-g02"></a>
### US-G02 — Request an eligible return as a guest

**V1 — CONFIRMED REQUIREMENT.** Trace: BO02 → FR-RET-001, FR-RET-003; S4:R2–T2.

- **AC1:** GIVEN my guest order and an eligible damaged, wrongly delivered or defective item within the approved same-day window, WHEN I use the agreed return-request channel, THEN the request is accepted for review without requiring account creation.
- **AC2:** GIVEN an unowned order or an ineligible reason/time, WHEN I request a return, THEN ownership and approved policy checks reject it; acknowledgement is not a refund.

Q26 supplies start/cutoff; Q32 supplies secure identification/channel. Guest entitlement itself is settled.

## Registered Customer

<a id="us-r01"></a>
### US-R01 — Use an account, saved addresses and order history

**V1 — CONFIRMED REQUIREMENT (S6/Q29).** Trace: BO01/BO02 → FR-ACC-001, FR-ACC-002; S2:R2–S2; S6/Q29.

- **AC1:** GIVEN V1 customer accounts, WHEN a customer completes approved registration/login, THEN they can use registered checkout; guest checkout remains available.
- **AC2:** GIVEN my authenticated account, WHEN I save addresses or view orders, THEN only my own records are accessible and attempts at another customer's records fail.
- **AC3:** GIVEN a historic purchase, WHEN catalog details/prices later change, THEN order history still displays the preserved purchase-time snapshot.

Accounts, saved addresses and history are confirmed for V1. Recovery/verification and address limits remain non-blocking Q12 design decisions.

<a id="us-r02"></a>
### US-R02 — Save favourites

**DEFERRED REQUIREMENT — POST-MVP / LATER RELEASE (S6/Q29).** Trace: BO01 → FR-ACC-003; S2:S2.

- **AC1:** GIVEN the feature is included in a release and I have saved favourites, WHEN I return, THEN I can revisit my saved products without seeing another customer's list.

Wishlist is explicitly later-release scope (S6/Q29); persistence/guest behavior belongs to that release.

<a id="us-r03"></a>
### US-R03 — Reorder a past purchase

**DEFERRED REQUIREMENT — POST-MVP / LATER RELEASE (S6/Q29).** Trace: BO01 → FR-ACC-004; S2:S2.

- **AC1:** GIVEN this feature is included and I select my previous order, WHEN I reorder, THEN current price/stock/option validity are rechecked, unavailable stock cannot be bought, and the original order remains unchanged.

Reorder is explicitly later-release scope (S6/Q29); partial/unavailable-item behavior is decided for that release.

<a id="us-r04"></a>
### US-R04 — Request a return through an account

**V1 — CONFIRMED REQUIREMENT; account route now allocated by S6/Q29.** Trace: BO02 → FR-RET-001; S2:AF2; S4:R2–U2.

- **AC1:** GIVEN my V1 account and an item that meets the approved same-day/reason policy, WHEN I submit a request from my account, THEN it enters review without an automatic refund.
- **AC2:** GIVEN another customer's order or an ineligible item, WHEN I attempt the request, THEN it is rejected using ownership/policy checks.

V1 supports account-based and guest return requests; accounts remain optional for guest purchases.

<a id="us-r05"></a>
### US-R05 — Review a product

**DEFERRED REQUIREMENT — POST-MVP / LATER RELEASE.** Trace: BO01 → FR-REV-001; S4:C2.

- **AC1:** GIVEN the later release and approved review eligibility/moderation rules, WHEN I submit or edit a review, THEN those rules and authorship checks are enforced.

Not a V1 story/test gate. Review policy is deferred with the feature.

## Store Administrator — Business Owner / Super Admin

<a id="us-a01"></a>
### US-A01 — Maintain launch catalog and content

**V1 — REQUIRED ENABLING REQUIREMENT; responsibilities explicitly assigned.** Trace: BO01/BO02 → FR-ADM-002, FR-ORD-002, FR-CNT-001; S4:Z2–AE2; S1.

- **AC1:** GIVEN approved catalog permissions and product data, WHEN I create/update simple or variant products and categories, THEN their approved data becomes available under publication rules.
- **AC2:** GIVEN historical orders, WHEN catalog details/prices change, THEN purchased names, identifiers, variants, quantities and financial values remain intact.
- **AC3:** GIVEN launch preparation, WHEN catalog readiness is reviewed, THEN client-supplied names/prices/stock/branding and developer-prepared descriptions are checked; absent image responsibility is recorded as unresolved rather than assumed delivered.

Matrix Q13 and product samples/images Q24/Q31 remain pending.

<a id="us-a02"></a>
### US-A02 — Maintain stock and automatic visibility

**V1 — CONFIRMED REQUIREMENT.** Trace: BO02 → FR-INV-001, FR-INV-002, FR-ADM-002; S4:D2, F2–G2.

- **AC1:** GIVEN the business owner initially updates stock, WHEN an authorized quantity change is made, THEN stock changes remain attributable and inventory integrity is preserved.
- **AC2:** GIVEN a product meets the approved zero-stock condition, WHEN stock reaches zero, THEN it is automatically hidden from the storefront and stale requests cannot buy it.
- **AC3:** GIVEN mixed option availability or replenishment, WHEN stock changes, THEN the approved variant-hiding/reappearance policy applies without overwriting history.

Q04 defines available-versus-physical stock, mixed variants, release and reappearance; inventory staff do not automatically gain update permission.

<a id="us-a03"></a>
### US-A03 — Apply the three-role access boundary

**V1 — CONFIRMED REQUIREMENT; exact matrix is an ENGINEERING RECOMMENDATION.** Trace: BO02 → FR-ADM-001, NFR15; S4:V2–W2; S1.

- **AC1:** GIVEN the three launch roles and an approved permission matrix, WHEN staff request an action outside their assigned job, THEN the server denies it even if they bypass the visible menu.
- **AC2:** GIVEN an authorized critical change, WHEN it completes, THEN approved actor/action/time details are auditable; staff cannot grant themselves unauthorized permissions.

Approve document 02 matrix, MFA, revocation and audit readers/retention Q13/Q20.

<a id="us-a04"></a>
### US-A04 — Review reports at the agreed release level

**V1 — BASIC OPERATIONAL REPORTING confirmed; ADVANCED REPORTING / ANALYTICS deferred (S6/Q29).** Trace: BO01/BO02 → FR-RPT-001, FR-RPT-002; S2:AN2; S4:C2.

- **AC1:** GIVEN approved V1 sales/order metric definitions and controlled order/payment/refund data, WHEN permitted users view basic operational reports, THEN sales amounts and order counts reconcile with the agreed status, refund and period treatment.
- **AC2:** GIVEN a later release includes approved advanced reporting, WHEN detailed reports are generated, THEN they match agreed dimensions/periods and access controls; no advanced-report V1 commitment is implied.

- **AC3:** GIVEN controlled product/variant stock data and approved available/reserved quantity definitions, WHEN permitted users view the V1 stock report, THEN quantities reconcile to the authoritative inventory data and unauthorized users cannot access it.

S6/Q29 confirms the release boundary. Q14 retains only non-blocking metric, field, date/timezone, access and presentation decisions; no advanced analytical requirement is added to V1.

<a id="us-a06"></a>
### US-A06 — Approve refunds and policy content

**V1 — CONFIRMED REQUIREMENT / DEVELOPER RESPONSIBILITY / CLIENT RESPONSIBILITY.** Trace: BO02 → FR-RET-002, FR-RET-004, FR-POL-001; S4:U2, AG2–AI2; S5 §12.

- **AC1:** GIVEN a submitted refund request, WHEN someone attempts approval, THEN only the business owner can approve under the confirmed responsibility; request receipt alone is not approval.
- **AC2:** GIVEN an approved refund, WHEN it is executed or retried under the approved method/amount rules, THEN it cannot exceed the permitted refundable amount or execute twice.
- **AC3:** GIVEN a return/refund case, WHEN exchange, shipping costs, evidence/condition, partial return/refund or restocking is relevant, THEN the reviewed policy governs it; no missing rule is automatically invented.
- **AC4:** GIVEN developer-drafted returns/privacy/terms text, WHEN production release is reviewed, THEN required client/legal approval is recorded before the text is used.

Q11/Q20/Q26 must resolve policy; execution permission beyond owner approval is proposed, not client-confirmed.

<a id="us-a07"></a>
### US-A07 — Preserve the agreed integration boundary

**CONFIRMED EXCLUSION — no additional V1 business-system integration (S6/Q30).** Trace: FR-INT-001. This is a scope acceptance record, not a new runtime integration.

- **AC1:** GIVEN the client's no-additional-integration answer, WHEN V1 scope and its estimate are reviewed, THEN no additional business-system integration is included; existing gateway, logistics, email and hosting dependencies remain accounted for.

Q30 is RESOLVED. Any future additional integration requires a new approved requirement; none is recommended into V1.

<a id="us-a08"></a>
### US-A08 — Support investigation and recovery

**V1 — S1 project requirement; operational ownership remains Q22.** Trace: FR-OPS-001, NFR06, NFR07; S1.

- **AC1:** GIVEN a controlled payment/webhook/queue/checkout failure, WHEN the assigned operator investigates, THEN safe records identify the affected work without revealing secrets or unnecessary personal data.
- **AC2:** GIVEN approved recovery objectives and ownership, WHEN a restore exercise is performed, THEN critical data and reconciliation readiness meet those objectives.

Operator is a responsibility to assign, not an invented additional client RBAC role.

## Order/Fulfilment Staff

<a id="us-o01"></a>
### US-O01 — Process orders and attach tracking

**V1 — CONFIRMED REQUIREMENT plus required administration.** Trace: BO02/BO03 → FR-ORD-001, FR-SHP-002, FR-ADM-002; S2:AB2; S4:Q2, V2–W2.

- **AC1:** GIVEN the required payment evidence and approved permission/transition rules, WHEN I progress an order through client milestones, THEN status and action context are recorded.
- **AC2:** GIVEN an invalid transition, insufficient permission or unverified payment, WHEN I attempt payment-dependent fulfilment, THEN it fails without partial stock/order/payment changes.
- **AC3:** GIVEN an authentic logistics number/link and permission to record it, WHEN it is attached to the correct order, THEN that customer's tracking view displays it; the provider need not supply a real-time feed.

Transition exceptions and entry responsibility Q08/Q09/Q13 remain review decisions.

## Inventory / Store Staff

<a id="us-i01"></a>
### US-I01 — Access only assigned inventory functions

**V1 — CONFIRMED ROLE; exact access is an ENGINEERING RECOMMENDATION.** Trace: BO02 → FR-ADM-001; S4:G2, V2–W2.

- **AC1:** GIVEN the approved Inventory / Store Staff permissions, WHEN I access catalog/stock or attempt an adjustment, THEN only granted functions are available; existence of this role does not override the confirmed initial owner stock-update responsibility.

Proposed read-restricted initial permissions in document 02 require approval Q13.

## Cross-journey verification

**CONFIRMED PROJECT REQUIREMENT — S1:** Test the core Browse → Select product → Cart → Checkout → Payment → Confirmation journey and authorized catalog/stock/order/fulfilment operations, including negative cases.

**ENGINEERING RECOMMENDATION:** Include zero-stock hiding with stale carts, independent variant stock, concurrent reservations, payment retry and late events, missing delivery/tax configuration, tracking isolation, same-day boundary cases, guest return access and refund authorization. Stock timeout, return clock and refund rules must first be agreed; tests cannot silently create business rules.

Registered-account, saved-address, order-history and basic sales/order/stock reporting journeys are V1 acceptance coverage. Wishlist, reorder, marketing/cart reminders, reviews, bulk discounts and advanced reporting are tested in their later release. No application code or executable tests are produced in Phase 1.
