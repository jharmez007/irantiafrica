# LOCAL DEVELOPMENT ENVIRONMENT REPORT

2026-09-23. Scope: persistent macOS development configuration only. No inventory/commerce implementation, new migration, package installation or deployment was performed. The Phase 3D approval gate is unchanged.

## Final PostgreSQL strategy

Native Homebrew PostgreSQL 18.6 is now started and registered as the current user's login service. Persistent data: `/opt/homebrew/var/postgresql@18`. Laravel local settings: pgsql, 127.0.0.1, 5432, iranti_local, role iranti. The role owns the database/schema and all 19 current public tables, without superuser/createdb/createrole/replication privileges. The generated password is only in ignored mode-0600 local files and was not printed. Project-role loopback authentication requires SCRAM; other local applications' HBA rules are preserved with a backup before the scoped additions.

## Final Redis strategy

Retain two instances backed by Homebrew Redis 8.2: queue/limits/locks on 63790 with noeviction + AOF everysec, disposable cache on 63791 with allkeys-lru. Two ports preserve independent eviction/memory policies; logical DBs alone cannot do that. A single noeviction service would require accepting shared memory-pressure failures and reviewing the fallback in Architecture 24. No such architecture change was made.

Homebrew Redis 8.2 is **not installed**. No installation was attempted. Once authorized, run `brew install redis@8.2`; then `python3 scripts/native-redis.py start` registers two persistent user LaunchAgents. It uses only the Homebrew formula binary and persistent `~/Library/Application Support/Iranti/redis` directories, not temporary binaries/data. Runtime Redis service/queue verification is therefore NOT VERIFIED.

## Exact startup

From `/Users/chiefagu/Desktop/irantiafrica`:

```sh
# Terminal 1: services (Redis command requires separately installed redis@8.2)
brew services start postgresql@18
python3 scripts/native-redis.py start

# Terminal 2: Laravel
bash scripts/serve-backend.sh

# Terminal 3: worker, from repository root
cd backend
/opt/homebrew/bin/php artisan queue:work redis --queue=default --timeout=60 --tries=3

# Terminal 4: scheduler, from repository root
cd backend
/opt/homebrew/bin/php artisan schedule:work

# Terminal 5: Next.js, from repository root
cd frontend
npm run dev
```

Open http://localhost:3000. Separate terminal examples and first-time/provisioning/verification/Compose commands are in the authoritative [local setup guide](local-setup.md).

## Files changed

- `backend/.env.example`: default PostgreSQL port 5432; no password value.
- `backend/config/database.php`: matching fallback port 5432.
- `scripts/setup-env.py`: explicit native/Compose profiles, native password preservation, private writes, shared renderer key, existing test environment preserved.
- `scripts/setup-native-db.php`: repeatable guarded native role/database/password/ownership/HBA provisioning; no migrations or destructive reset.
- `scripts/native-redis.py`: start/stop/status for two persistent Homebrew-backed Redis 8.2 LaunchAgents; no package installation.
- `docs/development/local-setup.md`: authoritative current macOS guide and five-terminal startup.
- `docs/development/environment-variables.md`: native/Compose distinction and current worker settings.
- `docs/development/local-environment-report.md`: this execution report.
- `README.md`: native-first prerequisites, Docker optional.
- `frontend/next-env.d.ts`: Next.js refreshed its generated development type imports during the live startup check; no frontend application code changed. Automatically generated agent instruction files from that check were removed.

Private generated/updated files: ignored `backend/.env`, `backend/.env.native-password`, and shared-key-preserving `frontend/.env.local`. Existing backend/.env.testing remains unchanged. All five relevant secret/environment paths are ignored by Git. Outside the repository: Homebrew PostgreSQL login service registration; project role/database; two project-role rules plus backup in Homebrew pg_hba.conf. No Redis LaunchAgents/data were created because the required formula is absent.

Reviewed unchanged: `scripts/serve-backend.sh` already selects PHP 8.5 and catalog PHP limits without temporary service dependencies; `scripts/check-foundation.sh` requires the documented PHP PATH and does not start infrastructure. Compose configuration/initialization and CI services remain unchanged. Application cache, queue, sessions, filesystem and frontend configuration code remain unchanged.

## Verification results

| Check | Result |
|---|---|
| Homebrew PostgreSQL registration/running status | PASS; persistent service started |
| Actual native role/database endpoint | PASS; iranti / iranti_local / 127.0.0.1:5432 |
| Correct password connection | PASS |
| Incorrect password rejection | PASS; confirms project TCP SCRAM enforcement |
| Database/schema/table ownership and restricted role | PASS; iranti owns 19 tables; prohibited elevated role flags false |
| Laravel DB connection | PASS; artisan db:show against pgsql |
| Existing migrations | PASS; all six existing migrations applied and migrate:status reports Ran; no migration created/edited |
| Laravel session persistence | PASS; proxied CSRF bootstrap 204 and PostgreSQL session row present |
| Direct Laravel HTTP health | PASS; HTTP 200 |
| Next.js → Laravel rewritten HTTP health | PASS; HTTP 200 |
| Environment profile safety | PASS in isolated temporary fixtures: repeated native setup preserves password, native→Compose→native round trip, preserved test config, shared renderer key, mode-0600 secret files |
| Python/PHP/shell syntax, scoped Pint, whitespace | PASS |
| Approved requirement documents | PASS; all seven existing hashes unchanged |
| Homebrew Redis / two-instance launchd runtime | NOT VERIFIED — redis@8.2 absent; helper failed clearly before creating services |
| Redis queue round trip / Redis-backed normal application requests | NOT VERIFIED — required Redis services absent |
| Scheduler task execution with Redis | NOT VERIFIED — Redis-dependent maintenance cannot be verified yet |
| Docker Compose runtime | NOT VERIFIED — Docker unavailable; alternative preserved |

The existing pre-task inventory balance migration was applied as part of verifying the current repository schema. No inventory service, reservation, controller, UI or test implementation was changed in this task. No destructive test suite or migrate:fresh ran against the persistent development database.

The temporary Laravel and Next.js verification processes were stopped. PostgreSQL remains running as requested for persistent everyday development. Existing MySQL and other services were not changed.

## Remaining user actions

1. Authorize/install the missing Homebrew `redis@8.2` formula; no automatic installation is pending.
2. Run the Redis service helper, verify both PING responses/configuration/AOF and complete queue/normal application verification.
3. Start the Laravel worker/scheduler/Next terminals when developing. The HTTP health result alone is not full application acceptance while Redis is missing.

Source references: [Homebrew Redis formula/version choices](https://formulae.brew.sh/formula/redis), [Redis eviction policies](https://redis.io/docs/latest/develop/reference/eviction/), and [Homebrew service management](https://docs.brew.sh/Manpage#services-subcommand). Exact local configuration is established by inspected repository/runtime files.
