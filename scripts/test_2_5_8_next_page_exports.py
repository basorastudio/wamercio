from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
page = root / 'apps/web/app/admin/landing/page.tsx'
text = page.read_text(encoding='utf-8')

# Next.js App Router page modules only allow a constrained set of named exports.
# Regression guard for the production build failure caused by exporting landingDefaults
# directly from a page.tsx module.
invalid = re.findall(r'^export\s+const\s+(landingDefaults)\b', text, flags=re.MULTILINE)
if invalid:
    print('FAIL: invalid Next.js page export(s):', ', '.join(invalid))
    raise SystemExit(1)

print('PASS: Next.js page export regression guard')
