#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.7" ] || fail 'VERSION'
grep -q '"version": "2.8.7"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.7' apps/web/public/sw.js || fail 'PWA cache'
python3 scripts/test_2_8_7_customer_details.py

# Reuse the full 2.8.6 regression body without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_6_bulk_tables.py/{skip=0} !skip{print}' scripts/verify-2.8.6.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.6 bulk table creation verification/d' "$tmp"
sh "$tmp"

grep -q 'Get("/admin/global-customers/{id}", s.adminGlobalCustomerDetail)' services/api/internal/httpapi/server.go || fail 'global customer detail route'
grep -q 'loyalty_points' services/api/internal/httpapi/server.go || fail 'customer loyalty points'
grep -q 'Detalles del cliente' apps/web/app/customers/page.tsx || fail 'customer detail button'
grep -q 'CustomerLocationMap' apps/web/components/customer-detail-view.tsx || fail 'Google Maps detail component'
grep -q 'profilePictureUrl' apps/web/components/customer-location-map.tsx || fail 'shared customer location map avatar' 
grep -q 'conversation_id' apps/web/app/conversations/page.tsx || fail 'conversation deep link'

echo 'PASS: WAMERCIO 2.8.7 customer detail experience verification'
