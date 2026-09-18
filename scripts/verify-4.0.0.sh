#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }
[ "$(cat VERSION)" = "4.0.0" ] || fail VERSION
grep -q '"version": "4.0.0"' apps/web/package.json || fail 'web version'
grep -q 'wamercio-store-v4.0.0' apps/web/public/sw.js || fail 'PWA cache'
python3 scripts/test_4_0_0_platform_expansion.py
python3 scripts/test_3_0_0_conversation_center_pro.py

python3 - <<'PY'
from pathlib import Path
import json, re
root=Path('.')
m=root/'services/api/migrations'
ups={p.name[:-7] for p in m.glob('*.up.sql')}; downs={p.name[:-9] for p in m.glob('*.down.sql')}
assert ups==downs, f'migration mismatch up-only={sorted(ups-downs)} down-only={sorted(downs-ups)}'
for n in ['000042_quotes_pro','000043_delivery_pro','000044_crm_operations','000045_flow_builder','000046_voice_transcription','000047_calls_premium']:
    assert (m/(n+'.up.sql')).exists() and (m/(n+'.down.sql')).exists(),n
# Every registered s.handler in server.go must exist as a method somewhere in the package.
server=(root/'services/api/internal/httpapi/server.go').read_text()
registered=set(re.findall(r'\bs\.([A-Za-z_][A-Za-z0-9_]*)\)',server))
methods=set()
for p in (root/'services/api/internal/httpapi').glob('*.go'):
    methods.update(re.findall(r'func \(s \*Server\) ([A-Za-z_][A-Za-z0-9_]*)\(',p.read_text()))
missing=sorted(registered-methods)
assert not missing, f'missing route handlers: {missing}'
for p in root.rglob('*.json'):
    if 'node_modules' not in p.parts: json.loads(p.read_text())
print(f'Migration pairs: {len(ups)}/{len(downs)}')
print(f'HTTP handlers: {len(registered)} registered, 0 missing')
print('JSON: OK')
PY

node - <<'JS'
const fs=require('fs'),path=require('path'),ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
let count=0,bad=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='node_modules'||e.name==='.next')continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(e.name)){count++;const sf=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true,e.name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);for(const x of sf.parseDiagnostics){const lc=sf.getLineAndCharacterOfPosition(x.start||0);bad.push(`${p}:${lc.line+1}:${lc.character+1} TS${x.code} ${ts.flattenDiagnosticMessageText(x.messageText,' ')}`)}}}}walk('apps/web');console.log(`TypeScript syntax: ${count} files, ${bad.length} errors`);if(bad.length){console.error(bad.join('\n'));process.exit(1)}
JS

cat >/tmp/wamercio_parse_go.go <<'GO'
package main
import("fmt";"go/parser";"go/token";"os";"path/filepath";"strings")
func main(){bad,count:=0,0;filepath.Walk(".",func(path string,info os.FileInfo,err error)error{if err!=nil{return err};if info.IsDir(){if info.Name()=="vendor"||info.Name()=="node_modules"{return filepath.SkipDir};return nil};if strings.HasSuffix(path,".go"){count++;if _,e:=parser.ParseFile(token.NewFileSet(),path,nil,parser.AllErrors);e!=nil{fmt.Printf("GO PARSE ERROR %s: %v\n",path,e);bad++}};return nil});fmt.Printf("Go syntax: %d files, %d errors\n",count,bad);if bad>0{os.Exit(1)}}
GO
go run /tmp/wamercio_parse_go.go
rm -f /tmp/wamercio_parse_go.go

[ -z "$(gofmt -l services/api services/whatsapp-bridge services/domain-router)" ] || fail gofmt
for f in scripts/*.sh; do sh -n "$f"; done

echo 'gofmt: OK'
echo 'Shell syntax: OK'
echo 'PASS: WAMERCIO 4.0.0 release verification'
