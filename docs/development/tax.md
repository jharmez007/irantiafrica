# Tax calculation and configuration

Phase 3F implementation baseline v1.0, 2026-09-23. **A04 is formally APPROVED.** This implements the client's binding approval; no production tax percentage or legal treatment was supplied.

## Approved engineering semantics

Catalog prices stay tax-exclusive and unchanged. Each line's taxable base is quantity × current/snapshotted unit-price integer kobo. Apply the exact configured fractional decimal rate once and round the complete line tax HALF-UP to integer kobo. Product tax is the sum of these rounded line taxes, never a separate basket-level recalculation. Delivery tax is calculated separately and rounded once. Checkout total = items subtotal + product tax + delivery fee + delivery tax. All API amounts are decimal strings of NGN kobo.

`TaxMath` accepts exact rate strings between `0` and `1`, at most nine decimal places, matching architecture 08 precision. It rejects negative/malformed values, floats, unsupported rounding and out-of-range rates. Quotient/remainder decomposition applies a denominator of 1,000,000,000 without overflowing intermediate signed integers: whole-base quotient × rate numerator plus the rounded remainder product. Monetary sums/multiplication use checked `CartMoney`; unsupported totals fail rather than becoming floats. No dependency or optional PHP extension was added.

Delivery configuration always supplies an explicit `taxable` JSON boolean and treatment label. If true, a valid delivery rate string is required. If false, rate must be null and delivery tax/basis are explicitly zero. This is an approved non-taxable choice, never a missing-configuration fallback. Product rules do not implicitly control delivery.

## Approved calculation examples

All percentages and fees in this table are **DEVELOPMENT CONFIGURATION ONLY**, not approved production tax rates or delivery prices. The hypothetical fractional rate `0.1` means 10%.

| Case | Integer-kobo input | Stored integer-kobo outcome |
|---|---|---|
| Exact | Base 1000 × 0.1 | Tax 100 |
| Fraction below half | Base 1004 × 0.1 = 100.4 | Tax 100 |
| Exact half | Base 1005 × 0.1 = 100.5 | Tax 101 |
| Fraction above half | Base 1006 × 0.1 = 100.6 | Tax 101 |
| Quantity > 1 | Unit price 335 × 3 = base 1005 | Line tax 101, not per-unit-rounded 102 |
| Multiple lines | Two lines, each base 1005 | Product tax 101 + 101 = 202, not basket-rounded 201 |
| Taxable delivery | Delivery 505 × separately configured 0.1 | Delivery tax 51 |
| Complete checkout | Items 2010 + product tax 202 + delivery 505 + delivery tax 51 | Total 2768 |
| Non-taxable delivery | Explicit taxable=false, rate=null; items base 1005 | Product tax 101 + delivery 505 + delivery tax 0; total 1611 |
| Historical unit allocation | Rounded line tax 11251, quantity 3 | Unit sequence 3751, 3750, 3750; sum exactly 11251 |
| Another allocation | Rounded line tax 101, quantity 3 | Unit sequence 34, 34, 33; sum exactly 101 |

Historical allocation stores `base_minor`, `extra_units` and quantity. Every unit receives the integer quotient; the first `extra_units` units in ordinal order receive one additional kobo. This compact representation reproduces the complete allocation exactly. A future partial reversal must track which unit ordinals were reversed and use these original amounts. No refund workflow is implemented.

## Immutable versioned configuration

`checkout_configurations` stores complete, validated, bounded configuration bundles with UUID, unique version code, effective_from, development_only, approving owner and structured JSON payload. Product rules are unique by category; delivery treatment is explicit; delivery destinations are unique. A database trigger prohibits published-row update/delete. New versions replace the complete bundle from their effective instant onward; effective intervals are defined by consecutive starts, so two versions cannot apply at once. Publication rejects historical/backdated or non-increasing starts and serializes concurrent publication with a transaction advisory lock. Quote/reserve takes a shared lock, so normal checkouts are not globally serialized.

The original architecture's individual tax-rule/rate version tables are represented by this atomic bundle in Phase 3F. It permits coordinated publication of product and delivery tax/rates without an unnecessary admin UI. [ADR-014](../architecture/adr/014-checkout-before-orders.md) records this explicit physical mapping. Structured bounded configuration JSON is not a substitute for core relational checkout ownership/items/money.

POST `/api/v1/admin/checkout-configurations` requires an active owner, completed staff MFA, existing `tax.configure` and `shipping.configure` grants, CSRF and the trusted same-origin session. It records an audit entry with actor/version/development flag, not a full customer address or secret. No new staff permissions were introduced. Optional `effective_from` accepts an ISO8601 timestamp with timezone; omit for immediate publication using precise PostgreSQL wall-clock time. A scheduled future bundle remains inactive until its start; old bundles remain immutable.

The complete payload shape is demonstrated by [development-only example](examples/checkout-development.json). All categories must match explicit catalog `tax_category_code` values; no catch-all rule is inferred. Unknown category, no current bundle or forbidden development configuration in production returns TAX_CONFIGURATION_REQUIRED. Production rejects publication of a development-only bundle, and selection also checks the flag. No default/sample is automatically seeded into either local or production databases.

## Production operator workflow

1. Obtain business/accounting approval for rates, taxable products/exemptions, delivery taxability/rate, labels and effective date; obtain approved delivery coverage/prices/source.
2. Prepare a **new complete** JSON bundle with a unique version, approved product category rules, explicit delivery treatment and approved zones. Set development_only=false only for genuinely approved production configuration. Do not relabel the development sample as an approved tariff.
3. An owner signs in on the canonical frontend origin and completes MFA. Submit the reviewed bundle through the protected publication API using that same secure session and its CSRF token. No raw database writes, environment secrets in Git or ad-hoc public configuration endpoint are needed.
4. Review the returned version/effective timestamp and audit record. Verify representative quotes against approved examples before allowing live commerce. Corrections publish a new full version; do not edit historical rows.

A generic request shape for an operator-provisioned private cookie jar/CSRF environment is:

```sh
curl --fail-with-body --request POST "$IRANTI_ORIGIN/api/v1/admin/checkout-configurations" \
  --cookie "$IRANTI_PRIVATE_COOKIE_JAR" \
  --header "Origin: $IRANTI_ORIGIN" \
  --header "X-XSRF-TOKEN: $IRANTI_CSRF_TOKEN" \
  --header 'Accept: application/json' --header 'Content-Type: application/json' \
  --data-binary @/private/path/to/reviewed-checkout-configuration.json
```

These variables stand for the operator's already authenticated same-origin session; never commit or print real cookies/tokens. No production publication was performed during implementation.

## Snapshot and responsibility boundary

Every successfully quoted line stores unit price/quantity/base, rate/configuration reference, treatment and rounded tax/allocation. Session calculation stores configuration version, product base/tax, explicit delivery-taxable flag, delivery rate/base/tax, rounding and currency. A later configuration change moves the attempt to review and releases its hold; **it does not overwrite historical calculated amounts**. Orders must later copy accepted snapshots, not look up today's tax for old history.

ENGINEERING DECISION: tax-exclusive pricing, exact per-line HALF-UP, sum of line taxes and deterministic historical allocation. BUSINESS / ACCOUNTING CONFIGURATION: applicable rate, taxable categories/exemptions, delivery taxability/rate and effective dates. Legal invoice details and retention remain production inputs. This implementation is not tax/legal advice.
