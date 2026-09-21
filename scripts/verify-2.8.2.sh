#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.2" ] || fail 'VERSION'
grep -q '"version": "2.8.2"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.2' apps/web/public/sw.js || fail 'PWA cache'

python3 scripts/test_2_8_2_web_type_guard.py

# Reuse the complete 2.8.1 regression suite without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_6_0_phase1_features.py/{skip=0} !skip{print}' scripts/verify-2.8.1.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.1 static verification/d' "$tmp"
sh "$tmp"

# Production build regression reported by Dokploy 2.8.1.
grep -q 'type LoyaltyState=' apps/web/components/storefront.tsx || fail 'LoyaltyState type'
grep -q 'useState<LoyaltyState|null>(null)' apps/web/components/storefront.tsx || fail 'typed loyalty state'
! grep -q 'setLoyalty(v=>' apps/web/components/storefront.tsx || fail 'untyped loyalty functional updater'

echo 'PASS: WAMERCIO 2.8.2 static verification'
