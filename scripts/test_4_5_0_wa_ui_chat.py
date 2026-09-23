from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
merchant=(root/'apps/web/app/conversations/page.tsx').read_text()
admin=(root/'apps/web/app/admin/whatsapp/page.tsx').read_text()
wa=(root/'apps/web/components/whatsapp-ui/wa-ui.tsx').read_text()
msg=(root/'apps/web/components/whatsapp-message-content.tsx').read_text()
css=(root/'apps/web/app/globals.css').read_text()
pkg=json.loads((root/'apps/web/package.json').read_text())
checks={
 'version':pkg['version']=='4.5.0' and (root/'VERSION').read_text().strip()=='4.5.0',
 'merchant_scope':'wamercio-wa-ui' in merchant,
 'admin_scope':'wamercio-wa-ui' in admin,
 'merchant_shared_timeline':'WaConversationTimeline' in merchant and 'WaChatListItem' in merchant and 'WaChatHeader' in merchant,
 'admin_shared_timeline':'WaConversationTimeline' in admin and 'WaChatListItem' in admin and 'WaChatHeader' in admin,
 'shared_components':all(x in wa for x in ['WaMessageBubble','WaMessageStatusIcon','WaComposerInput','WaSidebarSearch','WaDateSeparator']),
 'message_types':all(x in msg for x in ['VoicePlayer','InteractiveCard','location','sticker','poll','reaction','product']),
 'scoped_tokens':'.wamercio-wa-ui' in css and '--wa-bubble-outgoing' in css and '.wa-wallpaper' in css,
 'wallpaper':(root/'apps/web/public/wamercio-chat-pattern.svg').exists(),
 'license':(root/'apps/web/components/whatsapp-ui/WA-UI-LICENSE.txt').exists() and 'MIT License' in (root/'apps/web/components/whatsapp-ui/WA-UI-LICENSE.txt').read_text(),
 'notice':(root/'THIRD_PARTY_NOTICES.md').exists(),
 'pwa':'wamercio-store-v4.5.0' in (root/'apps/web/public/sw.js').read_text(),
}
for k,v in checks.items(): print(f"{'OK' if v else 'FAIL'} {k}")
if not all(checks.values()): raise SystemExit(1)
