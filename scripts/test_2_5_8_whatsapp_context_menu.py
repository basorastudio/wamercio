from pathlib import Path
root=Path(__file__).resolve().parents[1]
ui=(root/'apps/web/app/conversations/page.tsx').read_text(encoding='utf-8')
shell=(root/'apps/web/components/store-shell.tsx').read_text(encoding='utf-8')
api=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
verify=(root/'scripts/verify-2.5.8.sh').read_text(encoding='utf-8')
checks=[
 ('WhatsApp page hides generic top header', 'hideHeader' in ui and 'hideHeader=false' in shell),
 ('WhatsApp chat contextual menu exists', 'chat-context-menu' in ui and 'MoreVertical' in ui),
 ('Delete chat action exists', 'Eliminar chat' in ui and 'deleteConversation' in ui),
 ('Clear chat action exists', 'Vaciar chat' in ui and 'clearConversation' in ui),
 ('Export chat action exists', 'Exportar chat' in ui and 'exportConversation' in ui),
 ('Close chat action exists', 'Cerrar chat' in ui and 'closeConversation' in ui),
 ('Block chat action exists', 'Bloquear' in ui and 'blockConversation' in ui),
 ('Conversation delete API route', 'p.Delete("/conversations/{id}"' in api and 'deleteConversation' in api),
 ('Conversation clear API route', 'p.Delete("/conversations/{id}/messages"' in api and 'clearConversationMessages' in api),
 ('Blocked inbound conversations are ignored', 'contact_status' in api and 'blocked' in api and 'ignored' in api),
 ('WhatsApp menu regression hook', 'test_2_5_8_whatsapp_context_menu.py' in verify),
]
failed=[n for n,ok in checks if not ok]
if failed:
 print('FAIL: WhatsApp contextual chat menu regressions')
 for n in failed: print(' -',n)
 raise SystemExit(1)
print('PASS: WhatsApp contextual chat menu regressions')
