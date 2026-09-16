from pathlib import Path
import re, sys
root = Path(__file__).resolve().parents[1]
httpapi = root / 'services/api/internal/httpapi'
funcs = {}
for p in httpapi.glob('*.go'):
    text = p.read_text(encoding='utf-8')
    for m in re.finditer(r'^func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(', text, re.M):
        name = m.group(1)
        funcs.setdefault(name, []).append(p.name)
dupes = {k:v for k,v in funcs.items() if len(v)>1}
if dupes:
    print('duplicate package-level functions:', dupes)
    sys.exit(1)
print('PASS: no duplicate package-level httpapi function names')
