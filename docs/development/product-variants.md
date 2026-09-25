# Product options, variants, SKUs and prices

Phase 3C v1.0 approval candidate — 2026-09-22. Implements architecture 07/08 without size/colour columns or a second product price/stock balance.

| Concept | Implemented rule |
|---|---|
| Simple product | One explicitly administered active default variant; empty option signature; no customer option selector. Drafts may temporarily lack a SKU. This pattern was already approved in the domain architecture. |
| Configurable product | `kind=variant`; explicitly created combinations, never a generated Cartesian product. |
| Option/value | Stable UUIDs, product ownership, ordered named options/values. At most 10 options and 50 values per option. |
| Completeness | Exactly one value for every product option, all from that product; values from one option cannot stand in for another. |
| Signature | Sort by stable option UUID, join `option_id:value_id` pairs with `|`. Unique `(product_id, option_signature)` applies to active and archived variants. |
| Database integrity | Same-product composite FKs, unique `(variant_id, option_id)`, option-name/value uniqueness and globally unique SKU. Application checks completeness; FK/CHECK constraints do not falsely claim cross-row completeness. |
| SKU | Required administrator input, 100 characters after normalization; surrounding whitespace trimmed, letters uppercased. Control characters are rejected. No generated business format. Global uniqueness remains after variant/product archival. |
| SKU approval | The client explicitly approved uppercase, globally unique SKUs during this Phase 3C session. No further SKU decision is open. |
| Money | PostgreSQL bigint, nonnegative; API accepts/returns decimal strings of integer minor units, NGN only. Input maximum 999999999999999 kobo. No floating-point money arithmetic. |
| Price display | Exact BigInt formatting; listings derive minimum/maximum active prices; selecting a complete valid combination uses its API price. Zero is representable, as approved. Checkout treatment of zero totals remains a later gate. |
| Mutation | Price/status changes require `price_version`; catalog content version increments. SKU and selected option IDs are immutable. Archive/restore the same variant, or introduce a genuinely distinct combination. |
| History | Catalog archival retains rows and identifiers. Later order-item snapshots must preserve purchase-time values independently of live prices/names. |

Use `POST /admin/products/{id}/options` before the first variant. `POST /admin/options/{id}/values` can later append values without rewriting old combinations. Option names/values used for a variant cannot be relabeled through the current API. A materially different option structure requires a replacement product; this conservative API boundary protects later historical references.

Create variants through the action/API, supplying `sku`, `unit_price_minor`, optional `currency=NGN` and `option_value_ids`. For a simple product use `[]`. No inventory quantity, warehouse, reservation, discount, customer tier or availability estimate is accepted.

Validation, independent PostgreSQL constraints, duplicate request races, differing prices, archived uniqueness, missing/foreign values and simple defaults are covered in CatalogTest. UI tests exercise actual native select changes, price updates, missing combinations and simple products without fabricated controls. The shared fixture data is development/test evidence, not a client-approved product range.

Remaining inputs are representative real product facts, taxonomy/option labels/SKUs, prices and images. Single stock-pool confirmation and inventory behavior remain Phase 3D gates, not unresolved generic variant schema decisions.
