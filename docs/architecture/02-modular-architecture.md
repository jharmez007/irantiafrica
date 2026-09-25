# 02 — Modular architecture
**Decision: one modular Laravel monolith, one database and one release unit for API/worker/scheduler.** Next.js is a presentation runtime, not a second business authority. Trace: NFR08/09/10; ADR-001/002.

| Module | Owns / responsibility | Allowed dependencies |
|---|---|---|
| Identity & Access | Users, roles, sessions, credentials, policy checks | Audit infrastructure |
| Customer | Saved addresses and customer identity views | Identity |
| Catalog | Products/categories/options/variants/media metadata | Media adapter; availability read contract |
| Pricing | Money calculations, NGN prices, tax configuration/snapshots | Catalog price read contract |
| Inventory | Balances, reservations, movements | Variant identity contract; Audit |
| Cart | Guest/account item selections; merge | Catalog/Pricing/Inventory read contracts |
| Checkout | Coordinates authoritative quote and atomic order/reservation creation | Cart, Pricing, Shipping quote, Orders, Inventory |
| Orders | Immutable purchase record and fulfillment state | Inventory command contract for paid/cancel effects |
| Payments | Attempts/receipts, verification, provider adapter, reconciliation | Orders settlement command; Inventory through settlement coordinator |
| Shipping | Versioned local rates, one shipment, tracking entry | Orders authorized fulfillment commands |
| Returns & Refunds | Return eligibility/decisions and refund budget/lifecycle | Orders read; Payments refund adapter; Inventory approved restock |
| Notifications | Transactional deliveries and templates | Outbox event contracts; email adapter |
| Reporting | Authorized bounded aggregate queries | Read-only approved commerce projections |
| Administration | Staff-facing application actions, not duplicate domain models | Module commands and authorization |
| Audit | Append-only sanitized business/security events | Shared persistence only |

Avoid one directory per trivial noun: Customer can be a bounded area of Identity; Pricing can be a small library plus tax configuration. These are responsibility boundaries, not compulsory packages. Administration orchestrates existing actions rather than accessing arbitrary models.

## Dependency rules
Controllers call actions; actions invoke policies, domain rules and persistence. Cross-module writes occur through explicit application contracts inside the shared transaction. No module edits another module's Eloquent model opportunistically. Reporting may use reviewed joins/read projections without writing source tables. Catalog receives availability through a read contract; Inventory never depends on Catalog business actions, avoiding a cycle. Shared kernel contains Money, identifiers, clock, transaction/outbox and actor context, not a universal service class.

Payments normalizes provider events, then calls a settlement coordinator that locks order and inventory. Orders never imports a Paystack SDK. No HTTP calls between backend modules; no network request while holding stock/order locks. Infrastructure adapters implement provider, storage, mail, queue and clock ports. Repositories are reserved for provider boundaries or complex reusable persistence, not wrappers around every model.

## Events and reliability
Durable outbox rows are written with domain changes. Events carry event ID, aggregate ID/version, type, timestamp, request ID and minimal non-sensitive payload.

| Event | Consumers / effect |
|---|---|
| OrderPlaced | Required order confirmation; operational audit |
| PaymentApplied | Required payment confirmation; reporting source remains DB |
| PaymentExceptionRaised | Operator alert/reconciliation, no fulfillment |
| InventoryChanged | Invalidate availability views; low-stock read refresh |
| ShipmentRecorded / OrderDelivered | Audit; optional customer email only if approved |
| ReturnDecided / RefundUpdated | Audit; optional policy-approved email |
| CatalogPublished / PriceChanged | Public cache invalidation |
| PermissionChanged | Session/authorization refresh, security audit |

At-least-once delivery means handlers require unique business keys. Stock, money and order transitions commit synchronously in PostgreSQL; queue delay cannot invalidate their invariants. Deferred marketing, review, discount and analytics modules do not exist in V1.
