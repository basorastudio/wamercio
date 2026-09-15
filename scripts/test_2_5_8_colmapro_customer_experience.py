from pathlib import Path

root=Path(__file__).resolve().parents[1]
storefront=(root/'apps/web/components/storefront.tsx').read_text()
mobile=(root/'apps/web/components/storefront-mobile-nav.tsx').read_text()
shell=(root/'apps/web/components/customer-shell.tsx').read_text()
server=(root/'services/api/internal/httpapi/server.go').read_text()
orders=(root/'apps/web/app/orders/page.tsx').read_text()
tracking=(root/'apps/web/app/order/[token]/page.tsx').read_text()
delivery=(root/'apps/web/app/delivery/page.tsx').read_text()
types=(root/'apps/web/lib/types.ts').read_text()
up=root/'services/api/migrations/000024_cash_change_checkout.up.sql'
down=root/'services/api/migrations/000024_cash_change_checkout.down.sql'

checks={
 'cash change question': '¿Necesita cambio?' in storefront,
 'cash tendered field': 'cash_tendered' in storefront,
 'change requested field': 'needs_change' in storefront,
 'estimated change UX': 'Vuelto estimado' in storefront,
 'other amount UX': 'Otro' in storefront,
 'api cash change input': 'CashTendered' in server and 'NeedsChange' in server,
 'api persists change data': 'cash_change_requested' in server and 'cash_tendered' in server,
 'order admin exposes change data': 'cash_change_requested' in orders and 'cash_tendered' in orders,
 'tracking exposes change data': 'cash_change_requested' in tracking and 'cash_tendered' in tracking,
 'delivery operations expose change data': 'cash_change_requested' in delivery and 'cash_tendered' in delivery,
 'order list type exposes change data': 'cash_change_requested' in types and 'cash_tendered' in types,
 'migration up exists': up.exists(),
 'migration down exists': down.exists(),
 'storefront colmapro nav': all(x in mobile for x in ('Catálogo','Mi compra','Pedidos','WhatsApp')),
 'customer shell colmapro nav': all(x in shell for x in ('Catálogo','Mi compra','Pedidos','WhatsApp')),
}
if up.exists():
    txt=up.read_text().lower()
    checks['migration columns']= 'cash_change_requested' in txt and 'cash_tendered' in txt

bad=[k for k,v in checks.items() if not v]
if bad:
    print('FAIL:', ', '.join(bad))
    raise SystemExit(1)
print('PASS: ColmaPro-inspired customer experience and cash-change regressions')
