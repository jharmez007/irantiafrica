# Production operations runbook

No deployment is authorized by this document. Named operators and provider credentials are outstanding gates. The business owner uses the admin interface; shell/database access belongs to the technical operator.

## Process topology and release

One immutable backend artifact serves API, workers and one scheduler. Supervise processes with platform restart/backoff and graceful termination; never use the local launcher in production. From backend:

```sh
php artisan app:readiness
php artisan queue:work redis --queue=identity,default,transactional,media --timeout=60 --tries=3 --max-time=3600
php artisan schedule:work
```

A single scheduler leader is required. Alternatively run `php artisan schedule:run` once each minute through the platform scheduler. Do not run both. Queue retry_after90 exceeds job60 s; termination grace >90 s recommended. Separate worker pools per queue when volume warrants; identity precedence can otherwise starve media. Recycle workers on release with `php artisan queue:restart` and supervisor restart; ensure old/new job payload compatibility. A worker exit is expected after max-time. Failed jobs use PostgreSQL; restrict access and inspect safe IDs/error class before action. Do not `queue:retry all`: payment/refund/mail UNKNOWN states require reconciliation first.

Build backend in an isolated artifact with `APP_ENV=build composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction`. This is a build-only environment; never serve it. At promotion inject production settings, run `php artisan config:cache`, private readiness, one reviewed `php artisan migrate --force`, and route/scheduler smoke checks. Frontend uses locked `npm ci --strict-peer-deps`, checks and production build, with reviewed build-time origin/CSP variables. Rebuild on public-variable change. Code rollback must remain schema-compatible; never destructive automatic migration rollback.

## Scheduled work

| Command | Frequency / safeguard |
|---|---|
| auth:clear-resets + session cleanup | Hourly; only expired credentials/sessions |
| catalog:media-maintenance | Hourly no overlap; redispatch processing older15 min, retire abandoned intents older1 day, delete retired/rejected object bytes after7 days; retain audit metadata |
| inventory:expire-reservations | Every minute, overlap lock5 min; DB expiry/idempotent release |
| checkout:expire | Every minute, overlap lock5 min; expires preparation and releases eligible hold |
| cart:purge-guests | Hourly, overlap lock5 min; approved30 day inactivity, authenticated carts persist |
| payments:reconcile / refunds:reconcile | Every minute overlap lock5 min; due-time/lease/check bounds, no blind refund re-POST |
| notifications:relay | Every minute overlap lock5 min; durable outbox, bounded delivery, expired sending→UNKNOWN |

Scheduler locks and image locks depend on queue Redis. Commerce values remain PostgreSQL-owned. Laravel workers also read their restart marker from the cache Redis: a cache outage can prevent worker startup (verified with a refused test connection). Restore cache and let the supervisor restart workers; queue data remains separate. A cache outage is not a reason to edit balances. Queue/limiter outage may reject browser operations safely; restore infrastructure, then run bounded domain reconciliation and examine unknown outcomes. Database outages return safe errors; restart/reconnect workers, verify transaction rollback and reconcile before reopening. Object storage failure leaves unpublished/processing objects; fix storage then maintenance. Email failure must not roll back orders/payments.

## Business-owner workflow

Login + MFA → `/admin` dashboard; orders → order detail and fulfilment; payments → reconciliation view; returns → review/approve/receive/inspect, owner refund approval; dashboard notification health → delivery status counts. Inventory staff use `/admin/inventory` for opening/adjustment with reason + confirmation. Catalog staff create draft, assign category/tax reference, SKU/price/image, wait for ready derivative, publish and initialize stock. Use prices in kobo exactly as labelled (100 kobo=₦1); training required. Archive retains historical purchases. Do not expose database/admin shell to ordinary staff.

Detailed notification/provider investigation and backup/infra recovery remain technical tasks; the owner-facing dashboard supplies aggregate health, not a resend control. Preserve approval boundaries.

## Privacy and retention

PostgreSQL stores customer contact/address snapshots for purchase/fulfilment/returns, owner-scoped saved addresses and order history; staff visibility follows approved role projections. MFA/recovery credentials and notification recipients encrypted where designed; capabilities hashed/scoped. No card data. Financial/audit/outbox snapshots are not casually deleted.

Current automatic lifetimes: customer absolute12 h (idle120 min), staff absolute8 h/idle15 min, guest order capability24 h without read renewal, guest cart30 days; checkout/reservation default900 s. Confirm actual identity configuration before launch. Commercial orders/payments/refunds/audit/notification/webhook retention and failed-job pruning require client/legal approval. Recommendation: investigate failed jobs promptly, adopt a documented short operational retention after resolution, separate legal holds and encrypted backup expiry. No new commercial purge is enabled in Phase 3M. Privacy requests require verified identity, authorized review and a recorded decision; deletion cannot invalidate financial reconciliation.
