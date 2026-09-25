# Paystack adapter and operational setup

Reviewed 2026-09-23 against the official [Transaction API](https://paystack.com/docs/api/transaction/), [verification guide](https://paystack.com/docs/payments/verify-payments/), [webhook guide](https://paystack.com/docs/payments/webhooks/) and [payment channels](https://paystack.com/docs/payments/payment-channels/).

`PaymentGateway` exposes provider identity, readiness, initialization, verification and authenticated webhook normalization. `PaystackGateway` implements it using Laravel HTTP. Orders depend only on neutral domain outcomes. Future providers can implement the contract and routing/binding; no Paystack client enters OrderService. Refund execution is deliberately absent.

## Configuration

Backend `.env` only (never commit its values):

```dotenv
PAYMENTS_ENABLED=false
PAYSTACK_MODE=test
PAYSTACK_SECRET_KEY=
PAYSTACK_LIVE_APPROVED=false
FRONTEND_URL=http://localhost:3000
```

Privately set the test secret and enable payments when testing a real merchant account. Hosted redirects require no public key in Next.js. No secret or access code belongs in `NEXT_PUBLIC_*`, logs, screenshots, source or browser storage.

Readiness fails closed for missing/malformed keys, mode/prefix mismatch, live keys outside production, test keys in production, production live mode without the explicit readiness flag, or invalid callback origin. HTTPS is required except loopback HTTP in local/testing. Production activation is a separate operational action after approved merchant/security readiness. No production hostname is invented here.

Initialization posts the server reference, immutable order total in kobo, NGN, contact email, configured callback and selected channel to the fixed HTTPS Paystack API. Metadata contains only the payment reference. The customer receives a hosted checkout URL; the app never receives card fields. Timeout/ambiguous errors retain UNKNOWN and require verification of the same reference, not another initialize POST. Connect timeout is 3 seconds; request timeout 12 seconds; redirects are disabled for API requests.

Verification queries the original stored reference, normalizes only needed financial fields, validates integers without floating-point transaction IDs, and maps provider statuses. `success` is only usable after domain validation; `failed` and `abandoned` are explicit retry candidates; ongoing/pending/processing/queued remain pending; reversed requires review. HTTP 429 Retry-After seconds are bounded and honored by scheduled backoff. Unknown/malformed responses cannot release a new payment attempt slot.

## Card and bank transfer

Both are requested as hosted checkout channels (`card` or `bank_transfer`). Availability remains subject to the merchant account, country/currency and provider test/live facilities. Incoming bank-transfer payment follows charge verification, not outgoing `transfer.success` events. No manual bank details, proof-upload, direct-debit, transfer payout or dedicated virtual-account product is added. Actual merchant card/transfer completion needs the external test-key acceptance exercise below.

## Callback and webhook

Callback is derived from `FRONTEND_URL` plus `/orders/{order UUID}/payment-return`. Customer query parameters never establish success. Preserve the original account/browser for the existing scoped guest grant. An expired guest grant requires the deferred recovery process; it does not prevent server reconciliation.

Configure the merchant dashboard webhook as:

`https://<approved-api-origin>/api/v1/webhooks/paystack`

Use the actual approved HTTPS origin at deployment. For local provider testing, an explicitly configured secure tunnel may expose only the test endpoint; no tunnel was installed or published by this phase.

The exact POST ingress runs before body transforms and browser sessions. It bounds the body to 256 KiB, validates the raw bytes with constant-time HMAC-SHA512 using the configured secret and `x-paystack-signature`, then parses. Other browser writes retain CSRF. Persist minimal normalized evidence plus raw checksum before 200. Storage failure returns an error so Paystack can retry. Queue outage cannot discard an acknowledged inbox row. Signature headers and raw provider payloads are never logged. Configure equivalent or tighter ingress body limits at the production proxy.

## External acceptance checklist

No test key was present locally. Signed fixtures and an isolated HTTP adapter/browser harness cover internal behavior. These remain **NOT VERIFIED against the external provider**:

- Actual merchant test initialization and hosted card success/failure.
- Actual Paystack return to the configured application origin.
- External verification API response for that transaction.
- Dashboard test webhook delivery, retries and dashboard resend.
- Merchant-enabled hosted bank transfer completion.

**LIVE PROVIDER WEBHOOK DELIVERY NOT VERIFIED.** No live credentials or real-money transaction was used. Before production, the client supplies/owns merchant activation, secure keys, allowed channels and dashboard settings; the developer wires approved HTTPS origins, runs these exercises, captures sanitized evidence, tests alerts and confirms reconciliation coverage.
