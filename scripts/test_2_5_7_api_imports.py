from pathlib import Path
import re
p = Path(__file__).resolve().parents[1] / 'services/api/internal/httpapi/server.go'
s = p.read_text(encoding='utf-8')
assert 'strconv.' in s, 'fixture changed: server.go no longer uses strconv'
m = re.search(r'import\s*\((.*?)\n\)', s, re.S)
assert m, 'import block not found'
imports = m.group(1)
assert re.search(r'^\s*"strconv"\s*$', imports, re.M), 'server.go uses strconv but does not import "strconv"'
print('PASS: server.go imports strconv when strconv is used')
