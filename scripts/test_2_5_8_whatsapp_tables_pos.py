from pathlib import Path

root = Path(__file__).resolve().parents[1]
read = lambda p: (root/p).read_text(encoding='utf-8')

whatsapp_ui = read('apps/web/app/settings/whatsapp/page.tsx')
bridge = read('services/whatsapp-bridge/internal/bridge/bridge.go')
api = read('services/api/internal/httpapi/server.go')
store_settings = read('apps/web/app/settings/store/page.tsx')
storefront = read('apps/web/components/storefront.tsx')
pos = read('apps/web/app/pos/page.tsx')
orders = read('apps/web/app/orders/page.tsx')
types = read('apps/web/lib/types.ts')
verify = read('scripts/verify-2.5.8.sh')
up = root/'services/api/migrations/000025_whatsapp_sync_tables_pos.up.sql'
down = root/'services/api/migrations/000025_whatsapp_sync_tables_pos.down.sql'

checks = [
    # WhatsApp sync controls / history protection
    ('WhatsApp sync UI mode', 'Sincronización de mensajes' in whatsapp_ui and 'Manual' in whatsapp_ui and 'Automática' in whatsapp_ui),
    ('WhatsApp sync date range', 'Fecha desde' in whatsapp_ui and 'Fecha hasta' in whatsapp_ui),
    ('WhatsApp manual sync action', 'Sincronizar ahora' in whatsapp_ui and '/sync' in whatsapp_ui),
    ('WhatsApp sync settings API', 'whatsappSyncSettings' in api and 'updateWhatsappSyncSettings' in api and 'whatsappSyncNow' in api),
    ('Bridge manual history endpoint', 'history-sync' in bridge and 'manualHistorySync' in bridge),
    ('Bridge history filtering', 'historySyncPolicy' in bridge and 'historyMessageAllowed' in bridge),
    ('Bridge on-demand history requests', 'BuildHistorySyncRequest' in bridge and 'SendPeerMessage' in bridge),
    ('Full sync disabled by default', 'RequireFullSync = proto.Bool(false)' in bridge),

    # Tables / dine-in reservations
    ('Migration up exists', up.exists()),
    ('Migration down exists', down.exists()),
    ('Tables settings toggle', 'Mesas y reservas' in store_settings and 'dine_in_enabled' in store_settings),
    ('Tables management UI', 'Administrar mesas' in store_settings and '/tables' in store_settings),
    ('Tables API routes', 'listStoreTables' in api and 'createStoreTable' in api and 'updateStoreTable' in api and 'deleteStoreTable' in api),
    ('Storefront dine-in mode', "delivery_type:'dine_in'" in storefront and 'Reservar mesa' in storefront),
    ('Storefront reservation fields', 'reservation_at' in storefront and 'party_size' in storefront and 'table_id' in storefront),
    ('Checkout validates dine-in', 'dine_in_enabled' in api and 'table_id' in api and 'reservation_at' in api),
    ('Orders expose table reservation', 'Mesa' in orders and 'reservation_at' in orders),
    ('Order type includes dine-in', "'dine_in'" in types),

    # POS rich product/customer flow
    ('POS uses image cards', 'image_url' in pos and 'description' in pos and 'Abrir producto' in pos),
    ('POS product options modal', 'Opciones' in pos and 'Adicionales' in pos and 'pos-product-modal' in pos),
    ('POS variant/extras payload', 'variant_name' in pos and 'extras' in pos),
    ('POS customer search', 'Buscar cliente' in pos and '/customers?store_id=' in pos and 'selectedCustomer' in pos),
    ('POS backend validates options', 'VariantName' in api and 'Extras' in api and 'createPOSSale' in api),
    ('Verification hook', 'test_2_5_8_whatsapp_tables_pos.py' in verify),
]

failed = [name for name, ok in checks if not ok]
if failed:
    print('FAIL: WhatsApp sync, tables/reservations and POS regressions')
    for name in failed:
        print(' -', name)
    raise SystemExit(1)
print('PASS: WhatsApp sync, tables/reservations and POS regressions')
