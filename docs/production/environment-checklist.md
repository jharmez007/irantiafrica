# Production environment checklist

Phase 3M, 2026-09-24. Names only; inject values through the selected platform secret manager. No production environment is configured or verified yet. `.env.example` remains the native local example, not a production template.

| Category | Required production setting / verification |
|---|---|
| Runtime | PHP 8.5 with PDO PostgreSQL, GD, fileinfo, OpenSSL and pcntl workers; Node 24; locked Composer/npm installs; immutable release ID |
| Application | `APP_ENV=production`, `APP_DEBUG=false`, unique recoverable `APP_KEY`, canonical HTTPS `APP_URL`; startup rejects debug/insecure URLs |
| Frontend | `SITE_URL` canonical HTTPS, `NEXT_PUBLIC_API_URL=/api/v1`; private `API_INTERNAL_URL`; edge serves `/api` and `/sanctum` at the same browser origin. Never put credentials in `NEXT_PUBLIC_*` |
| Origins | `FRONTEND_URL`, `TRUSTED_ORIGINS` exact HTTPS origin; `SANCTUM_STATEFUL_DOMAINS` exact host[:port]. No wildcard CORS. Browser origin/CSRF checks remain mandatory |
| PostgreSQL | `DB_CONNECTION=pgsql`, private host/port/database/runtime username/password; `DB_SSLMODE=verify-full`, `DB_SSLROOTCERT` provider CA file where needed. Use explicit DB_* fields, not DB_URL overrides; verify the effective connection SSL mode. DNS must match certificate. Never use production superuser credentials in the app |
| Redis | Separate queue/cache servers, private network plus provider TLS/auth; `REDIS_HOST/PORT/PASSWORD`, cache counterparts, separate environment `REDIS_PREFIX`. Queue noeviction + persistence; cache bounded LRU. `REDIS_SCHEME=tls`, `REDIS_CACHE_SCHEME=tls`; optional `REDIS_TLS_CA`/`REDIS_CACHE_TLS_CA` file paths; peer/name verification on. Test actual provider certificates before staging activation |
| Sessions | `SESSION_DRIVER=database`, encrypt=true, secure=true, HttpOnly=true, SameSite=lax, host-only domain empty/null. Default idle120 min; absolute12 h customer and staff15 min idle/8 h absolute controls remain. No PHP session serialization |
| Queue | `QUEUE_CONNECTION=redis`, retry_after90 > maximum job timeout60; supervise identity/default/transactional/media queues. Bounded retries. Database failed-job store restricted to operators |
| Cache | `CACHE_STORE=redis`; limiter and locks use queue Redis. No commerce truth cached. Separate cache failure and queue/limiter failure alerts |
| Catalog | `CATALOG_DISK=s3`, private bucket/key credentials/region/endpoint; `CATALOG_MEDIA_ORIGIN` owned HTTPS derivative origin; shared private `CATALOG_INTERNAL_READ_KEY` ≥32 chars. Never public original bucket |
| CSP | `CSP_ASSET_ORIGINS` exact HTTPS owned CDN and signed object-upload endpoint origins; build-time configuration. Browser media-upload test required against actual provider |
| Mail | SMTP transport, TLS/auth settings, approved sender/reply-to; `TRANSACTIONAL_EMAIL_ENABLED` and explicit `START_AT` only after validation. Staging recipient override required; local/testing use array sink. Never log transport. Sender DNS/domain verification is external |
| Payments | Separate test/live Paystack keys and mode; `PAYMENTS_ENABLED`, `PAYSTACK_LIVE_APPROVED` remain off until evidence. HTTPS return origin; signed webhook at `/api/v1/webhooks/paystack`. Never frontend secrets |
| Refunds | `REFUNDS_ENABLED`, `PAYSTACK_REFUNDS_LIVE_APPROVED` off pending provider verification; UNKNOWN outcome never blind resend |
| Shipping | Approved `SHIPPING_TRACKING_HOSTS` exact hostnames; versioned approved rates/tax/policy records before transactions |
| Proxies | No blanket trusted proxy enabled. Terminate TLS at controlled ingress, strip untrusted forwarded headers, deny direct public API/Node access. If deployment needs forwarded client IP/scheme, configure only actual trusted proxy addresses and test spoof rejection before activation. Topology is not yet selected |
| Abuse limits | `config/limits.php` lists all `RATE_*` per-minute overrides; catalog limits in `config/catalog.php`. Defaults retained; min1; staging load/tuning required, shared NAT considered |
| Logs/monitoring | JSON stderr, info level; request IDs generated internally; route templates/status/duration only. Collector retention/redaction/access/alerts must be configured. No request-body/header/query logging |

## Intentional environment differences

Local: HTTP loopback, secure cookie off, native PG with SSL prefer, private local media, array mail, real providers disabled. Testing: isolated `iranti_test`, synthetic providers, test-only throttle stores where explicitly selected. Staging: isolated production-like services, debug off, HTTPS, test Paystack, mail override, access restricted/noindex. Production: independent credentials/resources, verified TLS, approved live flags, backups/monitoring. Build stage: no live credentials; `APP_ENV=build` for Composer discovery, then validate runtime production settings before promotion.

A passing startup guard proves only checked syntax/configuration. It does not prove provider access, certificate validity, backup durability or deployment readiness. Run `php artisan app:readiness` privately after config caching. Never publish configuration dumps.
