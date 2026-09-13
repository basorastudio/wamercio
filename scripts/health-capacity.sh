#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/colmapro}"
cd "$APP_DIR"
echo "== AutoTune =="
[[ -f .env.auto ]] && grep -E '^(AUTOTUNE_|PG_MAX_CONNECTIONS|TENANT_DB_MAX_CONNS|MAX_ACTIVE_TENANT_POOLS|REDIS_MAXMEMORY|BOOTSTRAP_REFETCH_MS|CLIENT_CART_PULL_MS)=' .env.auto || true
echo
echo "== Docker =="
docker compose ps || true
echo
echo "== Backend capacity =="
curl -fsS http://127.0.0.1/api/platform/capacity || true
echo
