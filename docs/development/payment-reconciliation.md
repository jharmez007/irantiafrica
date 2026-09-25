# Payment reconciliation runbook

The browser, webhook worker, scheduled reconciliation and owner action all use `PaymentService::verify` and the same transactionally idempotent finalizer. No separate admin stock-write or manual paid path exists.

## Everyday processing

Use the existing native local launcher; it already starts the Redis queue worker and Laravel scheduler. The scheduler runs `payments:reconcile` every minute, with a five-minute overlap guard. Each scan selects at most 100 due inbox entries and 100 due unresolved attempts and dispatches identifier-only jobs to the existing queue. Queue jobs use 30-second timeout and bounded retry backoff. Do not run a live provider test with the synthetic browser harness.

```sh
cd backend
/opt/homebrew/bin/php artisan payments:reconcile
# Recovery without Redis dispatch, bounded synchronous scan:
/opt/homebrew/bin/php artisan payments:reconcile --inline
# Normal workers, if not using make dev:
/opt/homebrew/bin/php artisan queue:work redis --sleep=1 --tries=3 --timeout=30
/opt/homebrew/bin/php artisan schedule:work
```

Network calls occur outside order/stock transactions. Verification leases expire after 45 seconds and have a token that fences stale responses. Inbox processing uses a two-minute token-fenced lease; interrupted workers become eligible again. Stale queued attempt jobs recheck due state before network access. Backoff doubles with jitter up to about one hour, observes bounded numeric Retry-After, and stops automatic attempt checks after 12 observations. Inbox failure also has a 12-attempt budget. Owner manual verification can continue after automatic exhaustion; it never invents a provider result.

## Review and recovery

Open `/admin/payments` as the owner after staff MFA. Inspect original order/reference, attempts, receipt amount/currency/channel/source/time, next check, check count, history and review reason. Use **Verify with provider** to re-observe. It cannot undo a financial hold, extend a reservation, reacquire stock, mark an order paid manually or execute a refund.

- UNKNOWN/INITIALIZING: verify the original reference; do not manufacture a new attempt. An initialization that never reached Paystack can remain uncertain until operator evidence and a future explicitly approved resolution policy exist.
- PENDING: retain original reservation timing. A provider pending result is not failure and is not permission to pay twice.
- RECONCILIATION_EXHAUSTED: investigate provider/network health and inspect dashboard evidence; reverify manually. Automatic attempts stop, uncertainty continues to block retries.
- Amount/currency/reference/environment conflict: retain evidence, alert, investigate. Never overwrite receipts or patch stock/order totals.
- Late/extra receipt: retain money evidence and financial hold. No automatic fulfillment or refund. Customer-facing review is explicit.
- Unmatched or unsupported webhook: QUARANTINED with minimal reference/type/checksum. Outgoing transfer events are not incoming payment evidence. Use the provider dashboard and sanitized DB inspection; never attach by matching email.
- FAILED inbox/expired leases: repair the underlying dependency first. Existing rows are recoverable; a provider dashboard resend creates/reuses the durable event identity. An identical exhausted event stays failed until a reviewed operator recovery action; the mapped attempt can be reverified through the owner UI. Do not delete evidence merely to bypass deduplication.

## Monitoring

`payment_observation` logs correlation IDs, order UUID/number, attempt UUID/reference and safe outcome only. Review and automatic exhaustion emit warnings; quarantined/failed inbox rows emit `payment_webhook_review`. Audit and historical records are durable; delivery to an alert service is not configured. Internal PaymentSucceeded/PaymentRequiresReview journal entries are durable hooks; there is no shipping/email consumer in Phase 3H.

Before launch, name the alert recipient, response hours and escalation destination. Monitor pending/unknown age, exhausted checks, unapplied receipts, financial holds, FAILED/QUARANTINED inbox and stale PROCESSING leases. Example read-only queries (authorized operator console):

```sql
SELECT id, order_id, reference, status, checks, next_check_at, failure_code
FROM payment_attempts
WHERE status IN ('UNKNOWN','REQUIRES_REVIEW') OR failure_code='RECONCILIATION_EXHAUSTED';
SELECT id, event_type, reference, status, attempts, error_code, received_at
FROM webhook_inbox
WHERE status IN ('FAILED','QUARANTINED')
   OR (status='PROCESSING' AND lease_until < clock_timestamp());
SELECT id, order_id, amount_minor, currency, exception_code
FROM payments WHERE applied_at IS NULL;
```

Back up PostgreSQL and preserve the Laravel encryption key in managed secret recovery: encrypted authorization URLs and sessions need it. Retention/deletion policy for financial evidence and guest recovery remain later operational decisions. No reset/fresh migration is a production recovery command.
