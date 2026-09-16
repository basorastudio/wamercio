from pathlib import Path

root=Path(__file__).resolve().parents[1]
server=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
phase2=(root/'services/api/internal/httpapi/catalog_composition.go')
auto=(root/'services/api/internal/httpapi/commerce_automations.go')
mig=root/'services/api/migrations/000032_phase2_operations.up.sql'
nav=(root/'apps/web/components/store-shell.tsx').read_text(encoding='utf-8')
products=(root/'apps/web/app/catalog/products/page.tsx').read_text(encoding='utf-8')
analytics=(root/'apps/web/app/analytics/page.tsx').read_text(encoding='utf-8')

assert mig.exists(), 'missing phase2 migration'
sql=mig.read_text(encoding='utf-8')
for table in ['modifier_groups','modifier_options','product_modifier_groups','bundle_components','allergens','product_allergens','product_dietary_tags','automation_rules','automation_runs']:
    assert f'CREATE TABLE IF NOT EXISTS {table}' in sql, table

assert phase2.exists(), 'missing catalog_composition.go'
phase2_text=phase2.read_text(encoding='utf-8')
for handler in ['listModifierGroups','createModifierGroup','updateModifierGroup','deleteModifierGroup','getProductComposition','updateProductComposition','listAllergens','createAllergen','updateAllergen','deleteAllergen']:
    assert f'func (s *Server) {handler}' in phase2_text, handler
for route in ['/modifier-groups','/products/{id}/composition','/allergens']:
    assert route in server, route
assert 'ModifierOptionIDs' in server or 'modifier_option_ids' in server, 'checkout modifier selection support missing'
assert 'bundle_components' in server or 'bundle_components' in phase2_text, 'bundle resolver missing'

assert auto.exists(), 'missing commerce_automations.go'
auto_text=auto.read_text(encoding='utf-8')
for event in ['promotion_started','reservation_created','reservation_reminder','order_confirmed','order_ready','order_completed','review_request']:
    assert event in auto_text, event
for handler in ['listAutomationRules','createAutomationRule','updateAutomationRule','deleteAutomationRule','listAutomationRuns']:
    assert f'func (s *Server) {handler}' in auto_text, handler
assert '/automations' in server

assert (root/'apps/web/app/product-attributes/page.tsx').exists(), 'missing product attributes page'
assert (root/'apps/web/app/automations/page.tsx').exists(), 'missing automations page'
assert 'Modificadores' in products or 'modificadores' in products, 'product modifier UI missing'
assert 'Combos' in products or 'combo' in products.lower(), 'bundle UI missing'
assert 'Automatizaciones' in nav, 'automation nav missing'
assert 'Atributos' in nav or 'Alérgenos' in nav, 'attribute nav missing'
for key in ['repeat_customer_rate','cancellation_rate','source_breakdown','promotion_conversion','previous_period']:
    assert key in (root/'services/api/internal/httpapi/phase1_commerce.go').read_text(encoding='utf-8'), key
    assert key in analytics, f'analytics UI missing {key}'
print('PASS: WAMERCIO 2.7.0 phase 2 feature contract')
