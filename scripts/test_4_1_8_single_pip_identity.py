from pathlib import Path
root=Path(__file__).resolve().parents[1]
def text(rel): return (root/rel).read_text(encoding='utf-8')

assert text('VERSION').strip()=='4.1.8'
assert '"version": "4.1.8"' in text('apps/web/package.json')
assert 'wamercio-store-v4.1.8' in text('apps/web/public/sw.js')

soft=text('apps/web/components/calls-softphone.tsx')
host=text('apps/web/components/calls-softphone-host.tsx')
shell=text('apps/web/components/store-shell.tsx')
api=text('services/api/internal/httpapi/calls_premium.go')

# One canonical softphone: Document PiP only. Never recreate the in-app clone.
for forbidden in ['const embeddedCss=', 'embeddedContent', 'softphoneSurface(false)', 'h-[min(640px,calc(100dvh-24px))]']:
    assert forbidden not in soft, forbidden
for required in ['const pipCss=`', 'documentPictureInPicture', 'createPortal(<div className="wam-pip">{softphoneSurface()}</div>', 'const softphoneSurface=()=>']:
    assert required in soft, required

# Incoming calls attempt the canonical PiP. If the browser blocks automatic
# opening, only the sidebar attention state is used -- not a second softphone.
for token in ['wamercio:incoming-call-attention','wamercio:call-attention-clear',"Notification.permission==='granted'"]:
    assert token in host, token
for token in ['incomingCall','Llamada entrante','animate-pulse',"incomingCall?(incomingCall.display_name||incomingCall.phone"]:
    assert token in shell, token

# Platform identity wins over WhatsApp push name on inbound calls.
for token in ['func (s *Server) resolveCallIdentity', 'LEFT JOIN customers cu ON cu.id=c.customer_id', 'LEFT JOIN global_customers gc ON gc.id=cu.global_customer_id', "nullif(c.contact_name,'')", "nullif(cu.name,'')", 'resolvedConversationID, resolvedName, resolvedAvatar := s.resolveCallIdentity', 'in.Metadata["avatar_url"] = resolvedAvatar', 'display_name=coalesce(NULLIF($13,\'\'),display_name)']:
    assert token in api, token

# The canonical PiP can render the platform avatar when available.
assert 'currentCall?.metadata?.avatar_url' in soft
print('PASS: WAMERCIO 4.1.8 single PiP + inbound identity regression')
