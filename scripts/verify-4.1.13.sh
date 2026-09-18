#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }
[ "$(cat VERSION)" = "4.1.13" ] || fail VERSION
grep -q '"version": "4.1.13"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v4.1.13' apps/web/public/sw.js || fail 'PWA cache'
python3 scripts/test_4_1_13_voice_video_upgrade.py
python3 scripts/test_4_1_12_customer_contact_pin.py
python3 scripts/test_4_1_11_phone_input_profile_nav.py
python3 scripts/test_4_1_10_incoming_avatar.py
python3 scripts/test_4_1_7_softphone_sync.py
python3 scripts/test_4_1_6_call_lifecycle.py
python3 scripts/test_4_1_3_build_scope.py
python3 scripts/test_3_0_0_conversation_center_pro.py
go run scripts/check_go_scope.go services/api/internal/httpapi services/whatsapp-bridge/internal/bridge services/whatsapp-bridge/internal/voip/call services/whatsapp-bridge/internal/voip/signaling services/whatsapp-bridge/internal/voip/transport services/whatsapp-bridge/internal/wacall
python3 - <<'PY2'
from pathlib import Path
import json,re
root=Path('.')
m=root/'services/api/migrations'
ups={p.name[:-7] for p in m.glob('*.up.sql')}; downs={p.name[:-9] for p in m.glob('*.down.sql')}
assert ups==downs
server=(root/'services/api/internal/httpapi/server.go').read_text()
registered=set(re.findall(r'\bs\.([A-Za-z_][A-Za-z0-9_]*)\)',server)); methods=set()
for p in (root/'services/api/internal/httpapi').glob('*.go'):
    methods.update(re.findall(r'func \(s \*Server\) ([A-Za-z_][A-Za-z0-9_]*)\(',p.read_text()))
assert not sorted(registered-methods)
for p in root.rglob('*.json'):
    if 'node_modules' not in p.parts: json.loads(p.read_text())
print(f'Migration pairs: {len(ups)}/{len(downs)}')
print(f'HTTP handlers: {len(registered)} registered, 0 missing')
print('JSON: OK')
PY2
node - <<'JS'
const fs=require('fs'),path=require('path'),ts=require('typescript');let count=0,bad=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='node_modules'||e.name==='.next')continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(e.name)){count++;const sf=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true,e.name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);for(const x of sf.parseDiagnostics)bad.push(p+': TS'+x.code+' '+ts.flattenDiagnosticMessageText(x.messageText,' '));}}}walk('apps/web');console.log(`TypeScript syntax: ${count} files, ${bad.length} errors`);if(bad.length){console.error(bad.join('\n'));process.exit(1)}
JS
[ -z "$(gofmt -l services/api services/whatsapp-bridge services/domain-router)" ] || fail gofmt
for f in scripts/*.sh; do sh -n "$f"; done
python3 - <<'PY3'
import yaml
yaml.safe_load(open('docker-compose.yml',encoding='utf-8')); print('Docker Compose YAML: OK')
PY3
echo 'gofmt: OK'; echo 'Shell syntax: OK'; echo 'PASS: WAMERCIO 4.1.13 release verification'
