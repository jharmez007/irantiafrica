# PHP security remediation — 26 October 2026

This record covers CVE-2026-109618 (out-of-memory state corruption) and CVE-2026-109619 (stale request state). The [PHP security advisory](https://www.php.net/archive/2026.php#2026-10-21-5) and [PHP 8.5.12 release](https://www.php.net/releases/8_5_12.php) identify 8.5.12 as the first fixed PHP 8.5 release. These runtime defects can affect web-serving PHP SAPIs before Laravel code runs; application-level validation is not a substitute for the runtime update.

## Runtime inventory

| Runtime | Before review | Current observation | Result |
| --- | --- | --- | --- |
| macOS Homebrew CLI | 8.5.8 at `/opt/homebrew/bin/php` | Homebrew installed 8.5.12_1, but CLI cannot start on macOS 15.2 because its newly upgraded FreeType bottle references absent `/usr/lib/libhvf.dylib` | Local update incomplete |
| macOS Homebrew FPM | 8.5.8 at `/opt/homebrew/opt/php/sbin/php-fpm` | Same 8.5.12_1 installation and same library-load failure | Local update incomplete; FPM service was not running |
| Local launcher | Development server and scheduler were running from the 8.5.8 Homebrew installation; queue PID record was stale | Launcher-managed frontend, backend and scheduler were stopped before upgrade; PostgreSQL and Redis were retained | Restart and verify after usable patched PHP is available |
| Paid Render web container | Dockerfile used floating `php:8.5-fpm-bookworm` at build time | Read-only Web Shell on 26 October reported **8.5.12** for both `php -v` and `php-fpm -v`, including OPcache 8.5.12 | Deployed CLI/FPM are patched; no deployment performed in this review |
| Render queue/scheduler | Same Docker image as FPM | Supervisor config invokes image-local `php` for both workers; the deployed image's CLI is 8.5.12 | Binary source patched; worker processes were not restarted in this review |

Laravel 13.32.0 is locked. [Laravel's 13.x support matrix](https://laravel.com/framework/docs/releases) lists PHP 8.5 as supported. The project's Composer requirement was `~8.5.0` and is now `~8.5.12` (8.5.12 through the 8.5 line); no package versions were changed. `composer.lock` platform metadata and Composer's content hash were updated together. The hash calculation was checked against the prior lock hash before editing; Composer validation and runtime compatibility tests remain pending until a working patched local runtime or hosted CI verifies them.

## Preventing affected rebuilds

- `Dockerfile.render` now selects the official `php:8.5.12-fpm-bookworm` image and fails its build if the CLI is below 8.5.12. Render's `render.yaml` uses this Dockerfile for the paid service; the same image contains Nginx, PHP-FPM, queue worker and scheduler.
- Hosted CI checks PHP 8.5.12 or newer after `setup-php`, and checks the built image's CLI floor and FPM version equality before readiness testing.
- The macOS launcher, direct backend server script, foundation check and legacy Free-test migration helper reject PHP older than 8.5.12. The launcher passes `/opt/homebrew/bin/php` to the backend, queue and scheduler; the backend script honors that exact `IRANTI_PHP_BINARY` value.
- No payment, tax, inventory, customer, production configuration or production data was changed.

## Local installation blocker and safe next step

`brew upgrade php` installed Homebrew PHP 8.5.12_1 and required dependency updates. It exited with a FreeType post-install/load failure: its bottle references `/usr/lib/libhvf.dylib`, absent on macOS Sequoia 15.2. Both `php -v` and `php-fpm -v` currently exit before startup. A proposed source rebuild was stopped immediately when Homebrew warned that source builds are unsupported for this host; no library symlink, PHP downgrade or alternate runtime workaround was used.

The owner approved updating macOS to Sequoia 15.8.1 and restarting. Apple Software Update reports that the patch requires **22.66 GB free**, while the disk had **6.6 GB free** at the download attempt. Download/install could not proceed. After the owner frees sufficient space, apply the approved Sequoia update, verify `/opt/homebrew/bin/php -v` and `/opt/homebrew/opt/php/sbin/php-fpm -v`, rerun `brew postinstall php` if Homebrew still reports an incomplete post-install, then restart the launcher and confirm its backend/queue/scheduler processes use the patched binary. Do not restart the affected 8.5.8 server.

## Verification

| Check | Result |
| --- | --- |
| PHP advisory/version provenance | PASS — official PHP advisory and release note reviewed |
| Render CLI and FPM | PASS — 8.5.12 observed read-only in deployed container |
| Local CLI and FPM | BLOCKED — 8.5.12_1 installed but unusable until macOS update |
| Launcher and shell syntax | PASS — Python AST parse, `bash -n`, `sh -n` |
| Frontend formatting, ESLint, TypeScript | PASS |
| Frontend Vitest | PASS — 30 files, 398 tests |
| Frontend production build | PASS with `--webpack`, the same mode used by `Dockerfile.render`; default local Turbopack build could not bind a helper port in the sandbox |
| Backend PHPUnit, Pint, Larastan, Composer validate/audit | PENDING — local PHP cannot load; run on patched runtime and record exact results |
| Docker image and hosted CI | PENDING — source safeguards added, image not built or deployed during this review |

No production deployment or data change occurred. The current Render runtime is already patched, but any earlier immutable image or separate PHP service must be checked independently before use. The local Mac must remain out of PHP web-serving use until its loader problem is resolved and complete backend regression passes.
