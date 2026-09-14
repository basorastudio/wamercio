from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
bridge = (root/'services/whatsapp-bridge/internal/bridge/bridge.go').read_text()
api = (root/'services/api/internal/httpapi/server.go').read_text()
settings = (root/'apps/web/app/settings/whatsapp/page.tsx').read_text()
admin_settings = (root/'apps/web/app/admin/settings/page.tsx').read_text()
admin_whatsapp = (root/'apps/web/app/admin/whatsapp/page.tsx').read_text()
verify = (root/'scripts/verify-2.5.8.sh').read_text()
mig = root/'services/api/migrations/000020_whatsapp_direct_chat_hygiene.up.sql'

checks = {
    'bridge rejects non-direct WhatsApp messages before forwarding':
        'isDirectUserMessage' in bridge and re.search(r'func \(m \*Manager\) forwardMessage\([^\)]*\) \{[\s\S]{0,220}isDirectUserMessage\(v\)', bridge) is not None,
    'bridge QR/session state updates are guarded by session identity':
        'setSessionState' in bridge and ('m.setSessionState(s, "timeout", "")' in bridge or 'm.setSessionState(ss, "timeout", "")' in bridge),
    'temporary socket disconnect is represented as reconnecting':
        'case *events.Disconnected:' in bridge and '"reconnecting"' in bridge,
    'bridge status exposes linked separately from connected':
        '"linked": linked' in bridge,
    'API rejects non-direct JIDs before persistence':
        'isDirectWhatsAppJID' in api and re.search(r'if !isDirectWhatsAppJID\(in\.RemoteJID\)', api) is not None,
    'conversation listing applies a direct-JID safety filter':
        "split_part(lower(c.remote_jid),'@',2) IN ('s.whatsapp.net','lid')" in api,
    'migration removes previously imported group/status/channel conversations':
        mig.exists() and 'DELETE FROM conversations' in mig.read_text() and 'DELETE FROM support_whatsapp_conversations' in mig.read_text(),
    'settings UI distinguishes linked from live connected state':
        'const linked=' in settings and 'Vinculado' in settings and 'Reconectando' in settings,
    'support WhatsApp UIs also keep linked sessions distinct from socket state':
        'const waLinked=' in admin_settings and 'const linked=' in admin_whatsapp and 'reconnecting' in admin_whatsapp,
    'verification suite includes WhatsApp hygiene regression':
        'test_2_5_8_whatsapp_session_hygiene.py' in verify,
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    for name in failed:
        print('FAIL:', name)
    raise SystemExit(1)
print('PASS: WAMERCIO 2.5.8 WhatsApp direct-chat/session regressions')
