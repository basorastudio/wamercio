#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.8.4" ] || fail 'VERSION'
grep -q '"version": "2.8.4"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.8.4' apps/web/public/sw.js || fail 'PWA cache'
[ -f services/api/migrations/000034_whatsapp_registered_customer_identity.up.sql ] || fail 'migration 000034 up'
[ -f services/api/migrations/000034_whatsapp_registered_customer_identity.down.sql ] || fail 'migration 000034 down'

python3 scripts/test_2_8_4_whatsapp_identity.py

# Reuse the complete 2.8.3 regression body without its release-version header.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk 'BEGIN{skip=1} /^python3 scripts\/test_2_8_3_store_branding.py/{skip=0} !skip{print}' scripts/verify-2.8.3.sh > "$tmp"
sed -i '/PASS: WAMERCIO 2.8.3 tenant branding\/editor verification/d' "$tmp"
sh "$tmp"

# The business identity must never be a visible conversation and registered
# platform identities must not depend on a prior purchase.
grep -q 'isOwnWhatsAppEvent' services/api/internal/httpapi/server.go || fail 'API self identity guard'
grep -q 'isOwnConversationJID' services/whatsapp-bridge/internal/bridge/bridge.go || fail 'bridge self identity guard'
grep -q 'registeredCustomerForWhatsApp' services/api/internal/httpapi/server.go || fail 'registered customer resolver'

echo 'PASS: WAMERCIO 2.8.4 WhatsApp identity/customer verification'
