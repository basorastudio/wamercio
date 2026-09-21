from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
quote = (root / 'apps/web/app/quote/[token]/page.tsx').read_text(encoding='utf-8')

assert "useEffect(()=>{void load()},[token])" in quote, 'quote portal must not pass Promise-returning load directly to useEffect'
assert 'useEffect(load,[token])' not in quote, 'regression: Promise-returning EffectCallback in quote portal'

# Guard the common production-build regression: a load function defined as an expression
# returning api(...)/Promise and then passed directly to useEffect(load,...).
for p in (root / 'apps/web').rglob('*.tsx'):
    if 'node_modules' in p.parts or '.next' in p.parts:
        continue
    text = p.read_text(encoding='utf-8')
    direct_promise_load = re.search(r"const\s+load\s*=\s*\([^)]*\)\s*=>\s*(?:api|fetch)\s*\(", text)
    direct_effect = re.search(r"useEffect\(\s*load\s*,", text)
    if direct_promise_load and direct_effect:
        raise AssertionError(f'{p}: Promise-returning load passed directly to useEffect')

assert (root/'VERSION').read_text().strip() == '4.0.1'
assert '"version": "4.0.1"' in (root/'apps/web/package.json').read_text()
assert 'wamercio-store-v4.0.1' in (root/'apps/web/public/sw.js').read_text()
print('PASS: WAMERCIO 4.0.1 web production-build hotfix')
