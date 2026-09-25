#!/usr/bin/env bash
set -euo pipefail
iranti_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/bin:$PATH"
command -v python3 >/dev/null 2>&1 || { echo "ERROR: Python 3 is required." >&2; exit 1; }
cd "$iranti_root"
exec python3 "$iranti_root/scripts/dev-processes.py" "status"
