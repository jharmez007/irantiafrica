# LOCAL DEV LAUNCHER REPORT

2026-09-23. Local process management only. No inventory/commerce code, migration, seed, package installation or architecture change.

## Files created

- `scripts/dev-start.sh`
- `scripts/dev-stop.sh`
- `scripts/dev-status.sh`
- `scripts/dev-processes.py` — shared macOS-safe session/PID/readiness/ownership implementation used by the shell entry points.
- `Makefile` — only dev/stop/status aliases.
- `docs/development/local-launcher-report.md` — this report.

Updated `.gitignore` for `.runtime/`, `scripts/native-redis.py` with an optional backwards-compatible `--instance all|queue|cache` selector, `README.md`, and `docs/development/local-setup.md`. `scripts/serve-backend.sh` is reused unchanged. No application environment or commerce implementation was changed by this task.

## Daily commands

```sh
make dev       # ./scripts/dev-start.sh
make status    # ./scripts/dev-status.sh
make stop      # ./scripts/dev-stop.sh
```

Frontend: http://localhost:3000

Backend: http://127.0.0.1:8000

## Startup

Resolve and verify the project root; require PHP 8.5 at the known Homebrew path, Node 24/npm, Python 3, Homebrew PostgreSQL 18, Redis 8.2 and installed app dependencies. Validate native local configuration and reject overrides/cached configuration that could target another environment. No dependencies are installed and no database provisioning/migrations occur.

Start PostgreSQL if unavailable and verify the Laravel connection/database/version. Reuse existing project Redis services or start missing services with the native helper; require both PINGs. Start separately supervised process groups for Laravel API, queue worker, scheduler and Next.js. Verify owned HTTP listeners and health responses. PID, process creation time and a unique supervisor token prevent PID reuse or unrelated process ownership assumptions. A lock rejects overlapping launcher commands. Repeated starts retain existing PIDs. A failed startup attempts to roll back only resources started by that attempt and reports cleanup failures.

## Shutdown

Stop verified frontend, backend, queue and scheduler groups in that order, including their children. Use graceful TERM followed by a bounded group-only escalation if needed; never process-name-wide killing. Remove stale records without signalling a mismatched PID. Stop a launcher-owned Redis instance only when its recorded PID/creation identity still matches the native service. Pre-existing Redis services remain untouched. PostgreSQL always remains running.

## Status

Report PostgreSQL readiness, queue/cache PINGs and ownership, each app supervisor's verified PID status, owned backend/frontend HTTP readiness, stale records/unmanaged port conflicts, and both URLs. Status is an informational report; read its explicit NOT READY/stale fields rather than treating exit zero as an all-services health assertion.

## Runtime and logs

Ignored `.runtime/` has private mode-0700 directories and mode-0600 PID/metadata/log files. Separate logs are backend.log, frontend.log, queue.log and scheduler.log. They contain only launcher-generated lifecycle, readiness and exit details. Raw application stdout/stderr and environment/configuration values are not persisted, preventing unknown credentials/session payloads from entering these logs. Foreground startup remains available in the guide for detailed diagnostics. Logs append across runs; no rotation is installed.

## Executed validation

| Check | Result |
|---|---|
| Bash and zsh shell syntax; Python compile checks | PASS |
| Make aliases / executable shell entry points | PASS |
| Native PostgreSQL 18 + Laravel credentials / both Redis readiness checks | PASS |
| Laravel, queue, scheduler and Next.js startup | PASS |
| Owned backend HTTP health + frontend-to-backend proxy health | PASS |
| Status of all seven components and URLs | PASS |
| Duplicate startup | PASS; all four PID values remained unchanged |
| Shutdown and descendant cleanup | PASS; app groups exited and ports 8000/3000 were released |
| Restart after shutdown | PASS |
| Dead stale PID and live unrelated PID metadata | PASS; warned/repaired without signalling the unrelated process |
| Occupied port | PASS; startup rejected before app launch and preserved unrelated listener |
| Concurrent launcher invocation | PASS; lock rejected the second invocation |
| Missing PHP/Redis guards | PASS in controlled dependency checks; nothing installed/started |
| Redis stop ownership/service mismatch | PASS in controlled checks; only matching ownership invokes the per-instance stop helper |
| Runtime symlink rejection | PASS in isolated filesystem check |
| Runtime permissions, Git exclusion, configured-secret absence in logs | PASS |
| PostgreSQL cold service start | NOT RE-EXERCISED; PostgreSQL was already running and was preserved |
| New Redis service creation and real owned Redis shutdown | NOT VERIFIED in this launcher run; both services pre-existed and were deliberately not interrupted. Existing native-helper status selector and controlled ownership dispatch passed. |
| Failed-start rollback | PASS; a temporary test-only npm stub forced frontend exit 73 after backend/queue/scheduler started. Startup failed clearly, rolled back those owned groups, left no PID/listener, and preserved pre-existing PostgreSQL/Redis. The stub was removed. |

The first execution exposed a macOS Python executable-path transition in ps output; ownership was corrected to rely on creation time, project command token and process group. The exact first-run supervisor was recovered by its token and stopped. Stale-PID handling also now checks existence before asking ps to inspect out-of-range/dead IDs. Group cleanup excludes an already-reaped ps snapshot helper. All final successful cycles ran after these fixes.

## Final state and limitations

All launcher-created test processes are stopped; no launcher PID records remain. App ports are free. The pre-existing persistent PostgreSQL and two Redis services remain running, and the unrelated safety-test sleep process was explicitly cleaned up by its test owner. No generic process-name kill was used.

This is a macOS native-development launcher, not a deployment supervisor. It requires the documented Homebrew paths, installed dependencies, provisioned native database and correct credentials. It will not take over foreground app processes or Compose listeners. If PID metadata is manually deleted or a tracked Redis service is externally replaced, safe ownership cannot be assumed; status warns and manual review is required. Redis retains its existing LaunchAgent login behavior; stopping an owned instance unloads it for the current login session, without deleting persistent data or its registration file. PostgreSQL remains managed by Homebrew.

Logs are deliberately lifecycle-only; app crashes are not automatically restarted by this convenience layer. Run make status and then make dev to recover a stopped app after reviewing its configuration. No promise of graceful completion of a long-running local queue job is made: shutdown is bounded. Existing retry/idempotency behavior remains the application responsibility, not a new feature introduced here.
