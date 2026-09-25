# Delivery rates and destination configuration

2026-09-23. **Implemented for Phase 3F with immutable checkout configuration bundles.** Nationwide Nigerian coverage and location-based charges are confirmed. The logistics provider, actual rate sheet, coverage details and rate-maintenance responsibility remain outstanding. No carrier API is assumed.

## Destination and matching contract

The implementation uses a controlled state/FCT list, `country_code=NG`, and bounded flexible city/address strings. The intended list includes Abia, Adamawa, Akwa Ibom, Anambra, Bauchi, Bayelsa, Benue, Borno, Cross River, Delta, Ebonyi, Edo, Ekiti, Enugu, Gombe, Imo, Jigawa, Kaduna, Kano, Katsina, Kebbi, Kogi, Kwara, Lagos, Nasarawa, Niger, Ogun, Ondo, Osun, Oyo, Plateau, Rivers, Sokoto, Taraba, Yobe, Zamfara and FCT. Names were checked against the [National Bureau of Statistics state-office directory](https://www.nigerianstat.gov.ng/contact) on 2026-09-23. Application codes must be stable controlled identifiers; the application uses uppercase names with underscores as its own stable codes (for example LAGOS, AKWA_IBOM and FCT), not that page's displayed row numbers or a claimed ISO code standard.

Retain architecture 08's zones: state code, optional controlled locality code, active flag and unique destination identity. Each zone entry supplies one provider/service label, source reference and NGN integer amount. The containing immutable bundle supplies the effective start/version and approving actor; the next published start closes its effective interval. No separate physical shipping-zone/rate tables are needed at this scale. A locality code comes from configured coverage options, not guessed spelling in a free-text city field.

The API exposes configured locality codes. An exact configured locality overrides an explicitly configured state-wide entry. A null locality selects an explicitly configured state-wide entry. An inactive or unpriced explicit locality must block delivery rather than accidentally falling through to a cheaper statewide rate. A supplied unknown locality never falls through to a state-wide fee. The customer must select an offered area or an explicitly offered state-wide choice; city spelling does not automatically choose a locality. Missing or ambiguous effective coverage returns DELIVERY_UNAVAILABLE/RATE_REQUIRED with no reservation. Unknown locality codes are invalid input, not a silent fallback.

## Configuration and calculation

Use the existing owner-only `shipping.configure` permission with mandatory staff MFA. Configuration publication validates one effective version per zone/service through serialized publication and concurrency tests, records the supplied source and actor, and retains history. State/locality identity is not silently rewritten once quoted; disable/version configuration intentionally.

The server chooses/validates the configured destination/service, returns match basis, rate version, expiry and NGN amount, and snapshots them in checkout. A changed rate requires a new reviewed quote. A browser-supplied fee is rejected. No weight/value bands, free-shipping threshold, nationwide flat rate or provider-specific behavior is inferred. Any required new tariff dimension needs explicit design review before use.

Development-only sample zones/rates may demonstrate configured versus unsupported destinations but must be labeled and excluded from production. No production seed or real fee is supplied. The [development example](examples/checkout-development.json) is explicitly marked and never automatically seeded. A state list alone does not prove live nationwide serviceability; launch acceptance requires a complete client/provider-approved coverage/rate dataset.

A04 is approved: delivery has its own explicit taxable boolean, label and conditional exact tax rate in the bundle. See [tax implementation](tax.md). Missing tax configuration cannot be mistaken for tax-free delivery. Shipment booking, labels, dispatch, tracking and fulfillment remain later phases.
