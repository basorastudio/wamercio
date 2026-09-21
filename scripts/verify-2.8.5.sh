#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.5" ] || fail 'VERSION'
grep -q '"version": "2.8.5"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.5' apps/web/public/sw.js || fail 'PWA cache'
[ -f services/api/migrations/000035_global_identity_contact_semantics.up.sql ] || fail 'migration 000035 up'
[ -f services/api/migrations/000035_global_identity_contact_semantics.down.sql ] || fail 'migration 000035 down'

python3 scripts/test_2_8_5_global_identity_contact.py

# Reuse the complete 2.8.4 regression body without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_4_whatsapp_identity.py/{skip=0} !skip{print}' scripts/verify-2.8.4.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.4 WhatsApp self-identity verification/d' "$tmp"
sh "$tmp"

grep -q 'registeredIdentityForWhatsApp' services/api/internal/httpapi/server.go || fail 'global identity resolver'
grep -q 'purchasedCustomerForWhatsApp' services/api/internal/httpapi/server.go || fail 'purchased customer resolver'
! grep -q 'func registeredCustomerForWhatsApp' services/api/internal/httpapi/server.go || fail 'obsolete auto-promotion resolver remains'
grep -q 'SET customer_id=NULL' services/api/migrations/000035_global_identity_contact_semantics.up.sql || fail 'zero-purchase unlink migration'

echo 'PASS: WAMERCIO 2.8.5 global identity/contact verification'
