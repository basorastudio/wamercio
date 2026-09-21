#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.8" ] || fail 'VERSION'
grep -q '"version": "2.8.8"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.8' apps/web/public/sw.js || fail 'PWA cache'
python3 scripts/test_2_8_8_go_symbol_guard.py

# Reuse the complete 2.8.7 verification body without its version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_7_customer_details.py/{skip=0} !skip{print}' scripts/verify-2.8.7.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.7 customer detail experience verification/d' "$tmp"
sh "$tmp"

grep -q 'func joinCustomerAddressParts(parts ...string) string' services/api/internal/httpapi/customer_details.go || fail 'renamed address helper'
[ "$(grep -R '^func customerAddressText(' services/api/internal/httpapi/*.go | wc -l | tr -d ' ')" = "1" ] || fail 'customerAddressText duplicate'

echo 'PASS: WAMERCIO 2.8.8 API compile hotfix verification'
