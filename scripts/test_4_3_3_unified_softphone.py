from pathlib import Path
root=Path(__file__).resolve().parents[1]

def text(rel): return (root/rel).read_text(encoding='utf-8')
def must(rel,*tokens):
    s=text(rel)
    for token in tokens:
        assert token in s, f'{rel}: missing {token}'

assert text('VERSION').strip()=='4.3.3'
assert '"version": "4.3.3"' in text('apps/web/package.json')
assert 'wamercio-store-v4.3.3' in text('apps/web/public/sw.js')

soft=text('apps/web/components/calls-softphone.tsx')
for token in [
    "scope?:'merchant'|'superadmin'",
    "scope==='superadmin'",
    '/admin/whatsapp/calls/status',
    '/admin/whatsapp/call-directory',
    '/admin/whatsapp/calls',
    'Activar y llamar',
    'wamercio:incoming-admin-call',
    'WAMERCIO_WEBRTC_EXTERNAL_IP',
]:
    assert token in soft, token

admin_soft=text('apps/web/components/superadmin-support-softphone.tsx')
assert "import CallsSoftphone" in admin_soft
assert 'scope="superadmin"' in admin_soft
assert 'wamercio:incoming-admin-call' in admin_soft
assert 'sap-card' not in admin_soft and 'sap-wrap' not in admin_soft

server=text('services/api/internal/httpapi/server.go')
for token in [
    '/admin/whatsapp/call-directory',
    'adminWhatsAppCallDirectory',
    "coalesce(nullif(st.commercial_name,''),st.name)",
    "coalesce(st.logo_url,'')",
    '"Negocio · "',
]:
    assert token in server, token

calls=text('services/api/internal/httpapi/calls_premium.go')
assert 'ON CONFLICT(store_id) DO UPDATE SET is_active=true' in calls
assert 'Pressing Llamar is an explicit operator intent' in calls

engine=text('services/whatsapp-bridge/internal/bridge/calls_engine.go')
assert 'errors.Is(err, sql.ErrNoRows)' in engine
assert 'callEngineSettings{Enabled: true, Ring: 30}' in engine

migration=text('services/api/migrations/000049_unified_softphone_calls.up.sql')
assert 'ALTER COLUMN is_active SET DEFAULT true' in migration
assert 'UPDATE store_call_settings' in migration and 'is_active = true' in migration

profile_calls=text('services/api/internal/httpapi/superadmin_profile_calls.go')
assert "FROM stores st" in profile_calls
assert "regexp_replace(coalesce(st.whatsapp,'')" in profile_calls

calls_page=text('apps/web/app/calls/page.tsx')
assert "settings&&!settings.is_active?'Activar y llamar':'Llamar'" in calls_page
assert '!settings?.engine_ready' in calls_page

print('PASS: WAMERCIO 4.3.3 unified softphone + outbound/inbound calls regression')
