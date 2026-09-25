#!/usr/bin/env bash
set -euo pipefail
iranti_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
iranti_php="${IRANTI_PHP_BINARY:-php}"
if [[ -x /opt/homebrew/bin/php && -z "${IRANTI_PHP_BINARY:-}" ]]; then iranti_php=/opt/homebrew/bin/php; fi
"$iranti_php" -r 'if (PHP_MAJOR_VERSION !== 8 || PHP_MINOR_VERSION !== 5) { fwrite(STDERR, "PHP 8.5 is required.\n"); exit(1); }'
export PHP_INI_SCAN_DIR="${PHP_INI_SCAN_DIR:-}:$iranti_root/backend/runtime/php"
cd "$iranti_root/backend"
exec "$iranti_php" artisan serve --host=127.0.0.1 --port=8000 "$@"
