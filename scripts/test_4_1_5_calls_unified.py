from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
def text(rel): return (root/rel).read_text(encoding='utf-8')

assert text('VERSION').strip()=='4.1.5'
assert '"version": "4.1.5"' in text('apps/web/package.json')
assert 'wamercio-store-v4.1.5' in text('apps/web/public/sw.js')

soft=text('apps/web/components/calls-softphone.tsx')
# Runtime UI is one softphone surface: no generic white Modal for the call UI.
assert '<Modal open={open&&!pipWindow&&!pipOpening}' not in soft
assert 'const embeddedContent=open&&(!pipWindow||pipWindow.closed)&&!pipOpening' in soft
assert 'wam-card' in soft and 'wam-head' in soft and 'wam-tabs' in soft
assert "currentCall?activeControls(true,false)" in soft
assert "currentCall?activeControls(true,true)" in soft
# Incoming ringing may only be answered/rejected; WebRTC is attached after accept.
assert "currentCall.direction==='out'&&currentCall.status==='ringing'" in soft
assert "currentCall.direction==='in'&&currentCall.status==='ringing'" in soft
# Hangup returns cleanly to dialer state.
for token in ["fallbackStatus=a==='hangup'?'completed':a==='reject'?'rejected':''","setTab('directory')","previousCallId.current", "setError('')"]:
    assert token in soft, token

calls=text('services/api/internal/httpapi/calls_premium.go')
# Outgoing preparation must use an explicitly typed JSON parameter and optional
# relations must not be in the critical insert.
assert "jsonb_build_object('requested_by',$5::text)" in calls
critical=re.search(r'INSERT INTO whatsapp_calls\(store_id,remote_jid,phone,display_name,direction,status,metadata\).*?RETURNING id::text',calls,re.S)
assert critical, 'critical outgoing insert not found'
assert 'conversation_id' not in critical.group(0)
assert 'assigned_staff_id' not in critical.group(0)
assert 'UPDATE whatsapp_calls SET conversation_id=$1::uuid' in calls
assert 'UPDATE whatsapp_calls SET assigned_staff_id=$1::uuid' in calls
assert 'bridgeReqWithTimeout(r.Context(), http.MethodPost, "/calls", payload, 65*time.Second)' in calls
# Late bridge events cannot resurrect terminal calls.
for token in ['persistedTerminal','incomingTerminal','if persistedTerminal && !incomingTerminal','in.Status = persistedStatus']:
    assert token in calls, token
# Local hangup/reject remains terminal even with a lost bridge response.
for token in ['action == "hangup" || action == "reject"','control_warning','action+"_local"']:
    assert token in calls, token

engine=text('services/whatsapp-bridge/internal/bridge/calls_engine.go')
assert 'context.WithTimeout(r.Context(), 55*time.Second)' in engine
assert 'if action == "hangup"' in engine and '"idempotent": true' in engine
assert 'if action == "reject"' in engine

# Launcher remains in sidebar, above the account card.
shell=text('apps/web/components/store-shell.tsx')
assert 'fixed bottom-[82px]' not in shell
button=shell.index('title="Abrir softphone"')
user_card=shell.index("<div className={`bg-[#fafbfe]",button)
assert button < user_card

print('PASS: WAMERCIO 4.1.5 unified softphone/outgoing-call regression')
