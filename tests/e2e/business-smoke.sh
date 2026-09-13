#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${COLMAPRO_SMOKE_BASE_URL:-http://127.0.0.1}"
API_URL="${COLMAPRO_SMOKE_API_URL:-${BASE_URL%/}/api}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

request() {
  curl --fail --silent --show-error --connect-timeout 5 --max-time 20 "$@"
}

request -D "$TMP_DIR/health.headers" -o "$TMP_DIR/health.json" "${BASE_URL%/}/health/ready"
grep -qi '^x-content-type-options: nosniff' "$TMP_DIR/health.headers"
grep -qi '^x-frame-options: DENY' "$TMP_DIR/health.headers"
grep -qi '^content-security-policy:' "$TMP_DIR/health.headers"

request -o "$TMP_DIR/runtime.json" "${API_URL%/}/runtime-config"
python3 - "$TMP_DIR/runtime.json" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1], encoding='utf-8'))
assert isinstance(payload, dict)
PY

status="$(curl --silent --output "$TMP_DIR/protected.json" --write-out '%{http_code}' --connect-timeout 5 --max-time 20 "${API_URL%/}/reports/summary?store_id=00000000-0000-0000-0000-000000000000")"
case "$status" in
  401|403) ;;
  *) echo "La ruta protegida devolvió HTTP $status, se esperaba 401 o 403" >&2; exit 1 ;;
esac

echo "Prueba de humo pública y de seguridad completada correctamente."
