#!/usr/bin/env bash
# Local-only defaults; export OIDC settings before starting for authenticated use.
set -euo pipefail
cd "$(dirname "$0")/.."
export HOSTNAME=127.0.0.1
export PORT="${PORT:-13459}"
export QRFORGE_PUBLIC_URL="${QRFORGE_PUBLIC_URL:-http://127.0.0.1:$PORT}"
export QRFORGE_DB_PATH="${QRFORGE_DB_PATH:-$PWD/.local/qrforge.db}"
export QRFORGE_INSECURE_COOKIES=1
mkdir -p "$(dirname "$QRFORGE_DB_PATH")"
exec ./qrforge
