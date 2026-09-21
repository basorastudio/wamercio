#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.3" ] || fail 'VERSION'
grep -q '"version": "2.8.3"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.3' apps/web/public/sw.js || fail 'PWA cache'
grep -q "const SHELL=\['/'\]" apps/web/public/sw.js || fail 'tenant-safe service worker shell'

python3 scripts/test_2_8_3_store_branding.py
python3 scripts/test_2_5_5_storefront_ux.py
python3 scripts/test_2_5_5_multitenant_hosts.py

# Reuse the complete 2.8.2 regression body without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_2_web_type_guard.py/{skip=0} !skip{print}' scripts/verify-2.8.2.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.2 static verification/d' "$tmp"
sh "$tmp"

# Tenant branding cannot fall back to platform identity on public surfaces.
! grep -q "brand?.name||'WAMERCIO'" apps/web/components/customer-access-modal.tsx || fail 'customer modal platform fallback'
! grep -q 'Impulsado por WAMERCIO' apps/web/components/storefront.tsx || fail 'public WAMERCIO footer'
grep -q 'tenant-icon.svg' apps/web/app/manifest.webmanifest/route.ts || fail 'tenant manifest icon fallback'
grep -q 'tenant-icon.svg' apps/web/app/layout.tsx || fail 'tenant metadata icon fallback'
grep -q 'generateViewport' apps/web/app/layout.tsx || fail 'tenant viewport theme color'

echo 'PASS: WAMERCIO 2.8.3 tenant branding/editor verification'
