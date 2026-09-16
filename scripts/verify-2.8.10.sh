#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.10" ] || fail 'VERSION'
grep -q '"version": "2.8.10"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.10' apps/web/public/sw.js || fail 'PWA cache'
python3 scripts/test_2_8_10_location_map_experience.py

# Reuse the complete 2.8.9 regression body without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_9_address_geolocation.py/{skip=0} !skip{print}' scripts/verify-2.8.9.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.9 customer address geolocation verification/d' "$tmp"
sh "$tmp"

grep -q 'CustomerLocationMap' apps/web/components/customer-detail-view.tsx || fail 'detail shared map'
grep -q 'CustomerLocationMap' apps/web/components/customer-address-form.tsx || fail 'profile address map'
if grep -q 'function Metric' apps/web/components/customer-detail-view.tsx; then fail 'legacy metric cards'; fi
if grep -q 'Identidad verificada' apps/web/components/customer-detail-view.tsx; then fail 'legacy identity badge'; fi
if grep -q 'WhatsApp verificado' apps/web/components/customer-detail-view.tsx; then fail 'legacy WhatsApp badge'; fi

echo 'PASS: WAMERCIO 2.8.10 synchronized customer map verification'
