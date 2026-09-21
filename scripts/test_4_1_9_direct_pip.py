from pathlib import Path
root=Path(__file__).resolve().parents[1]
def text(rel): return (root/rel).read_text(encoding='utf-8')

assert text('VERSION').strip()=='4.1.9'
assert '"version": "4.1.9"' in text('apps/web/package.json')
assert 'wamercio-store-v4.1.9' in text('apps/web/public/sw.js')

soft=text('apps/web/components/calls-softphone.tsx')
host=text('apps/web/components/calls-softphone-host.tsx')
shell=text('apps/web/components/store-shell.tsx')
api=text('services/api/internal/httpapi/calls_premium.go')

# The original complete PiP remains the only softphone surface.
for required in [
    'const pipCss=`',
    '.wam-tabs{',
    '.wam-dir{',
    '.wam-keypad-panel{',
    '.wam-contact{',
    '.wam-controls{',
    'createPortal(<div className="wam-pip">{softphoneSurface()}</div>',
    'const softphoneSurface=()=>',
]:
    assert required in soft, required
for forbidden in ['embeddedContent','softphoneSurface(false)','const embeddedCss=']:
    assert forbidden not in soft, forbidden

# Sidebar is permanently a launcher, never an alternate incoming-call UI.
for forbidden in ['incoming-call-attention','call-attention-clear','incomingCall','Abrir llamada entrante','Llamada entrante</span>','animate-pulse bg-emerald-500']:
    assert forbidden not in shell, forbidden
for required in ['title="Abrir softphone"','Abrir softphone</span>','Llamadas WhatsApp</span>']:
    assert required in shell, required

# Incoming call always targets the canonical PiP. If Chromium blocks creation
# without user activation, the next real interaction opens the exact same PiP.
for required in [
    'const openCanonicalPip=async()=>',
    'void openCanonicalPip().then(opened=>',
    "window.addEventListener('pointerdown',resumePending,true)",
    "window.addEventListener('keydown',resumePending,true)",
    'pendingIncomingRef.current=incoming',
    'manager.window as Window|undefined',
    'Notification.permission===\'granted\'',
]:
    assert required in host or required in soft, required
for forbidden in ['wamercio:incoming-call-attention','wamercio:call-attention-clear']:
    assert forbidden not in host, forbidden

# Identity resolution from WAMERCIO remains in place for inbound calls.
for token in ['func (s *Server) resolveCallIdentity', 'LEFT JOIN customers cu ON cu.id=c.customer_id', 'LEFT JOIN global_customers gc ON gc.id=cu.global_customer_id', 'resolvedConversationID, resolvedName, resolvedAvatar := s.resolveCallIdentity']:
    assert token in api, token
assert 'avatar_url:currentCall.avatar_url||currentCall.profile_picture_url||\'\'' in soft

print('PASS: WAMERCIO 4.1.9 direct canonical PiP regression')
