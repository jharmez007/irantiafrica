#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
mailpit_bin="$(command -v mailpit || true)"
if [[ -z "$mailpit_bin" ]]; then
  echo 'Mailpit is not installed. Optional installation: brew install mailpit' >&2
  exit 1
fi
umask 077
mkdir -p .runtime/mailpit
# A clean environment prevents inherited relay/forwarding configuration.
# Foreground process: Ctrl-C stops only this service.
exec env -i PATH="$PATH" HOME="$HOME" "$mailpit_bin" \
  --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 \
  --database "$root/.runtime/mailpit/messages.db" \
  --disable-version-check --quiet
