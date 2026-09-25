# 13 — Tax
Trace: FR-TAX-001, NFR10/14; Q05/Q07. Confirmed behavior: tax is added at checkout and displayed separately. **No rate, exemption, legal treatment or tax advice is supplied here.**

TaxCalculator accepts authoritative net lines, product tax categories, destination, shipping amount, calculation instant and an approved immutable rule version. Result includes each taxable basis, rate as exact decimal, rounded tax amount, rule/version label and totals. A product tax category is an explicit configured code, not inferred from its name/category. Rules can distinguish product and shipping treatment without introducing international tax complexity.

Versioned rules specify category, applicable destination scope (Nigeria V1), rate, whether shipping is taxable, effective start/end and approved rounding policy ID. Overlapping active rules for the same scope/category are prohibited; unknown/ambiguous configuration fails checkout. Zero-rated/exempt treatment needs explicit approved configuration and label, not missing-data fallback.

Proposed calculation: compute line net in integer kobo, apply exact decimal rate, round per approved policy, sum allocated line amounts, then shipping tax. Rounding level/mode and allocation for refund reversals require approved examples before checkout/tax implementation. Order/item snapshots retain amounts, rate/category, taxable basis and configuration version; receipts show subtotal, shipping, tax and total separately. Later rate edits create new versions and cannot rewrite prior invoices.

Historical return/refund tax reversals use original snapshot allocations, bounded by remaining refundable amounts; never apply today's rate to an old sale. Commercial invoice numbering/required seller fields/document retention remain client/tax-adviser inputs before production. A rendered receipt is not automatically a legally sufficient invoice.

No external tax service is included. The calculator contract permits later approved extensions, but there is no multi-country tax engine or unapproved tax-law assumption. Configuration ownership: client/tax adviser approves; authorized owner publishes; developer validates examples and audit/version controls.

## A04 approved implementation — 2026-09-23
The client approved tax-exclusive prices, exact per-line HALF-UP once, sum of rounded line taxes, explicitly separate delivery taxability/rate and deterministic allocation of already-rounded line tax across unit ordinals. The former rounding/examples gate is resolved; see [approved examples and operator configuration](../development/tax.md). Actual rates/exemptions/effective dates remain external accounting inputs. Phase 3F publishes validated immutable configuration bundles under [ADR-014](adr/014-checkout-before-orders.md); snapshots preserve original amounts. No refunds or production tax rate were implemented by inference.
