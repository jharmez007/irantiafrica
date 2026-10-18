# Production environment checklist — ultra-lean Render

**Current review — 2026-10-16:** The paid web/PostgreSQL resources are provisioned, and SHA `8e8f6b89a89996f6f182e978418906f0e47c6d43` is deployed behind a pre-launch gate on the owned domain. Payments remain TEST/disabled; this is not public-launch approval. The original 2026-10-04 authorization was for SHA `35fab6dce276378ce41ac01bc4674f90f91f9747` before provisioning. See the [activation log](activation-log-2026-10-16.md) for evidence and unresolved checks. Never paste secret values into this file, Git, CI logs or chat. The [deployment runbook](../deployment/render-production.md) and [ADR-018](../architecture/adr/018-ultra-lean-production-deployment.md) govern the paid profile.

| Setting / evidence | Required treatment | Status |
|---|---|---|
| Render resources | One `1c-2g` Docker web plus one private PostgreSQL 18; no Key Value/worker/cron; Frankfurt/data handling and billing approved | Paid web/DB and private access VERIFIED; capacity acceptance pending |
| `APP_ENV`, `APP_DEBUG`, `APP_KEY` | `production`, `false`, unique retained `base64:` key | Production/debug runtime values and new key shape VERIFIED; secure-custody review pending |
| `APP_URL`, `FRONTEND_URL`, `SITE_URL`, `TRUSTED_ORIGINS` | Same exact owned HTTPS `www.irantiafrica.com` origin | Runtime values and rebuilt product canonical VERIFIED; authenticated browser QA pending |
| `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN` | Exact hostname, host-only cookie; no wildcard | Exact host and no cookie Domain attribute VERIFIED; authenticated session QA pending |
| `SESSION_DRIVER`, `SESSION_ENCRYPT`, `SESSION_SECURE_COOKIE`, `SESSION_HTTP_ONLY`, `SESSION_SAME_SITE` | `database`, `true`, `true`, `true`, `lax`; browser CSRF/cookie test | CSRF 204 and Secure/HttpOnly cookie attributes VERIFIED; browser flow pending |
| `PRODUCTION_NETWORK_PROFILE`, `DB_CONNECTION`, `DB_URL`, `DB_SSLMODE` | `render-private-database`, `pgsql`, injected private `connectionString`, `require`; verify private TLS in Render | NOT VERIFIED |
| `IRANTI_DEPLOYMENT_PROFILE` | `render-private` for paid production; missing value defaults to strict private S3/R2, unknown value fails; `render-free-test` is only for the separate temporary Free rehearsal behind the gate and TEST payments | Paid runtime profile VERIFIED |
| DB role / backup | Migrations with owner role; least-privilege runtime role and negative DDL test; paid backup/PITR/export and restore drill | NOT VERIFIED |
| `QUEUE_CONNECTION`, `DB_QUEUE_RETRY_AFTER`, `QUEUE_FAILED_DRIVER` | `database`, `90`, `database-uuids`; active `jobs`/`failed_jobs`; one Supervisor worker | Render queue job and readiness VERIFIED; capacity/failed-job alerting pending |
| `CACHE_STORE`, `RATE_LIMIT_CACHE_STORE`, `SESSION_DRIVER` | `database`; `cache`, `cache_locks`, `sessions`; expiry cleanup and capacity alarms | Render database cache readiness VERIFIED; cleanup/capacity alarms pending |
| Supervisor / scheduler | Nginx, PHP-FPM, Next, worker, `schedule:work`; process restarts, handover locks and SIGTERM test | NOT VERIFIED |
| `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` | `/api/v1`, `http://127.0.0.1:8080` inside web; same-origin routing | NOT VERIFIED |
| `CATALOG_INTERNAL_READ_KEY` | Private random 32+ byte key shared by PHP and Next; never `NEXT_PUBLIC_` | NOT VERIFIED |
| `CSP_ASSET_ORIGINS` | Exact approved HTTPS origins at build time; inspect generated CSP | NOT VERIFIED |
| `CATALOG_DISK`, `FILESYSTEM_DISK`, `CATALOG_UPLOAD_TRANSPORT`, `CATALOG_MEDIA_ORIGIN` | Paid: `s3`, `s3`, `proxy`, owned HTTPS origin; private R2 only. Free-test ephemeral disk is forbidden in this profile | S3 disks and owned media origin VERIFIED; admin media flow pending |
| R2 access | Scoped access key/secret, region `auto`, bucket, HTTPS endpoint, path-style true; upload/derivative/read/delete/restore | Scoped private synthetic write/read/delete VERIFIED; derivatives and independent restore pending |
| `MAIL_MAILER`, `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | `resend` HTTPS/API; key and owner-approved sender mailbox entered privately in Render; `irantiafrica.com` is verified | Single transport message delivered to owner inbox; application invitation/reset/transactional flows NOT VERIFIED |
| `TRANSACTIONAL_EMAIL_ENABLED`, `TRANSACTIONAL_EMAIL_START_AT` | Off until real inbox/bounce/retry proof, then deliberate activation | NOT VERIFIED |
| `PAYMENTS_ENABLED`, `PAYSTACK_MODE`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_LIVE_APPROVED` | Off, TEST, private matching key, false; signed callback test before enabling TEST | Disabled flags VERIFIED; provider end-to-end TEST and LIVE approval pending |
| Refund flags | Disabled until policy/provider test and separate approval | NOT VERIFIED |
| `PRELAUNCH_GATE_ENABLED`, `PRELAUNCH_BASIC_AUTH_HASH` | True; unique bcrypt hash only in Render; named tester access | Gate true, bcrypt shape and unauthenticated HTTPS 401 VERIFIED; owner reported gate passage and MFA sign-in |
| Production owner / staff MFA | Bootstrap one owner interactively after key rotation; confirm MFA before staff access | One owner role and non-null MFA confirmation VERIFIED by read-only production query; broader admin browser QA pending |
| Low stock, tracking, tax/delivery/return policies | Explicit owner-approved production values; no UAT-only defaults | NOT VERIFIED |
| Product catalogue | Review UAT data before approved import or explicit temporary use; preserve media/stock history | NOT VERIFIED |
| HTTPS, DNS, logging and alerts | Certificate, secure routing, redacted stdout/stderr, health, queue age, scheduler freshness and DB capacity alerts | Public HTTPS/TLS and health 200 VERIFIED; alerting/recovery checks pending |
| CI/artifact and resource tests | Clean reviewed `main` SHA, green hosted CI, Docker build, 2 GB/one-CPU load and PostgreSQL capacity | SHA/hosted CI/Docker smoke PASS; populated load and actual Render PostgreSQL capacity NOT VERIFIED |

`render.yaml` intentionally pins TEST/disabled/gate-on values. Each activation needs a reviewed Blueprint change and manual deploy. No actual secret belongs in the Blueprint; `sync:false` entries are private dashboard prompts. Disable Blueprint Auto Sync after creation as well as web auto-deploy. `SITE_URL` and CSP changes require an image rebuild. Keep `APP_KEY` in secure custody because losing it makes encrypted data unreadable. Unmeasured provider, backup, security and capacity rows remain pre-launch acceptance gates, even though protected provisioning is now authorized.
