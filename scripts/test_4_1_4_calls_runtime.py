from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]

def text(rel): return (root/rel).read_text(encoding='utf-8')
def must(rel,*tokens):
    s=text(rel)
    for token in tokens:
        assert token in s, f'{rel}: missing {token}'

assert text('VERSION').strip()=='4.1.4'
assert '"version": "4.1.4"' in text('apps/web/package.json')
assert 'wamercio-store-v4.1.4' in text('apps/web/public/sw.js')

# Launcher is part of the sidebar footer, never a floating overlay.
shell=text('apps/web/components/store-shell.tsx')
assert 'fixed bottom-[82px]' not in shell
assert 'title="Abrir softphone"' in shell
button=shell.index('title="Abrir softphone"')
user_card=shell.index("<div className={`bg-[#fafbfe]",button)
assert button < user_card, 'softphone launcher must be immediately above the account card'

# A single root-level host owns Calls state across route changes.
layout=text('apps/web/app/layout.tsx')
assert '<CallsSoftphoneHost/>' in layout
for rel in ['apps/web/app/conversations/page.tsx','apps/web/app/customers/page.tsx']:
    s=text(rel)
    assert 'CallsSoftphone' not in s, f'{rel}: screen-local softphone reintroduced'
    assert 'wamercio:open-softphone' in s
host=text('apps/web/components/calls-softphone-host.tsx')
for token in ['dismissedKey','localStorage.getItem(dismissedKey(id))','localStorage.setItem(dismissedKey(incomingCallId)','wamercio:incoming-call',"window.addEventListener('storage',onStorage)"]:
    assert token in host, token

soft=text('apps/web/components/calls-softphone.tsx')
for token in ['pipOpening','dialingRef','Preparando llamada…','callStatusText','Timbrando','Conectando','store_id:storeId']:
    assert token in soft, token
assert 'open={open&&!pipWindow&&!pipOpening}' in soft

# Calls use dedicated time budgets; the generic 12-second bridge timeout must
# not be allowed to cancel WhatsApp LID/encryption/signaling work.
calls=text('services/api/internal/httpapi/calls_premium.go')
for token in [
    'bridgeReqWithTimeout(r.Context(), http.MethodPost, "/calls", payload, 40*time.Second)',
    '"/"+action, map[string]any{"store_id": storeID, "assigned_staff_id": in.AssignedStaffID}, 30*time.Second)',
    '"/webrtc", map[string]any{"store_id": storeID, "sdp_offer": in.SDPOffer}, 15*time.Second)',
    "status='missed'",
    "status='failed'",
    'publishStoreEvent',
]:
    assert token in calls, token
server=text('services/api/internal/httpapi/server.go')
assert 'func (s *Server) bridgeReqWithTimeout' in server
assert 'context.WithTimeout(ctx, timeout)' in server

# The persisted status is updated from the engine response immediately, so a
# successfully answered call cannot remain visually stuck on ringing if the
# asynchronous event is delayed.
assert 'status := strings.TrimSpace(flowString(response["status"]))' in calls
assert 'UPDATE whatsapp_calls SET status=$1' in calls

# AcceptCall must only transition locally after BuildAccept + SendNode succeed.
manager=text('services/whatsapp-bridge/internal/voip/call/callmanager.go')
accept=re.search(r'func \(m \*CallManager\) AcceptCall\(.*?\n}\n\nfunc \(m \*CallManager\) setupIncomingMedia',manager,re.S)
assert accept, 'AcceptCall block not found'
a=accept.group(0)
for token in ['incoming call encryption key is unavailable','signaling.BuildAcceptStanza','m.sock.SendNode','TransitionLocalAccepted']:
    assert token in a, token
assert a.index('signaling.BuildAcceptStanza') < a.index('TransitionLocalAccepted')
assert a.index('m.sock.SendNode') < a.index('TransitionLocalAccepted')
engine=text('services/whatsapp-bridge/internal/bridge/calls_engine.go')
assert 'context.WithTimeout(r.Context(), 25*time.Second)' in engine

# External adapter dependency stays gone.
for rel in ['.env.example','docker-compose.yml','services/api/internal/httpapi/calls_premium.go','apps/web/components/calls-softphone.tsx']:
    s=text(rel)
    assert 'CALLS_ADAPTER_URL' not in s
    assert 'CALLS_ADAPTER_SECRET' not in s

print('PASS: WAMERCIO 4.1.4 Calls runtime/UX regression')
