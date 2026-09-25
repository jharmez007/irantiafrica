# Phase 3F calculation policy — approved review record

2026-09-23. **A04 is now formally APPROVED by the client, including the binding delivery-taxable boolean and historical allocation rules.** See [implemented tax contract](tax.md). The proposal below is retained as the reviewed decision record; its pending wording is historical and no longer a gate.

Phase 3E is formally APPROVED. Phase 3F checkout preparation is authorized; Phase 3G order implementation is not. This is a review proposal, not an implemented checkout or approved tax policy.

## Confirmed boundaries

The reviewed requirements and architecture require guest/account checkout, Nigerian location-based delivery, server-calculated NGN totals, separately added tax and missing-configuration failure. Cart reads/writes remain reservation-free. Valid checkout reserves through the approved Inventory service only. Card and gateway-confirmed bank transfer remain later payment work. An unidentified carrier API is not a dependency. Actual rates, coverage and tax treatment cannot be fabricated.

Sources reviewed: architecture 08/09/10/13/14/16/18/31/32, ADR-013 revision 2, Phase 1 functional requirements/scope/open questions, current CartService/CartCatalog/CartSession, InventoryService and the current authentication/session/MFA boundary. Existing Git changes are retained; no clean baseline or commit is implied.

## Required decision: A04 calculation semantics

Architecture 13 explicitly states: “Rounding level/mode and allocation for refund reversals require approved examples before checkout/tax implementation.” Architecture 31 identifies A04 as a before-implementation gate. The new instruction permits configurable rates and development samples, but does not choose those arithmetic semantics.

The following is an engineering proposal for approval, not a legal rate recommendation:

1. Catalog unit prices are tax-exclusive, consistent with adding tax at checkout. No inclusive-price conversion in V1 without a later explicit requirement.
2. Compute each full line's net base as quantity × integer unit-price kobo. Apply its explicitly configured exact decimal fractional rate, then round that line's tax half-up to the nearest kobo. Sum the rounded line tax amounts. Do not round tax per unit before multiplying or round only once on the combined basket.
3. Delivery uses its own explicit tax rule/category, rounded half-up once on the delivery charge. Product tax categories do not implicitly determine delivery treatment. A missing product or delivery tax rule fails validation; exempt/zero treatment requires an explicit rule and label.
4. For reproducible future partial reversals, record each line's rounded tax and its deterministic unit allocation: integer quotient per unit, then one additional kobo on the first remainder units in a stable unit sequence. No refund workflow is implemented now.
5. Preserve rule IDs/versions, category/treatment labels, exact rate, basis, rounding policy and amounts in checkout snapshots. Configuration changes trigger revalidation and explicit review, not a silent price guarantee or update to an accepted total.

All examples below use **DEVELOPMENT CONFIGURATION ONLY**, with a hypothetical 10% rate (`0.100000000`). It is not a client production rate or a statement of applicable law.

| Example | Exact calculation | Proposed stored result |
|---|---|---|
| One line: 3 units × 335 kobo | Base 1005; tax 100.5 | Line tax 101; unit tax allocation 34, 34, 33 |
| Two separate lines, each base 1005 kobo | Each tax 100.5 rounds independently | Total item tax 202, not basket-rounded 201 |
| Delivery base 505 kobo at separately configured 10% | Tax 50.5 | Delivery tax 51 |
| Combined two-line example plus delivery | Subtotal 2010 + tax (202 + 51) + delivery 505 | Checkout total 2768 kobo, serialized as "2768" |
| Explicit zero-rated delivery | 505 × 0 | Delivery tax 0 with explicit rule/label retained |
| Missing category or delivery rule | No authorized rate/treatment | TAX_CONFIGURATION_REQUIRED; no reservation |

The separate delivery rule refines the logical `shipping_taxable` flag in architecture 08, which otherwise leaves mixed-category shipping-rate selection ambiguous. Record this physical mapping in the checkout ADR once the proposal is approved. Production rates, taxable/exempt categories and legal invoice requirements remain client/adviser inputs before launch; they need not block an approved generic calculator with fail-closed defaults.

## Design that can proceed without inventing tax policy

- Stage checkout-owned snapshots/reservations before orders as described in ADR-014; no stub order/payment rows.
- Use explicit quote review, current cart/version checks and no reservation until delivery/tax/address validation succeeds.
- Use state/FCT-controlled Nigerian addresses, optional line2/postal code and flexible city/locality. Saved addresses remain user-owned; copying one creates an independent checkout snapshot.
- Use versioned local shipping zones/rates with explicit locality override and configured state fallback. Missing/ambiguous coverage fails closed. No production seed rates.
- Retain the 900-second configurable reservation default without extending it on read/retry. Cancel/expiry call the existing Inventory service and preserve history.
- Preserve the existing cart and its approved behavior; keep payment/order actions unavailable.

Executable tax calculation and integrated reserve/total behavior wait for A04 approval. This review does not request approval again for already-approved cart or inventory decisions.
