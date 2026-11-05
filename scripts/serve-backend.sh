#!/usr/bin/env bash
set -euo pipefail
iranti_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
iranti_php="${IRANTI_PHP_BINARY:-php}"
if [[ -x /opt/homebrew/bin/php && -z "${IRANTI_PHP_BINARY:-}" ]]; then iranti_php=/opt/homebrew/bin/php; fi
if [[ -n "${IRANTI_LOCAL_FREETYPE_DIR:-}" ]]; then
    echo "ERROR: IRANTI_LOCAL_FREETYPE_DIR is supported only by the macOS native launcher (make dev)." >&2
    exit 1
fi
if [[ -n "${IRANTI_LAUNCHER_FREETYPE_DIR:-}" ]]; then
    if [[ "$(uname -s)" != "Darwin" || -n "${CI:-}${GITHUB_ACTIONS:-}${RENDER:-}${IRANTI_DEPLOYMENT_PROFILE:-}" || "${APP_ENV:-local}" != "local" || "${IRANTI_NATIVE_LAUNCHER:-}" != "1" || ! -f "${IRANTI_LAUNCHER_FREETYPE_DIR}/libfreetype.6.dylib" ]]; then
        echo "ERROR: Invalid native-launcher FreeType compatibility handoff." >&2
        exit 1
    fi
    export DYLD_LIBRARY_PATH="$IRANTI_LAUNCHER_FREETYPE_DIR"
fi
unset IRANTI_LAUNCHER_FREETYPE_DIR IRANTI_NATIVE_LAUNCHER
"$iranti_php" -r 'if (PHP_MAJOR_VERSION !== 8 || PHP_MINOR_VERSION !== 5 || PHP_VERSION_ID < 80512) { fwrite(STDERR, "PHP 8.5.12 or newer is required.\n"); exit(1); }'
export PHP_INI_SCAN_DIR="${PHP_INI_SCAN_DIR:-}:$iranti_root/backend/runtime/php"
cd "$iranti_root/backend"
exec "$iranti_php" artisan serve --host=127.0.0.1 --port=8000 "$@"
