#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.2.1" ] || fail 'VERSION'
grep -q '"version": "2.2.1"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.2.1' apps/web/public/sw.js || fail 'PWA cache'
./scripts/verify-convergence.sh
./scripts/verify-api-compile-guards.sh
up=$(find services/api/migrations -maxdepth 1 -name '*.up.sql' | wc -l | tr -d ' ')
down=$(find services/api/migrations -maxdepth 1 -name '*.down.sql' | wc -l | tr -d ' ')
[ "$up" = "$down" ] || fail "migration pairs ($up/$down)"
[ -f services/api/migrations/000014_saas_operations_convergence.up.sql ] || fail 'migration 000014 up'
[ -f services/api/migrations/000014_saas_operations_convergence.down.sql ] || fail 'migration 000014 down'
if grep -R -i -q 'colmapro\|col\.do' apps services --exclude-dir=node_modules; then fail 'legacy brand reference'; fi
python - <<'PY'
import json,yaml
json.load(open('apps/web/package.json'))
for f in ('docker-compose.yml','docker-compose.local.yml'):
    with open(f) as h: yaml.safe_load(h)
print('JSON/YAML: OK')
PY
node - <<'NODE'
const fs=require('fs'),path=require('path');
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
let count=0,bad=0;
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(e.name)){count++;const sf=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true,e.name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(sf.parseDiagnostics.length){bad++;console.error(p,sf.parseDiagnostics.map(x=>x.messageText));}}}}
walk('apps/web');console.log(`TypeScript syntax: ${count} files, ${bad} errors`);process.exit(bad?1:0)
NODE
if [ -n "$(gofmt -d $(find services/api -name '*.go' -type f))" ]; then fail 'gofmt'; fi
echo 'PASS: WAMERCIO 2.2.1 static verification'
