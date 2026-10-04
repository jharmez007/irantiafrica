#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPROVED_SHA=35fab6dce276378ce41ac01bc4674f90f91f9747
PHP=/opt/homebrew/bin/php

if [[ ! -x "$PHP" ]]; then
  echo 'PHP 8.5 is required at /opt/homebrew/bin/php.' >&2
  exit 1
fi
if [[ "$(git -C "$ROOT_DIR" rev-parse HEAD)" != "$APPROVED_SHA" ]] || ! git -C "$ROOT_DIR" diff --quiet "$APPROVED_SHA" -- backend; then
  echo 'The local backend must match the approved release SHA before migrating the free test database.' >&2
  exit 1
fi
if [[ -e "$ROOT_DIR/backend/bootstrap/cache/config.php" ]]; then
  echo 'Laravel config is cached locally; remove the cache in a separate reviewed step before using this helper.' >&2
  exit 1
fi
if [[ ! -t 0 ]]; then
  echo 'Run this script in an interactive terminal so the database URL stays out of command history.' >&2
  exit 1
fi

read -r -s -p 'Paste the Render FREE TEST external database URL (hidden): ' db_url
printf '\n'
export IRANTI_FREE_DB_URL="$db_url"
unset db_url
trap 'unset IRANTI_FREE_DB_URL DB_URL' EXIT

python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse

url = urlparse(os.environ['IRANTI_FREE_DB_URL'])
if (url.scheme not in ('postgres', 'postgresql')
        or not (url.hostname or '').startswith('dpg-db12ss5g1s2s738a7d00-a.')
        or not (url.hostname or '').endswith('.render.com')
        or url.path != '/iranti_free_test_vaju'
        or url.username != 'iranti_test'
        or not url.password):
    sys.exit('This is not the expected Render FREE TEST database URL; nothing was run.')
PY

export DB_URL="$IRANTI_FREE_DB_URL"
export APP_ENV=staging DB_CONNECTION=pgsql DB_SSLMODE=require
export CACHE_STORE=database RATE_LIMIT_CACHE_STORE=database
export QUEUE_CONNECTION=database SESSION_DRIVER=database
cd "$ROOT_DIR/backend"
"$PHP" artisan migrate --force --no-interaction
"$PHP" artisan migrate:status --no-interaction
