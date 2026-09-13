#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_DIR="$APP_DIR" bash "${APP_DIR}/scripts/autotune.sh"
cd "$APP_DIR"
docker compose up -d --force-recreate
