# 07 — Domain model and product/variant design
Trace: FR-CAT-001–004, FR-INV, FR-ORD, FR-ACC, FR-RET; database detail in [08](08-database-design.md).

## Aggregate boundaries and entities
| Aggregate / entity | Responsibility and lifecycle | Relationships / invariants |
|---|---|---|
| User | Guest is not a fabricated user; registered customer/staff active → disabled/anonymized | Owns addresses and sessions; order user link nullable; unique normalized email while retained |
| Role / Permission | Provisioned by controlled administration; grant/revoke audited | Three launch staff roles; customer ownership policies do not require a staff role; no is_admin bypass |
| Address | Customer-managed current address | User ownership; editing/deleting never modifies order address snapshot |
| Category | Draft/active/archived taxonomy | Many products; optional parent must be acyclic |
| Product | Editorial identity, description, category/publication | Owns options/variants/media; draft → published → archived; cannot publish incomplete data |
| ProductOption / OptionValue | Generic named selectable attributes and values | Values belong to one option/product; no colour/size columns |
| ProductVariant | Purchasable SKU and NGN price | One simple default SKU or explicit valid option combination; unique SKU; no inferred Cartesian combinations |
| ProductMedia | Validated product image metadata | Quarantine → processing → ready → retired; public only after validation; optional variant association must be same product |
| Inventory | One authoritative balance per sellable variant in one logical stock pool | on_hand ≥ reserved ≥ 0; available derived; never independent product and variant balances for same item |
| InventoryMovement | Append-only physical/reservation delta ledger | Unique business operation key, actor/reason and resulting balance; posted with balance transaction |
| Reservation / ReservationItem | Order-specific temporary capacity | Active → committed/released/expired; at most one active reservation/order; quantities immutable for a reservation generation |
| Cart / CartItem | Mutable customer selection, not a stock promise | Guest secret or account owner; one active account cart; positive quantities; expired/converted terminal |
| Order | Immutable commercial snapshot plus controlled operational state | Owns items/addresses, reservations, attempts, shipments and return requests; totals do not change on payment retry |
| OrderItem | Purchase-time name/SKU/options/price/tax/discount snapshot | References historical variant; catalog edits cannot rewrite it; quantity > 0 |
| OrderAddress | Purchase-time destination/contact snapshot | One shipping and optional billing address/order; stored separately from saved address |
| PaymentAttempt | One provider initialization attempt and reference | Many attempts/order; immutable amount/currency; initializing/pending/succeeded/failed/unknown |
| Payment | Verified receipt, including duplicate or anomalous receipts | One provider transaction identity; only one normal applied receipt/order in V1; anomalous money goes to review |
| Shipment | Tracking and fulfillment evidence | One shipment/order V1; prepared → shipped → delivered; no partial shipment promised |
| ReturnRequest / ReturnItem | Guest/account request and owner-reviewed outcome | Request timestamp/policy version captured; reasons limited to approved set; cumulative accepted quantity ≤ purchased |
| Refund | Owner-approved financial operation against a verified receipt | Approval → pending → succeeded/failed/unknown; total succeeded + reserved pending amount ≤ receipt amount |
| NotificationDelivery | Transactional transport lifecycle | One logical event/template/recipient delivery; provider receipt and uncertain outcomes retained |
| AuditLog | Durable actor/action/result trail | Append-only sanitized facts, not full sensitive records |
| TaxRule / ShippingRate | Immutable effective-dated configuration versions | Order stores applied values and version; missing valid configuration blocks checkout |
| WebhookInbox / Outbox / IdempotencyRecord | Technical reliability entities | Durable deduplication, bounded retries, request-payload conflict detection |

A separate CustomerProfile table adds no currently required fields: User plus Address satisfies V1. A separate Notification domain aggregate is unnecessary beyond NotificationDelivery. No tables for wishlist, reorder, reviews, campaigns, discount engines, warehouses or analytics warehouse.

## Product rules
A simple product has exactly one active default variant with an empty canonical option signature. A configurable product has explicitly created variants, each choosing exactly one value for each required product option; variants may differ in price and stock. Both use the same inventory/checkout path. Product does not carry a second authoritative price/stock field. Listings show a derived price or range; checkout resolves the selected SKU.

SKU is a required unique string with an agreed input/normalization policy, not a prescribed business format. The canonical option signature sorts stable option/value IDs and is unique per product. Database composite foreign keys keep values/variants within their product; application validation enforces completeness and one value/option. Changing options used by sold variants archives/replaces combinations instead of rewriting past orders.

**Proposed Q04 interpretation requiring approval:** a variant with available=0 cannot be purchased; a product with no purchasable active variant is hidden from browsing/search. Restocking makes it visible only if publication is still active. Inventory scarcity never silently unpublishes the editorial product. Mixed-variant display can show unavailable choices disabled or omit them; client chooses presentation.

Single stock pool is an assumption, not confirmation of physical warehouse count. If distinct allocation by location is required, revise inventory keys/locking in an ADR before inventory implementation. Generic identifiers and explicit relationships make later extension possible without implementing it now.
