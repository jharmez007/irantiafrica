# 14 — Shipping and delivery
Trace: FR-SHP-001/002, Q08/Q27/Q31. Nationwide Nigeria and location-based charges remain required. Provider selection, actual prices/coverage and rate-supply responsibility are outstanding.

ShippingQuoteProvider is an internal contract. V1 implementation is a versioned local rate table based on logistics-supplied prices: destination state/locality/zone, service label, NGN charge, valid dates and source reference. Client/provider must supply a complete serviceability mapping; unknown or ambiguous address coverage rejects checkout rather than assuming a national flat fee. Shipping weight bands are not presumed required; add only if actual tariff requires them and review schema before implementation.

A quote identifies rate version, destination match, amount and expiration. Checkout rechecks rate/version and snapshots service/provider label, net shipping/tax and source. Old orders do not change when rates change. Configuration has review/publish audit; no arbitrary customer-supplied shipping amount.

Shipment is separate from order and carries provider label, tracking number, validated HTTPS tracking URL, shipped_at and delivered_at. V1 assumes one shipment per order; partial shipment requires Q09 approval and ADR/schema adjustment if needed. Authorized order staff manually records logistics information and delivery evidence. Tracking URL uses an approved provider hostname and safe encoding; no server fetching user-entered URLs, no javascript/data URLs. Customer sees tracking only for owned orders.

Shipment states PREPARED → SHIPPED → DELIVERED align with order transitions in one transaction. Failed delivery is recorded as an operational exception/evidence while order remains SHIPPED pending approved outcome. It does not automatically cancel/refund/restock. Carrier event polling, labels, live maps, address validation SaaS and automated booking are not included.

A future external quote adapter can implement the same contract only after scope approval, documented timeouts, fallback policy, cost and data-sharing review. Do not make an unidentified carrier API a V1 dependency. Required before production: carrier account/process, supplied rates and coverage, failed/return-delivery policy, tracking handoff owner and evidence procedure.

## Phase 3F implementation amendment — 2026-09-23

Zone identity, state/locality overrides, active flags, fees and provider/source labels are published together with tax in immutable checkout configuration bundles. This explicit physical mapping replaces separate shipping zone/rate tables for this phase; see [ADR-014](adr/014-checkout-before-orders.md) and [delivery configuration](../development/delivery-rates.md). No logistics API or production rate is assumed.

## Phase 3I implementation amendment — 2026-09-24

Phase 3H is formally approved as an implementation baseline; actual external Paystack verification remains a production/UAT gate. The client explicitly authorized one shipment/order, provider-neutral manual fulfilment and staff-confirmed delivery. [Shipping storage/configuration](../development/shipping.md) and [fulfilment service/API](../development/fulfilment.md) are the executable contract: PAID → PROCESSING → SHIPPED → DELIVERED; PREPARED → SHIPPED → DELIVERED shipments; existing approved staff permissions; required saved carrier, tracking number and approved HTTPS link before dispatch; required internal staff delivery evidence. The API uses intent-specific processing/ship/deliver commands plus POST/PATCH shipment preparation, superseding the earlier conceptual generic transition/PUT paths for these operations.

Shipping never recalculates checkout delivery charges or consumes inventory again. Immutable shipment history and durable fulfilment event hooks extend the staged journal approach; no notification transport, carrier adapter, post-payment cancellation, return or refund action is added. Financial holds block preparation/dispatch, but do not erase or prevent recording a delivery fact for an already shipped order. No material architecture deviation or new ADR is required. The [Phase 3I report](../development/phase-3i-report.md) records actual verification separately from pending production logistics configuration.
