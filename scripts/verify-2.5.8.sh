#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.5.8" ] || fail 'VERSION'
grep -q '"version": "2.5.8"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.5.8' apps/web/public/sw.js || fail 'PWA cache'

node scripts/test_2_5_6_cart_helpers.js
node scripts/test_2_5_8_cart_quantity.js
node scripts/test_2_5_8_customer_address_territory.js
python3 scripts/test_2_5_8_product_modal.py
python3 scripts/test_2_5_8_catalog_customer_fixes.py
python3 scripts/test_2_5_8_cart_address_experience.py
python3 scripts/test_2_5_8_whatsapp_session_hygiene.py
python3 scripts/test_2_5_8_customer_contact_profiles.py
python3 scripts/test_2_5_8_api_build_regressions.py
python3 scripts/test_2_5_8_admin_settings_independent_scroll.py
python3 scripts/test_2_5_8_owner_identity_landing_editor.py
python3 scripts/test_2_5_8_next_page_exports.py
python3 scripts/test_2_5_8_owner_customer_access_profile.py
python3 scripts/test_2_5_8_whatsapp_identity_user_profiles.py
python3 scripts/test_2_5_6_natural_purchase.py
python3 scripts/test_2_5_7_api_imports.py
python3 scripts/test_2_5_5_storefront_ux.py
python3 scripts/test_2_5_5_multitenant_hosts.py
python3 scripts/test_2_5_5_exact_tenant_routers.py
python3 scripts/test_2_5_3_searchparams_suspense.py
python3 scripts/test_2_5_1_compile_regressions.py
python3 scripts/test_2_5_2_web_store_contract.py
python3 scripts/test_2_5_0_customer_host_portal.py
./scripts/verify-owner-tabs.sh
./scripts/verify-convergence.sh
./scripts/verify-api-compile-guards.sh
./scripts/verify-web-settings-types.sh
python3 scripts/test_2_3_2_owner_business_flows.py
python3 scripts/test_2_3_3_public_registration_profile.py

up=$(find services/api/migrations -maxdepth 1 -name '*.up.sql' | wc -l | tr -d ' ')
down=$(find services/api/migrations -maxdepth 1 -name '*.down.sql' | wc -l | tr -d ' ')
[ "$up" = "$down" ] || fail "migration pairs ($up/$down)"
[ -f services/api/migrations/000019_multitenant_domains.up.sql ] || fail 'migration 000019 up'
[ -f services/api/migrations/000019_multitenant_domains.down.sql ] || fail 'migration 000019 down'

if grep -R -i -q 'colmapro\|col\.do' apps services --exclude-dir=node_modules; then fail 'legacy brand reference'; fi
if grep -R -q 'wamercio.com/{slug}' apps services; then fail 'legacy path-based tenant URL'; fi
if grep -R -q '/public/stores/{slug}' services/api; then fail 'legacy slug public API'; fi

grep -q 'PLATFORM_DOMAIN=wamercio.com' .env.example || fail 'PLATFORM_DOMAIN env'
grep -q 'TENANT_ROOT_DOMAIN=ltd.do' .env.example || fail 'TENANT_ROOT_DOMAIN env'
grep -q 'CUSTOM_DOMAIN_CNAME_TARGET=domains.ltd.do' .env.example || fail 'CUSTOM_DOMAIN_CNAME_TARGET env'
grep -q 'TENANT_ROOT_DOMAIN' docker-compose.yml || fail 'tenant root compose env'
grep -q 'domain-router' docker-compose.yml || fail 'domain router compose service'
if grep -q 'HostRegexp' infra/traefik/wamercio.yml; then fail 'legacy wildcard Traefik router'; fi
GO111MODULE=off go test services/domain-router/cmd/router/render.go services/domain-router/cmd/router/render_test.go

python3 - <<'PY'
import json, yaml
json.load(open('apps/web/package.json'))
for f in ('docker-compose.yml','docker-compose.local.yml','infra/traefik/wamercio.yml'):
    with open(f) as h: yaml.safe_load(h)
print('JSON/YAML: OK')
PY

node - <<'NODE'
const fs=require('fs'),path=require('path');
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
let count=0,bad=0;
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='node_modules')continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(e.name)){count++;const sf=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true,e.name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(sf.parseDiagnostics.length){bad++;console.error(p,sf.parseDiagnostics.map(x=>x.messageText));}}}}
walk('apps/web');console.log(`TypeScript syntax: ${count} files, ${bad} errors`);process.exit(bad?1:0)
NODE

if [ -n "$(gofmt -d $(find services -name '*.go' -type f))" ]; then fail 'gofmt'; fi
for f in scripts/*.sh; do sh -n "$f" || fail "shell syntax: $f"; done

grep -q 'formatOrderQuantity(item.qty)' services/api/internal/httpapi/server.go || fail 'fractional quantity notifications'
grep -q 'Vender por libra' apps/web/app/catalog/products/page.tsx || fail 'weighted product editor'

echo 'PASS: WAMERCIO 2.5.8 static verification'
