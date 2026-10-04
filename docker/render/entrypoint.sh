#!/usr/bin/env bash
set -euo pipefail

# Render can invoke a pre-deploy command either directly or through the image
# ENTRYPOINT. Accept our explicit path in either case without starting web.
if [[ "${1:-}" == /usr/local/bin/iranti-entrypoint ]]; then
  shift
fi

case "${1:-}" in
  web)
    : "${PORT:=10000}"
    if [[ ! "$PORT" =~ ^[0-9]{4,5}$ ]]; then
      echo 'PORT must be an unprivileged numeric port.' >&2
      exit 1
    fi
    if [[ "${PRELAUNCH_GATE_ENABLED:-true}" == true ]]; then
      if [[ -z "${PRELAUNCH_BASIC_AUTH_HASH:-}" ]]; then
        echo 'Pre-launch gate enabled but its bcrypt hash is missing.' >&2
        exit 1
      fi
      umask 077
      printf 'operator:%s\n' "$PRELAUNCH_BASIC_AUTH_HASH" > /tmp/iranti-htpasswd
      printf 'auth_basic "IRANTI pre-launch";\nauth_basic_user_file /tmp/iranti-htpasswd;\n' > /tmp/iranti-gate.conf
    else
      printf 'auth_basic off;\n' > /tmp/iranti-gate.conf
    fi
    export PORT
    envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /tmp/iranti-nginx.conf
    exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
    ;;
  migrate)
    exec php /app/backend/artisan migrate --force
    ;;
  *)
    echo 'Usage: iranti-entrypoint {web|migrate}' >&2
    exit 2
    ;;
esac
