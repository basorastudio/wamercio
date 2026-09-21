#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.6" ] || fail 'VERSION'
grep -q '"version": "2.8.6"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.6' apps/web/public/sw.js || fail 'PWA cache'
python3 scripts/test_2_8_6_bulk_tables.py

# Reuse the complete 2.8.5 regression body without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_5_global_identity_contact.py/{skip=0} !skip{print}' scripts/verify-2.8.5.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.5 global identity\/contact verification/d' "$tmp"
sh "$tmp"

grep -q 'p.Post("/tables/bulk", s.createStoreTablesBulk)' services/api/internal/httpapi/server.go || fail 'bulk route'
grep -q 'quantity > 500' services/api/internal/httpapi/tables_bulk.go || fail 'bulk limit'
grep -q 'Creación automática' apps/web/app/tables/page.tsx || fail 'bulk UI'
grep -q 'Vista previa' apps/web/app/tables/page.tsx || fail 'bulk preview'

echo 'PASS: WAMERCIO 2.8.6 bulk table creation verification'
