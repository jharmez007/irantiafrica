# Production environment checklist — ultra-lean Render

2026-10-04. **Protected provisioning is authorized at SHA `35fab6dce276378ce41ac01bc4674f90f91f9747`, but no paid production resource or web service is provisioned.** A separate [temporary Free test database](../deployment/render-free-prelaunch.md) exists and must not count toward any production row below. The owner deferred Render billing; provider setup is pending. Never paste secret values into this file, Git, CI logs or chat. The [deployment runbook](../deployment/render-production.md) and [ADR-018](../architecture/adr/018-ultra-lean-production-deployment.md) govern the later paid profile.

| Setting / evidence | Required treatment | Status |
|---|---|---|
| Render resources | One `1c-2g` Docker web plus one private PostgreSQL 18; no Key Value/worker/cron; Frankfurt/data handling and billing approved | NOT VERIFIED |
| `APP_ENV`, `APP_DEBUG`, `APP_KEY` | `production`, `false`, unique retained `base64:` key | NOT VERIFIED |
| `APP_URL`, `FRONTEND_URL`, `SITE_URL`, `TRUSTED_ORIGINS` | Same exact HTTPS pre-launch Render origin; update together at domain cutover | NOT VERIFIED |
| `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN` | Exact hostname, host-only cookie; no wildcard | NOT VERIFIED |
| `SESSION_DRIVER`, `SESSION_ENCRYPT`, `SESSION_SECURE_COOKIE`, `SESSION_HTTP_ONLY`, `SESSION_SAME_SITE` | `database`, `true`, `true`, `true`, `lax`; browser CSRF/cookie test | NOT VERIFIED |
| `PRODUCTION_NETWORK_PROFILE`, `DB_CONNECTION`, `DB_URL`, `DB_SSLMODE` | `render-private-database`, `pgsql`, injected private `connectionString`, `require`; verify private TLS in Render | NOT VERIFIED |
| DB role / backup | Migrations with owner role; least-privilege runtime role and negative DDL test; paid backup/PITR/export and restore drill | NOT VERIFIED |
| `QUEUE_CONNECTION`, `DB_QUEUE_RETRY_AFTER`, `QUEUE_FAILED_DRIVER` | `database`, `90`, `database-uuids`; active `jobs`/`failed_jobs`; one Supervisor worker | Local isolated PG passed; Render NOT VERIFIED |
| `CACHE_STORE`, `RATE_LIMIT_CACHE_STORE`, `SESSION_DRIVER` | `database`; `cache`, `cache_locks`, `sessions`; expiry cleanup and capacity alarms | Local isolated PG passed; Render NOT VERIFIED |
| Supervisor / scheduler | Nginx, PHP-FPM, Next, worker, `schedule:work`; process restarts, handover locks and SIGTERM test | NOT VERIFIED |
| `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` | `/api/v1`, `http://127.0.0.1:8080` inside web; same-origin routing | NOT VERIFIED |
| `CATALOG_INTERNAL_READ_KEY` | Private random 32+ byte key shared by PHP and Next; never `NEXT_PUBLIC_` | NOT VERIFIED |
| `CSP_ASSET_ORIGINS` | Exact approved HTTPS origins at build time; inspect generated CSP | NOT VERIFIED |
| `CATALOG_DISK`, `FILESYSTEM_DISK`, `CATALOG_UPLOAD_TRANSPORT`, `CATALOG_MEDIA_ORIGIN` | `s3`, `s3`, `proxy`, owned HTTPS origin; private R2 only | NOT VERIFIED |
| R2 access | Scoped access key/secret, region `auto`, bucket, HTTPS endpoint, path-style true; upload/derivative/read/delete/restore | NOT VERIFIED |
| `MAIL_MAILER`, `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | `resend` HTTPS/API; key and owner-approved sender mailbox entered privately in Render; `irantiafrica.com` is verified, but real application delivery is untested | Mocked code path PASS; real delivery NOT VERIFIED |
| `TRANSACTIONAL_EMAIL_ENABLED`, `TRANSACTIONAL_EMAIL_START_AT` | Off until real inbox/bounce/retry proof, then deliberate activation | NOT VERIFIED |
| `PAYMENTS_ENABLED`, `PAYSTACK_MODE`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_LIVE_APPROVED` | Off, TEST, private matching key, false; signed callback test before enabling TEST | NOT VERIFIED |
| Refund flags | Disabled until policy/provider test and separate approval | NOT VERIFIED |
| `PRELAUNCH_GATE_ENABLED`, `PRELAUNCH_BASIC_AUTH_HASH` | True; unique bcrypt hash only in Render; named tester access | NOT VERIFIED |
| Low stock, tracking, tax/delivery/return policies | Explicit owner-approved production values; no UAT-only defaults | NOT VERIFIED |
| Product catalogue | Review UAT data before approved import or explicit temporary use; preserve media/stock history | NOT VERIFIED |
| HTTPS, DNS, logging and alerts | Certificate, secure routing, redacted stdout/stderr, health, queue age, scheduler freshness and DB capacity alerts | NOT VERIFIED |
| CI/artifact and resource tests | Clean reviewed `main` SHA, green hosted CI, Docker build, 2 GB/one-CPU load and PostgreSQL capacity | SHA/hosted CI/Docker smoke PASS; populated load and actual Render PostgreSQL capacity NOT VERIFIED |

`render.yaml` intentionally pins TEST/disabled/gate-on values. Each activation needs a reviewed Blueprint change and manual deploy. No actual secret belongs in the Blueprint; `sync:false` entries are private dashboard prompts. Disable Blueprint Auto Sync after creation as well as web auto-deploy. `SITE_URL` and CSP changes require an image rebuild. Keep `APP_KEY` in secure custody because losing it makes encrypted data unreadable. Unmeasured provider, backup, security and capacity rows remain pre-launch acceptance gates, even though protected provisioning is now authorized.
