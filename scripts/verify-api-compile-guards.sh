#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }
SERVER=services/api/internal/httpapi/server.go
[ -f "$SERVER" ] || fail "missing $SERVER"
block=$(awk '/func \(s \*Server\) requestSubscription\(/,/^func \(s \*Server\) adminDashboard\(/' "$SERVER")
if printf '%s\n' "$block" | grep -q 'ownerExists'; then
  fail 'requestSubscription contains redundant ownerExists guard; requireStoreAuth already enforces owner role'
fi
python - "$SERVER" <<'PY'
import re,sys
src=open(sys.argv[1],encoding='utf-8').read()
m=re.search(r'func \(s \*Server\) requestSubscription\(.*?\n}\n\nfunc \(s \*Server\) adminDashboard',src,re.S)
if not m:
    raise SystemExit('FAIL: requestSubscription block not found')
block=m.group(0)
decl=block.find('var id string')
if decl < 0:
    raise SystemExit('FAIL: requestSubscription id declaration not found')
pre=block[:decl]
if re.search(r'\bid\b', pre.replace('PlanID','').replace('plan_id','')):
    # Restrict to function-local use patterns that could bind to the response id.
    bad=[line for line in pre.splitlines() if re.search(r'[,($ ]id[), ]', line)]
    if bad:
        raise SystemExit('FAIL: requestSubscription uses id before declaration: '+bad[-1].strip())
print('PASS: requestSubscription local id ordering')
PY
echo 'PASS: API compile guards'
