#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ "$(cat VERSION)" = "2.9.2" ] || fail 'VERSION'
grep -q '"version": "2.9.2"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v2.9.2' apps/web/public/sw.js || fail 'PWA cache'

python3 scripts/test_2_9_2_web_production_hotfix.py
python3 scripts/test_2_9_1_api_compile_hotfix.py
python3 scripts/test_2_9_0_social_commerce.py
python3 scripts/test_2_9_0_release_integration.py
python3 scripts/test_2_9_0_cheque_evaluations.py
python3 scripts/test_2_9_0_native_whatsapp_poll.py

# Latest regression contracts retained from the 2.8 line.
python3 scripts/test_2_8_12_store_customer_blocking.py
python3 scripts/test_2_8_11_interactive_customer_map.py
python3 scripts/test_2_8_10_location_map_experience.py
python3 scripts/test_2_8_9_address_geolocation.py
python3 scripts/test_2_8_8_go_symbol_guard.py
python3 scripts/test_2_8_7_customer_details.py
python3 scripts/test_2_8_6_bulk_tables.py
python3 scripts/test_2_8_5_global_identity_contact.py
python3 scripts/test_2_8_4_whatsapp_identity.py
python3 scripts/test_2_8_3_store_branding.py
python3 scripts/test_2_8_2_web_type_guard.py
python3 scripts/test_2_8_1_compile_guard.py
python3 scripts/test_2_8_0_phase3_features.py
python3 scripts/test_2_7_0_phase2_features.py
python3 scripts/test_2_6_0_phase1_features.py

# Stable commerce/WhatsApp/multitenant regressions.
python3 scripts/test_2_5_8_api_build_regressions.py
python3 scripts/test_2_5_8_whatsapp_session_hygiene.py
python3 scripts/test_2_5_8_whatsapp_identity_user_profiles.py
python3 scripts/test_2_5_8_whatsapp_tables_pos.py
python3 scripts/test_2_5_8_customer_contact_profiles.py
python3 scripts/test_2_5_8_customer_quote_distinction.py
python3 scripts/test_2_5_8_platform_coherence.py
python3 scripts/test_2_5_8_contextual_order_flows.py
python3 scripts/test_2_5_8_table_areas_payment_rules.py
python3 scripts/test_2_5_8_store_scope_qr.py
node scripts/test_2_5_8_business_capabilities.js
node scripts/test_2_5_6_cart_helpers.js
node scripts/test_2_5_8_store_scope_helpers.js

python3 - <<'PY'
from pathlib import Path
import json, yaml
root=Path('.')
m=root/'services/api/migrations'
ups={p.name[:-7] for p in m.glob('*.up.sql')}
downs={p.name[:-9] for p in m.glob('*.down.sql')}
assert ups==downs, f'migration mismatch up-only={sorted(ups-downs)} down-only={sorted(downs-ups)}'
print(f'Migration pairs: {len(ups)}/{len(downs)}')
for n in ['000038_social_google_evaluations','000039_store_bank_accounts','000040_customer_cheque_authorization']:
    assert (m/(n+'.up.sql')).exists() and (m/(n+'.down.sql')).exists(), n
for p in root.rglob('*.json'):
    if 'node_modules' in p.parts: continue
    json.loads(p.read_text(encoding='utf-8'))
for p in [root/'docker-compose.yml',root/'docker-compose.local.yml',root/'.github/workflows/ci.yml']:
    yaml.safe_load(p.read_text(encoding='utf-8'))
print('JSON/YAML: OK')
PY

node - <<'JS'
const fs=require('fs'),path=require('path'),ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
let count=0,bad=0;
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='node_modules')continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(e.name)){count++;const sf=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true,e.name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(sf.parseDiagnostics.length){bad++;console.error(p,sf.parseDiagnostics.map(x=>x.messageText));}}}}
walk('apps/web');console.log(`TypeScript syntax: ${count} files, ${bad} errors`);process.exit(bad?1:0);
JS

# Target the exact semantic failure from Dokploy without depending on npm availability.
node - <<'JS'
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'),path=require('path');
const cfg=ts.readConfigFile('apps/web/tsconfig.json',ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,path.resolve('apps/web'));
const program=ts.createProgram(parsed.fileNames,parsed.options);
const bad=ts.getPreEmitDiagnostics(program).filter(d=>d.code===7053 && d.file && d.file.fileName.endsWith('/app/payment-methods/page.tsx'));
if(bad.length){for(const d of bad)console.error(ts.flattenDiagnosticMessageText(d.messageText,' '));process.exit(1)}
console.log('Payment-method Rules indexing semantic guard: OK');
JS

cat > /tmp/wamercio_parse_go.go <<'GO'
package main
import("fmt";"go/parser";"go/token";"os";"path/filepath";"strings")
func main(){bad:=0;count:=0; filepath.Walk(".",func(path string,info os.FileInfo,err error)error{if err!=nil{return err};if info.IsDir(){if info.Name()=="vendor"||info.Name()=="node_modules"{return filepath.SkipDir};return nil};if strings.HasSuffix(path,".go"){count++;if _,e:=parser.ParseFile(token.NewFileSet(),path,nil,parser.AllErrors);e!=nil{fmt.Printf("GO PARSE ERROR %s: %v\n",path,e);bad++}};return nil});fmt.Printf("Go syntax: %d files, %d errors\n",count,bad);if bad>0{os.Exit(1)}}
GO
go run /tmp/wamercio_parse_go.go
rm -f /tmp/wamercio_parse_go.go

go run scripts/check_go_scope.go \
  services/api/internal/httpapi \
  services/api/cmd/api \
  services/whatsapp-bridge/internal/bridge \
  services/whatsapp-bridge/cmd/bridge \
  services/domain-router/cmd/router

[ -z "$(gofmt -l services/api services/whatsapp-bridge services/domain-router)" ] || fail 'gofmt'
for f in scripts/*.sh; do sh -n "$f"; done
echo 'gofmt: OK'
echo 'Shell syntax: OK'

grep -q 'action == "polls"' services/whatsapp-bridge/internal/bridge/bridge.go || fail 'native poll bridge route'
grep -q 'BuildPollCreation' services/whatsapp-bridge/internal/bridge/bridge.go || fail 'BuildPollCreation'
grep -q 'DecryptPollVote' services/whatsapp-bridge/internal/bridge/bridge.go || fail 'DecryptPollVote'
grep -q 'evaluation_poll' services/api/internal/httpapi/server.go || fail 'evaluation poll outbox'

echo 'PASS: WAMERCIO 2.9.2 release verification'
