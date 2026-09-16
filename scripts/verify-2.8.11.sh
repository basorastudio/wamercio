#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.11" ] || fail 'VERSION'
grep -q '"version": "2.8.11"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.11' apps/web/public/sw.js || fail 'PWA cache'
python3 scripts/test_2_8_11_interactive_customer_map.py

# Reuse the complete 2.8.10 regression body without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_10_location_map_experience.py/{skip=0} !skip{print}' scripts/verify-2.8.10.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.10 synchronized customer map verification/d' "$tmp"
sh "$tmp"

grep -q 'leaflet' apps/web/package.json || fail 'leaflet dependency'
grep -q "leaflet/dist/leaflet.css" apps/web/app/layout.tsx || fail 'leaflet CSS'
grep -q "L.marker" apps/web/components/customer-location-map.tsx || fail 'coordinate marker'
if grep -q 'www.google.com/maps/search' apps/web/components/customer-location-map.tsx; then fail 'external Google Maps click navigation'; fi
if grep -q '<iframe' apps/web/components/customer-location-map.tsx; then fail 'legacy iframe map'; fi

echo 'PASS: WAMERCIO 2.8.11 interactive customer map verification'
