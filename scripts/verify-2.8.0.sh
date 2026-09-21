#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.0" ] || fail 'VERSION'
grep -q '"version": "2.8.0"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.0' apps/web/public/sw.js || fail 'PWA cache'

python3 scripts/test_2_6_0_phase1_features.py
python3 scripts/test_2_7_0_phase2_features.py
python3 scripts/test_2_8_0_phase3_features.py

# Run the historical regression body from 2.6 without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_6_0_phase1_features.py/{skip=0; next} !skip{print}' scripts/verify-2.6.0.sh > "$tmp"
# Remove the old final release label; all commands/checks remain intact.
sed -i '/PASS: WAMERCIO 2.6.0 static verification/d' "$tmp"
sh "$tmp"

[ -f services/api/migrations/000032_phase2_operations.up.sql ] || fail 'migration 000032 up'
[ -f services/api/migrations/000032_phase2_operations.down.sql ] || fail 'migration 000032 down'
[ -f services/api/migrations/000033_phase3_growth_experience.up.sql ] || fail 'migration 000033 up'
[ -f services/api/migrations/000033_phase3_growth_experience.down.sql ] || fail 'migration 000033 down'

# The release-specific QR contract includes general + per-table style override.
grep -q 'Personalizar esta mesa' apps/web/app/tables/page.tsx || fail 'table QR override editor'
grep -q 'Usar diseño general' apps/web/app/tables/page.tsx || fail 'table QR reset control'
grep -q 'table_id' apps/web/app/tables/page.tsx || fail 'table QR override payload'

echo 'PASS: WAMERCIO 2.8.0 static verification'
