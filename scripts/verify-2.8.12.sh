#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.12" ] || fail 'VERSION'
grep -q '"version": "2.8.12"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.12' apps/web/public/sw.js || fail 'PWA cache'
python3 scripts/test_2_8_12_store_customer_blocking.py

# Reuse the complete 2.8.11 regression body without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_11_interactive_customer_map.py/{skip=0} !skip{print}' scripts/verify-2.8.11.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.11 interactive customer map verification/d' "$tmp"
sh "$tmp"

[ -f services/api/migrations/000037_store_customer_blocking.up.sql ] || fail 'blocking up migration'
[ -f services/api/migrations/000037_store_customer_blocking.down.sql ] || fail 'blocking down migration'
grep -q 'blocked_reason' services/api/migrations/000037_store_customer_blocking.up.sql || fail 'blocked reason persistence'
grep -q 'customer_block_events' services/api/migrations/000037_store_customer_blocking.up.sql || fail 'blocking audit table'
grep -q 'Patch("/customers/{id}/block", s.blockCustomer)' services/api/internal/httpapi/server.go || fail 'block route'
grep -q 'Patch("/customers/{id}/unblock", s.unblockCustomer)' services/api/internal/httpapi/server.go || fail 'unblock route'
grep -q 'Motivo del bloqueo' apps/web/app/customers/page.tsx || fail 'blocking reason UI'
grep -q 'blocked_businesses' apps/web/app/admin/global-customers/page.tsx || fail 'superadmin blocking indicator'

echo 'PASS: WAMERCIO 2.8.12 per-store customer blocking verification'
