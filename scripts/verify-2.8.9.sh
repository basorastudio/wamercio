#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.9" ] || fail 'VERSION'
grep -q '"version": "2.8.9"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.9' apps/web/public/sw.js || fail 'PWA cache'
python3 scripts/test_2_8_9_address_geolocation.py

# Reuse the complete 2.8.8 regression body without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_8_go_symbol_guard.py/{skip=0} !skip{print}' scripts/verify-2.8.8.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.8 API compile hotfix verification/d' "$tmp"
sh "$tmp"

[ -f services/api/migrations/000036_customer_address_geolocation.up.sql ] || fail 'geolocation up migration'
[ -f services/api/migrations/000036_customer_address_geolocation.down.sql ] || fail 'geolocation down migration'
grep -q 'latitude double precision' services/api/migrations/000036_customer_address_geolocation.up.sql || fail 'latitude migration'
grep -q 'longitude double precision' services/api/migrations/000036_customer_address_geolocation.up.sql || fail 'longitude migration'
grep -q 'Obtener mi ubicación' apps/web/components/customer-address-form.tsx || fail 'profile geolocation CTA'
grep -q 'Obtener mi ubicación' apps/web/components/customer-access-modal.tsx || fail 'registration geolocation CTA'
grep -q 'primary?.latitude' apps/web/components/customer-detail-view.tsx || fail 'coordinate map preference'

echo 'PASS: WAMERCIO 2.8.9 customer address geolocation verification'
