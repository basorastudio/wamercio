from pathlib import Path
root=Path(__file__).resolve().parents[1]
def text(rel): return (root/rel).read_text(encoding='utf-8')

version=text('VERSION').strip()
assert version in {'4.1.6','4.1.7','4.1.8','4.1.9'}
assert f'"version": "{version}"' in text('apps/web/package.json')
assert f'wamercio-store-v{version}' in text('apps/web/public/sw.js')

engine=text('services/whatsapp-bridge/internal/bridge/calls_engine.go')
# Local lifecycle must be released before persistence/network callbacks can block.
for token in [
    'terminalOnce sync.Once',
    'func (m *Manager) finalizeEmbeddedCall',
    'if c.IsEnded() {',
    'm.finalizeEmbeddedCall(s, callID, ac, c, recordID, "ended")',
    'go m.emitCallState(s, &snapshot, recordID, "state")',
    'go m.emitCallState(s, &snapshot, recordID, event)',
    'watchEmbeddedCallSetup',
    'setup timeout; liberando llamada estancada',
    'active_call_snapshots',
]:
    assert token in engine, token
# Browser-leg disconnect cannot masquerade as connected forever.
assert 'ICEConnectionStateDisconnected' in engine

api=text('services/api/internal/httpapi/calls_premium.go')
for token in [
    'func preserveCallProgress',
    'func (s *Server) reconcileCallsWithEngine',
    'active_call_snapshots',
    "metadata=metadata||jsonb_build_object('reconciled','engine_absent')",
    "metadata=metadata||jsonb_build_object('reconciled','engine_snapshot')",
    's.reconcileCallsWithEngine(r.Context(), storeID)',
    's.reconcileCallsWithEngine(r.Context(), in.StoreID)',
    'in.Status = preserveCallProgress(persistedStatus, in.Status)',
]:
    assert token in api, token

media=text('services/whatsapp-bridge/internal/voip/call/callmanager_media.go')
for token in [
    'peer media confirmed active call',
    'TransitionRemoteAccepted',
    'TransitionMediaConnected',
]:
    assert token in media, token

relay=text('services/whatsapp-bridge/internal/voip/call/callmanager_relay.go')
transport=text('services/whatsapp-bridge/internal/voip/transport/sctprelay.go')
for token in ['SetOnDisconnected(fn func())','func (m *CallManager) onRelayDisconnected','relay recovery failed; terminating stale call']:
    assert token in relay, token
assert 'notifyDisconnectedIfEmpty' in transport
assert 'onDisconnected' in transport

webrtc=text('apps/web/lib/calls-webrtc.ts')
for token in ['onUnexpectedClose?: () => void','connectionstatechange',"state === 'disconnected'",'notifyUnexpectedClose']:
    assert token in webrtc, token

soft=text('apps/web/components/calls-softphone.tsx')
for token in ['rowsRef=useRef<any[]>([])','setInterval(()=>setClock(Date.now()),1000)','liveDuration','Se perdió el audio del navegador']:
    assert token in soft, token
# Background polling no longer duplicates settings/status requests every 2.5 seconds.
assert "?api<any[]>(`/calls?store_id=${storeId}`).then(c=>{setRows(c)})" in soft

print('PASS: WAMERCIO 4.1.6 call lifecycle/media recovery regression')
