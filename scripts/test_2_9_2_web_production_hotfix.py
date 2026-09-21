from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
shell = (root / 'apps/web/components/store-shell.tsx').read_text(encoding='utf-8')
payments = (root / 'apps/web/app/payment-methods/page.tsx').read_text(encoding='utf-8')

# lucide-react 0.468.0 used by WAMERCIO doesn't export MessageSquareStar.
assert 'MessageSquareStar' not in shell, 'unsupported lucide icon MessageSquareStar must not be imported/used'
assert "label:'Evaluaciones',icon:MessageCircleMore" in shell, 'Evaluaciones must use the supported MessageCircleMore icon'

# Fulfillment keys must remain typed so Rules can be indexed safely under strict TypeScript.
assert 'const fulfillments:FulfillmentOption[]=' in payments, 'fulfillments must keep an explicit typed array'
assert 'as any[]' not in payments, 'payment method fulfillment flow must not erase its key type with any[]'
assert re.search(r"type FulfillmentOption=\{key:Fulfillment;label:string;icon:", payments), 'missing typed fulfillment option'
assert 'const fulfillments:FulfillmentOption[]=' in payments, 'fulfillments must have an explicit local type independent of hook inference'
assert 'const globals:Record<PaymentMethod,boolean>=' in payments, 'globals must preserve PaymentMethod keys'

print('PASS: WAMERCIO 2.9.2 web production hotfix contract')
