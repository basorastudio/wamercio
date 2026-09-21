from pathlib import Path

root = Path(__file__).resolve().parents[1]
text = (root / 'apps/web/components/storefront.tsx').read_text(encoding='utf-8')

assert 'type LoyaltyState=' in text, 'storefront loyalty state must have an explicit type'
assert 'useState<LoyaltyState|null>(null)' in text, 'loyalty useState must not use any because functional setters lose contextual typing'
assert 'setLoyalty((current:LoyaltyState|null)=>' in text or 'setLoyalty((current: LoyaltyState | null) =>' in text, 'loyalty functional setter must be explicitly typed'
print('PASS: WAMERCIO 2.8.2 storefront loyalty type guard')
