# Authoritative macOS local-development setup

Updated 2026-09-23. Everyday development uses persistent native Homebrew PostgreSQL 18 and Homebrew Redis 8.2 binaries, Laravel/PHP 8.5 and Next.js/Node 24. Docker Compose remains an optional reproducible alternative. No normal startup command depends on `/tmp` database storage or Redis binaries.

This guide replaces the earlier Phase 3A-only instructions. Identity, MFA and catalog already exist. Environment setup does not authorize additional inventory/commerce implementation; the existing Phase 3D schema gate remains separate.

## Prerequisites and installed state

On the inspected Apple Silicon Mac, Homebrew PostgreSQL 18.6, PHP 8.5 and Node 24.14/npm 11 are installed. At the subsequent launcher inspection, Homebrew Redis 8.2.10 was installed and both project Redis services were already running. Docker remains absent. Do not install packages automatically. On a Mac missing the approved Redis line, the installation command (only when authorized) is:

```sh
brew install redis@8.2
```

Use the versioned formula to retain the approved Redis 8.2 release line. The unversioned formula can select a different line. See [Homebrew Redis versions](https://formulae.brew.sh/formula/redis).

Set the current terminal's PATH so Herd PHP 8.4 does not shadow PHP 8.5:

```sh
cd /Users/chiefagu/Desktop/irantiafrica
export PATH="/opt/homebrew/bin:$PATH"
php -v
node --version
```

`nvm use` from the repository selects Node 24.14.0 if your shell uses nvm. Existing dependencies need no reinstall for normal startup. On a new checkout, install locked dependencies with Composer/PHP 8.5 and `npm ci` before provisioning; PHP needs pdo_pgsql, GD, fileinfo and the framework extensions. Do not bypass platform or peer-dependency requirements.

## Native PostgreSQL setup

The intended configuration is:

```dotenv
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=iranti_local
DB_USERNAME=iranti
DB_PASSWORD=
```

The blank password above is a template placeholder. The real password belongs only in ignored, mode-0600 local files. PostgreSQL data lives at `$(brew --prefix)/var/postgresql@18`, survives process shutdown, and is managed by the Homebrew service at login. Do not initialize this directory again or point everyday development at the former `/tmp/iranti-foundation-pg` cluster.

From repository root, the complete first-time/provisioning commands are:

```sh
brew services start postgresql@18
python3 scripts/setup-env.py --profile native
/opt/homebrew/bin/php scripts/setup-native-db.php
cd backend
/opt/homebrew/bin/php artisan config:clear
# Only on a fresh checkout with APP_KEY still blank:
# /opt/homebrew/bin/php artisan key:generate
/opt/homebrew/bin/php artisan migrate
/opt/homebrew/bin/php artisan db:show --database=pgsql
/opt/homebrew/bin/php artisan migrate:status
```

`setup-env.py --profile native` aligns local host/port/database/user and queue/cache settings, generates a password only when needed, preserves an existing native password and APP_KEY, and maintains the private frontend/API renderer key. A mode-0600 ignored `backend/.env.native-password` retains the native password across explicit profile switches. Existing `.env.testing` is not changed. No secret is printed.

`setup-native-db.php` is the exact repeatable provisioning command. It reads the private password from `.env`, connects through the Homebrew cluster's local administrator socket, verifies the target data directory, creates role `iranti` only if absent, sets its SCRAM password, and creates `iranti_local` only if absent. It assigns database and public-schema ownership to `iranti`, grants CONNECT/TEMPORARY/CREATE on its own database and USAGE/CREATE on its schema, revokes public database access/schema creation, and keeps the role NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION. It never drops databases or runs migrations.

The administrator defaults to the macOS account name (verified `chiefagu` on this Mac); set `IRANTI_PG_ADMIN` if your existing Homebrew administrator differs. Local administrator socket authentication must already work. The helper prepends two **project-role-only** loopback SCRAM rules in Homebrew's `pg_hba.conf`, preserves other applications' rules, saves `pg_hba.conf.before-iranti` once and reloads PostgreSQL. This matters because Homebrew's initial loopback rules use trust. The helper's SQL/passwords/errors are never echoed. A setup failure can leave some provisioning steps applied; correct the reported environment/permissions and rerun rather than deleting data.

For manual administration, these are equivalent commands after PostgreSQL starts. Run CREATE ROLE / CREATE DATABASE only if their inspection query returns no row:

```sh
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
psql -h /tmp -p 5432 -U "$(id -un)" -d postgres -X \
  -c "SELECT rolname FROM pg_roles WHERE rolname='iranti';" \
  -c "SELECT datname FROM pg_database WHERE datname='iranti_local';"

# Only if absent:
createuser -h /tmp -p 5432 -U "$(id -un)" --login \
  --no-superuser --no-createdb --no-createrole iranti

# Hidden interactive password prompt, never put a password in a shell command:
psql -h /tmp -p 5432 -U "$(id -un)" -d postgres -X -c '\password iranti'

# Only if absent:
createdb -h /tmp -p 5432 -U "$(id -un)" --owner=iranti iranti_local

psql -h /tmp -p 5432 -U "$(id -un)" -d postgres -X \
  -c 'ALTER DATABASE iranti_local OWNER TO iranti;' \
  -c 'REVOKE ALL ON DATABASE iranti_local FROM PUBLIC;' \
  -c 'GRANT CONNECT, TEMPORARY, CREATE ON DATABASE iranti_local TO iranti;'
psql -h /tmp -p 5432 -U "$(id -un)" -d iranti_local -X \
  -c 'ALTER SCHEMA public OWNER TO iranti;' \
  -c 'REVOKE CREATE ON SCHEMA public FROM PUBLIC;' \
  -c 'GRANT USAGE, CREATE ON SCHEMA public TO iranti;'

# Checks an actual authenticated TCP connection, prompting for the password:
psql -h 127.0.0.1 -p 5432 -U iranti -d iranti_local -W -X \
  -c 'SELECT current_database(), current_user;'
```

If using the manual password route, securely enter the same password in ignored `backend/.env` before Laravel verification. The helper route avoids manual password copying and also enforces the scoped HBA rules. `/tmp` in `psql -h /tmp` is only PostgreSQL's Unix socket directory, not database storage or a temporary binary.

## Redis decision: two native instances

Keep the existing architecture and ports:

| Purpose | Endpoint | Logical DB | Memory policy | Persistence |
|---|---|---|---|---|
| Queue, rate limits, locks | 127.0.0.1:63790 | 0 | 128 MiB, noeviction | AOF, appendfsync everysec |
| Disposable cache | 127.0.0.1:63791 | 0 | 64 MiB, allkeys-lru | None needed |

Separate ports are not an intrinsic Laravel requirement. One non-evicting Redis server with logical DBs could support local functional development, but logical DBs/prefixes share the process's memory and eviction policy. Cache pressure could then reject queue/limit writes, while an evicting shared instance could evict queues. Architecture 24 treats the single-instance design as a reviewed fallback. Retaining two small instances is the minimal safe change, matches Compose, and avoids silently adopting that fallback. See [Redis key eviction](https://redis.io/docs/latest/develop/reference/eviction/) and [architecture 24](../architecture/24-cache-queue.md).

After Redis installation is separately authorized and completed:

```sh
python3 scripts/native-redis.py start
python3 scripts/native-redis.py status
"$(brew --prefix redis@8.2)/bin/redis-cli" -p 63790 ping
"$(brew --prefix redis@8.2)/bin/redis-cli" -p 63791 ping
```

The helper never installs software. It checks the Homebrew Redis 8.2 binary, refuses occupied ports and registers two macOS user LaunchAgents using that binary. Service IDs are `local.iranti.redis.queue` and `local.iranti.redis.cache`; they start at login and are supervised by launchd. Files/data/logs live under `~/Library/Application Support/Iranti/redis/{queue,cache}`; LaunchAgents live in `~/Library/LaunchAgents`. Do not run `brew services start redis` alongside these: the stock formula service represents a single default instance, not this two-instance configuration. PostgreSQL uses `brew services`; the two Redis instances use project LaunchAgents backed by the Homebrew formula.

Both instances bind only loopback and keep protected mode enabled. Do not expose these unauthenticated developer services to a network. Queue AOF survives restart (everysec can lose about a second on abrupt failure); cache is intentionally disposable. This does not make Redis authoritative for business state.

## Laravel and frontend settings

Laravel retains `CACHE_STORE=redis` on the cache connection, `QUEUE_CONNECTION=redis` on the queue connection, and `SESSION_DRIVER=database` in PostgreSQL. Identity rate limits and distributed locks use the non-evicting connection. Predis is installed; ext-redis is unnecessary. Redis is required for normal authenticated/rate-limited requests and asynchronous work, even though the simple health endpoint can work without it.

`FILESYSTEM_DISK=local` and `CATALOG_DISK=local` use `backend/storage/app/private`. Files survive server restarts. Catalog images use controlled API delivery; do not expose private media with a public storage symlink. No S3 credentials are needed locally. `MAIL_MAILER=array` does not deliver actual email.

The queue worker uses a 60-second timeout, below retry_after=90 seconds. The scheduler runs existing session/password-reset cleanup and catalog media maintenance. No new inventory scheduler or commerce job is added by this setup.

Frontend `.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=/api/v1
API_INTERNAL_URL=http://127.0.0.1:8000
SITE_URL=http://localhost:3000
CATALOG_INTERNAL_READ_KEY=
```

The private renderer key is generated/shared by the environment helper; never place it in NEXT_PUBLIC variables. Backend APP_URL, FRONTEND_URL, TRUSTED_ORIGINS and SANCTUM_STATEFUL_DOMAINS use `http://localhost:3000` / `localhost:3000` as in the template. Browse **http://localhost:3000**, keeping browser API/CSRF requests same-origin through Next's rewrites.

## One-command daily launcher

After first-time native database/Redis setup, daily startup is:

```sh
cd /Users/chiefagu/Desktop/irantiafrica
make dev
# Equivalent: ./scripts/dev-start.sh
```

Check status:

```sh
make status
# Equivalent: ./scripts/dev-status.sh
```

Stop launcher-owned resources:

```sh
make stop
# Equivalent: ./scripts/dev-stop.sh
```

The scripts use bash with `set -euo pipefail` and work when invoked from a macOS zsh or bash terminal. Their project root is resolved from the scripts, so direct absolute-path invocation also works outside the repository; Make commands run from the repository root. Python 3 coordinates safe session/process-group ownership because macOS does not supply GNU setsid by default. No package installation occurs.

Startup verifies PHP 8.5 at `/opt/homebrew/bin/php`, Node 24/npm, Homebrew PostgreSQL 18, Homebrew Redis 8.2, installed app dependencies and the native local environment. It rejects a Compose/non-local profile, DB_URL override, cached Laravel configuration and occupied unmanaged app/Redis ports. It starts PostgreSQL through Homebrew only if unavailable, starts missing project Redis services using the existing helper, verifies PostgreSQL 18/Laravel credentials and both Redis PINGs, then starts backend, worker, scheduler and frontend. The HTTP listeners must belong to their tracked process groups, and both health URLs must respond successfully. It never runs migrations, seeds or dependency installation.

The four app processes run in separately tracked sessions with no controlling terminal; supervisors retain group ownership until their children exit. Each PID has creation-time and unique-command-token metadata. A launcher lock prevents concurrent start/stop commands. A duplicate start validates existing processes and health instead of creating additional workers/servers. Stale/dead or mismatched PID records produce warnings and are cleared without signalling the unrelated PID. If process identity cannot be inspected, the command fails rather than assuming ownership. Startup failure rolls back newly started resources; pre-existing services/apps and PostgreSQL remain intact. Review any explicit cleanup error rather than assuming a failed launch fully stopped.

Shutdown uses those PID files and verified process groups, stopping frontend, backend, worker and scheduler gracefully, with bounded escalation for surviving children. It never uses pkill, killall or generic process-name matching. **PostgreSQL always remains running. Redis services started by the launcher are stopped individually through native-redis.py --instance queue/cache; pre-existing Redis services are deliberately left running.** If a Redis process has been replaced since ownership was recorded, automatic shutdown refuses to claim that replacement and warns; inspect it using the native helper. The separate native Redis helper remains the explicit way to stop pre-existing project services when you intend to do so.

Private runtime files are ignored by Git:

```text
.runtime/
  launcher.lock
  backend.pid / backend.json
  frontend.pid / frontend.json
  queue.pid / queue.json
  scheduler.pid / scheduler.json
  redis-queue.pid / redis-queue.json  # only if this launcher started it
  redis-cache.pid / redis-cache.json
  logs/backend.log
  logs/frontend.log
  logs/queue.log
  logs/scheduler.log
```

Directories use mode 0700; files use 0600. Logs contain launcher-generated lifecycle, readiness and exit information only. Raw child stdout/stderr, environments, HTTP cookies, SQL exceptions and payloads are not persisted, to avoid writing secrets. For detailed application diagnostics, stop the affected launcher processes and use the foreground commands below; do not paste credentials or sensitive output into tracked logs. Runtime logs append across runs and have no automatic rotation. Delete logs only when the launcher is stopped if you want a clean local history; do not delete active PID files.

Frontend: **http://localhost:3000**. Backend: **http://127.0.0.1:8000**. Use localhost:3000 for browser authentication so it matches the configured trusted origin.

The launcher is a local convenience, not a production process supervisor: a failed app is reported by status and its lifecycle log, and another `make dev` can restart it. Redis LaunchAgents and Homebrew PostgreSQL retain their own existing service supervision/login behavior. See [executed launcher checks](local-launcher-report.md). No inventory or commerce functionality is added.

## Alternative foreground startup: five terminals

Run database provisioning/migrations once first. Each terminal starts from `/Users/chiefagu/Desktop/irantiafrica` with Homebrew on PATH.

**Terminal 1 — persistent services** (commands return; services continue):

```sh
cd /Users/chiefagu/Desktop/irantiafrica
brew services start postgresql@18
python3 scripts/native-redis.py start
```

**Terminal 2 — Laravel:**

```sh
cd /Users/chiefagu/Desktop/irantiafrica
bash scripts/serve-backend.sh
```

The existing script selects PHP 8.5, loads the catalog upload limits and binds 127.0.0.1:8000. It does not start a temporary database/Redis process and required no change.

**Terminal 3 — queue worker:**

```sh
cd /Users/chiefagu/Desktop/irantiafrica/backend
/opt/homebrew/bin/php artisan queue:work redis --queue=identity,default,transactional,media --timeout=60 --tries=3
```

**Terminal 4 — scheduler:**

```sh
cd /Users/chiefagu/Desktop/irantiafrica/backend
/opt/homebrew/bin/php artisan schedule:work
```

**Terminal 5 — Next.js:**

```sh
cd /Users/chiefagu/Desktop/irantiafrica/frontend
npm run dev
```

Verify basic communication and database status:

```sh
curl --fail http://127.0.0.1:8000/api/v1/health
curl --fail http://localhost:3000/api/v1/health
cd /Users/chiefagu/Desktop/irantiafrica/backend
/opt/homebrew/bin/php artisan db:show --database=pgsql
/opt/homebrew/bin/php artisan migrate:status
```

Health checks prove transport only; they do not prove Redis or queue processing. After Redis is installed, check both PINGs, effective maxmemory-policy/AOF with redis-cli CONFIG GET/INFO persistence, and a complete queued-job round trip before marking queue verification complete.

Stop foreground Laravel/worker/scheduler/Next with Ctrl-C. To stop background services without removing data:

```sh
cd /Users/chiefagu/Desktop/irantiafrica
python3 scripts/native-redis.py stop
brew services stop postgresql@18
```

Redis `stop` unloads the current agents; their files remain for later login/start. For permanent removal of login registration, remove only the two named project plist files after stopping; retain data unless intentionally deleting it. Homebrew service stop unregisters PostgreSQL from login until started again.

## Docker Compose alternative

Docker is optional and currently unavailable on the inspected host. Preserve existing volumes. Compose uses its existing PostgreSQL host port 54320 and role `iranti_app`; do not rewrite an initialized database volume to match native settings. Redis ports are the same, so stop native Redis before starting Compose.

```sh
cd /Users/chiefagu/Desktop/irantiafrica
python3 scripts/native-redis.py stop
python3 scripts/setup-env.py --profile compose
docker compose --env-file infrastructure/.env -f infrastructure/compose.yml up -d --wait
cd backend
/opt/homebrew/bin/php artisan config:clear
/opt/homebrew/bin/php artisan migrate
```

Compose initialization creates iranti_local/iranti_test with separate role credentials on a new volume only. Native and Compose databases contain separate data; switching profiles does not migrate it. Existing volume credentials must match infrastructure/.env; never delete volumes to "fix" a password mismatch. Return to native:

```sh
cd /Users/chiefagu/Desktop/irantiafrica
docker compose --env-file infrastructure/.env -f infrastructure/compose.yml down
python3 scripts/setup-env.py --profile native
cd backend
/opt/homebrew/bin/php artisan config:clear
```

Restart app processes after profile changes. Do not pass --env=testing for everyday development. Existing destructive test configuration remains on its independent 54320 iranti_test endpoint; it is not automatically moved to the persistent development database. No migrate:fresh or infrastructure tests against iranti_local.

## Verification on 2026-09-23

See [local environment report](local-environment-report.md) for actual execution results. The environment report records the earlier provisioning-time state; the subsequent launcher report records current Redis/startup verification. Missing dependencies must be marked NOT VERIFIED, not replaced by temporary binaries. Full application acceptance remains distinct from a successful HTTP health response.

## Phase 3F checkout setup

From the project root, apply new additive migrations without resetting existing data:

```sh
cd backend
/opt/homebrew/bin/php artisan migrate
```

The checkout migration was applied to this workstation's persistent `iranti_local` on 23 September 2026. Normal `make dev` still starts the existing scheduler, which now also expires checkout attempts. It does not seed tax/rate policy. Before testing a quote, explicitly publish reviewed configuration through the authenticated owner/MFA API in [tax.md](tax.md); [the development-only example](examples/checkout-development.json) must be adapted to actual local catalog category codes. No sample configuration was installed in `iranti_local` during implementation. Missing tax or delivery coverage is an intentional blocking checkout response. Checkout reserves inventory only; it does not create orders or initiate payment.

## Phase 3G orders

Apply the additive order migration with `/opt/homebrew/bin/php artisan migrate` from `backend`; never reset `iranti_local`. Existing services/startup commands are unchanged. Order creation follows a valid reserved checkout, so configured tax/delivery rates are still required. The existing inventory scheduler expires order-bound holds. Orders stay pending after expiry and no payment integration is available. Customer history is `/account/orders`; permitted staff use `/admin/orders`. Guest access lasts 24 hours by default in the placement browser, with email recovery explicitly deferred. See [orders.md](orders.md).

Migration `2026_09_23_000010_create_orders` was applied additively to this workstation's guarded `iranti_local` on 23 September 2026. No order/tax/rate fixture was seeded there.

## Phase 3H payment testing

Payments are disabled by default. Configure backend-only test credentials as described in [Paystack setup](paystack.md). The existing queue worker and scheduler also process durable payment recovery. Never use live keys locally; no frontend public key is needed for hosted redirects. The isolated fixture/browser harness is not part of normal application startup and does not prove external Paystack delivery.

## Phase 3I manual fulfilment

Apply the additive fulfilment migration from `backend` using `/opt/homebrew/bin/php artisan migrate`; never reset `iranti_local`. Daily startup and queues are unchanged. Verified paid orders stay PAID until permitted staff begin processing under `/admin/orders/{id}`.

In the private backend `.env`, set `SHIPPING_TRACKING_HOSTS` to the exact lowercase carrier hostname(s) approved by the client, comma-separated with no scheme, path, port or wildcard. Then clear cached configuration and restart the backend/worker via the existing launcher. No hostname is supplied by default. Until configured, a draft with no tracking URL can be saved, but dispatch is unavailable. Use [shipping.md](shipping.md) for validation rules and [fulfilment.md](fulfilment.md) for staff steps. Do not copy synthetic test carrier hosts or provider credentials into production.

### Phase 3J returns/refunds

After the additive migration, the existing queue worker and scheduler also service `refunds:reconcile`. Refund creation is disabled by default (`REFUNDS_ENABLED=false`); live execution additionally requires explicit `PAYSTACK_REFUNDS_LIVE_APPROVED=true` after provider UAT. Do not put credentials in tracked files. Return requests require a published explicit policy; no production clock/receipt rule or demo policy is seeded automatically. See [returns](returns.md) and [refunds](refunds.md). Existing daily launcher commands are unchanged.


## Phase 3K transactional email

The launcher worker consumes `identity,default,transactional`. Restart an already-running launcher to load that queue list. Normal local mail is forced to the in-memory sink and cannot send real SMTP messages; commerce notification delivery is disabled by default. See [notification operations](notifications.md) for opt-in local simulation, the relay/status commands, production gates, and [email templates](email-templates.md) for synthetic previews. No email provider is needed for daily local startup.
