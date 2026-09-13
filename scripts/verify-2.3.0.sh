#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.3.0" ] || fail 'VERSION'
grep -q '"version": "2.3.0"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.3.0' apps/web/public/sw.js || fail 'PWA cache'

./scripts/verify-convergence.sh
./scripts/verify-api-compile-guards.sh
./scripts/verify-web-settings-types.sh
./scripts/test-centro-saas-2.3.sh

up=$(find services/api/migrations -maxdepth 1 -name '*.up.sql' | wc -l | tr -d ' ')
down=$(find services/api/migrations -maxdepth 1 -name '*.down.sql' | wc -l | tr -d ' ')
[ "$up" = "$down" ] || fail "migration pairs ($up/$down)"
[ -f services/api/migrations/000015_platform_settings_functional.up.sql ] || fail 'migration 000015 up'
[ -f services/api/migrations/000015_platform_settings_functional.down.sql ] || fail 'migration 000015 down'

if grep -R -i -q 'colmapro\|col\.do' apps services --exclude-dir=node_modules; then fail 'legacy brand reference'; fi

grep -q 'PLATFORM_CONFIG_SECRET' .env.example || fail 'PLATFORM_CONFIG_SECRET missing from env example'
grep -q 'PLATFORM_CONFIG_SECRET' docker-compose.yml || fail 'PLATFORM_CONFIG_SECRET missing from compose'
grep -q 'identity_document' apps/web/components/access-modal.tsx || fail 'owner identity document field missing'
grep -q 'require_owner_verification' apps/web/components/access-modal.tsx || fail 'owner identity policy missing in registration'
grep -q 'puede_registrarse' services/api/internal/httpapi/server.go || fail 'identity business result not enforced'
grep -q '/api/v1/territories/health' apps/web/app/admin/settings/page.tsx || fail 'GEO RD MAP health path mismatch in UI'

python - <<'PY'
import json, yaml
json.load(open('apps/web/package.json'))
for f in ('docker-compose.yml','docker-compose.local.yml'):
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

if [ -n "$(gofmt -d $(find services/api -name '*.go' -type f))" ]; then fail 'gofmt'; fi
for f in scripts/*.sh; do sh -n "$f" || fail "shell syntax: $f"; done

echo 'PASS: WAMERCIO 2.3.0 static verification'
