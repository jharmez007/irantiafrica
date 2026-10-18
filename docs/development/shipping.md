# Shipping and tracking — Phase 3I

## Local commerce UAT fixture — 2026-10-14

`cd backend && php artisan iranti:seed-uat-commerce-settings --dry-run` checks the native `iranti_local` PostgreSQL connection and proposed values without writing. `--yes` explicitly publishes through `CheckoutConfiguration::publish` as the sole existing Business Owner. The command is restricted to `APP_ENV=local`, loopback PostgreSQL on port 5432, the `iranti_local` database, a development-only predecessor, and published products using only the existing `STANDARD` treatment. It is repeatable; an identical current payload publishes nothing. Each actual publication creates an immutable new bundle/audit entry, never a direct row update or historical order edit. To reset test rates safely, the owner publishes another complete reviewed development-only bundle in Admin → Settings → Shipping/Tax; do not delete prior versions or order evidence.

**UAT SHIPPING VALUES ONLY — NOT PRODUCTION-APPROVED COVERAGE OR PRICES.** FCT Standard ₦4,500 and Express ₦7,500; Lagos Standard ₦5,000 and Express ₦8,000; Kaduna Standard ₦6,000; Rivers Standard ₦7,000. All six are State-wide and active, have stable `UAT_` codes, and omit delivery-time promises. Their internal source reference explicitly identifies the local/UAT fixture. Production must receive owner-approved States, methods, charges and logistics process before activation. No fixture is automatically loaded outside the guarded command.

## Checkout rate administration refinement — 2026-10-14

The owner-only `/admin/settings/shipping` screen edits methods in the existing immutable checkout configuration bundle. A method has a stable code, controlled State/FCT, optional locality code, name, optional description/estimate, integer-kobo charge and active flag. Multiple active State-wide methods may serve one destination. Active locality-level rates are unique per normalized State/area; `Wuse`, `wuse` and ` Wuse ` conflict, while `Wuse 2` remains distinct. Inactive methods remain visible to the owner but are omitted from customer lookup. Archiving omits a method from the **next** bundle, not from past bundles or order snapshots. No carrier integration or tariff is invented. The Abuja panel opens the shared modal to add, edit, deactivate and reactivate FCT areas; the generic shipping form can also configure an optional locality in another State. Only the owner grants can publish, and publication retains the existing audit record and immutable version.

`GET /api/v1/checkout/shipping-methods?state_code=...` returns only eligible current methods and public prices. An exact configured locality takes precedence over statewide methods; an unknown selected locality never falls back. A destination with no active method returns an empty list, which blocks checkout. Selecting a method calls the owned checkout command; the server verifies eligibility and calculates the quote from the current configuration. Changing the address clears the chosen method and all calculated amounts. The accepted delivery object, including method code/name/amount, remains in the order's historical calculation snapshot. Owner publication retains the previous version, actor, timestamp and before/after bundle references in audit history. Client-approved production coverage/rates are still required.

## Abuja locality pricing — local refinement, 2026-10-18

The same `payload.zones` structure now supplies both State-wide and locality-level choices. `GET /api/v1/checkout/shipping-methods?state_code=FCT&include_areas=1` lists active State-wide and Abuja-area rows with public names and integer-kobo amounts in one lookup; the original exact-locality endpoint behavior remains available. The customer sees **Federal Capital Territory** under State, then priced **Delivery area** radio rows. Selecting a row stores the locality separately from the street/city and invokes the existing address and shipping-method commands for an authoritative quote. A State-wide row is shown as “Other areas” only when an owner explicitly configured that fallback. Without a selected area or fallback, checkout cannot quote; an inactive area is absent. State changes clear the area, method and stale totals. Product and delivery tax still follow the current configuration; an order keeps its accepted area, method, amount, tax and configuration snapshot.

For local testing only, run `cd backend && /opt/homebrew/bin/php artisan iranti:seed-uat-abuja-areas --dry-run`, then `--yes` to publish. The guarded command requires `APP_ENV=local`, the exact `iranti_local` loopback database at port 5432, one active owner, a development-only current bundle, and no **unexpired** RESERVED checkout. It copies existing tax and shipping settings, refuses a conflicting area rather than overwriting it, and is idempotent. The five **LOCAL/UAT SHIPPING FIXTURES — NOT CLIENT-APPROVED FINAL RATES** are Wuse ₦8,000; Maitama ₦5,200; Gwarinpa ₦6,000; Asokoro ₦6,500; Jabi ₦5,500. The command does not release expired reservations; the normal expiry/payment workflow remains responsible. Never carry these fixture prices into production without owner approval. Other States may gain locality rates through the same generic model without a schema change.

Implementation baseline v1.0, 2026-09-24. Phase 3H is approved as an implementation baseline; actual Paystack external verification remains a production/UAT gate. Phase 3I does not select a logistics provider.

## Ownership and commercial boundary

Checkout's immutable configuration bundle supplies serviceability and the charged delivery rate. An order retains its accepted address, items, taxes and delivery charge. Fulfilment reads that order address; it never reads a customer's current saved address or recalculates prices. Inventory was consumed by verified payment; shipment commands never reserve, consume, release or adjust stock.

V1 has **one shipment per order**, enforced by `shipments.order_id UNIQUE`. UUID shipment identity and separate history permit a later reviewed multi-shipment migration to replace that uniqueness without rewriting historical records. Partial shipments and multi-warehouse operations are not implemented.

## Physical schema

`2026_09_24_000012_create_fulfilment` adds:

- `shipments`: UUID, order FK/UQ, provider label (160), tracking number (nullable 160), tracking URL (nullable 2048), PREPARED/SHIPPED/DELIVERED, shipped/delivered timestamps, recording staff FK, internal notes and delivery evidence (1000), UTC creation/update timestamps.
- `shipment_status_history`: immutable UUID, composite shipment/order FK, from/to status, event, staff actor, timestamp, internal note and bounded tracking-change context. Draft corrections remain separate entries.
- `fulfilment_events`: immutable UUID/order/event/time, unique order/event for OrderProcessingStarted, ShipmentCreated, OrderShipped and OrderDelivered. These durable hooks do not send notifications.
- `orders.processing_at`, expanded status/history guards and preservation of `paid_at` throughout operational progression. No financial schema or monetary snapshot changes.

Database constraints enforce timestamp ordering, one shipment, required dispatched tracking, retained rows and immutable history. Deferred order/shipment consistency triggers verify both states together at commit, allowing the domain service to update them atomically. SQL guards still prohibit paid cancellation and require the applied receipt and COMMITTED reservation for operational transitions. Populated fulfilment rollback fails closed; deploy forward corrections instead of deleting retained records.

## Tracking configuration

The existing architecture requires **HTTPS and an exact approved carrier hostname**; this narrower policy is preserved. Configure the non-secret `SHIPPING_TRACKING_HOSTS` environment variable as a comma-separated list of lowercase, client-approved hostnames, without schemes, paths, ports or wildcards. The default is empty: draft creation without a URL is possible; URL submission and dispatch fail closed until approved logistics configuration exists. No provider hostname is fabricated or approved by this implementation.

Carrier name is required for a draft. Tracking number and link may be absent while PREPARED; **both are required to dispatch**, following architecture 11/14. The URL rejects credentials, explicit ports, unsafe schemes, control characters and unapproved hosts; the server never fetches it. Customer links use `noopener noreferrer`; a removed hostname suppresses the old public link without rewriting historical data. Tracking numbers are carrier-neutral, display-escaped and not globally unique or authorization secrets.

Shipment details become immutable after dispatch. A delivery evidence note is recorded separately when staff confirms receipt. V1 has no arbitrary status correction, delivery exception-resolution action, automatic booking, carrier polling, labels, live maps, GPS/OTP/signature/photo evidence or carrier SDK.

## Future provider integration

The existing `ShippingQuoteProvider` concept belongs to checkout rate supply, already physically mapped to versioned checkout configurations in Phase 3F. This phase needs no external fulfilment adapter or fake ManualShippingProvider. The central fulfilment service is the operational boundary.

After an actual provider is approved, nullable provider code/external shipment reference can be added to the UUID shipment record through an additive migration. A provider adapter can translate authenticated observations into guarded service commands with source/idempotency/evidence review; it must not write order status directly. Customer projections remain carrier-neutral. Booking, polling, retry, credentials, data sharing and exception policy require that integration's approval; they are not speculative dependencies today.

## Remaining operational inputs

Client: carrier/process selection, approved tracking hostnames, rate/coverage source, tracking handoff owner, staff delivery-evidence procedure, failed-delivery/return-to-sender policy and logistics data retention approval. Developer: configure/review supplied hosts, deploy additive migration, verify actual carrier links and operational handoff, retain least privilege. These configuration/operating gates do not prevent Phase 3I implementation review. No real carrier integration or delivery has been verified.
