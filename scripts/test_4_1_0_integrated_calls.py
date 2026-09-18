from pathlib import Path
root=Path(__file__).resolve().parents[1]

def text(rel):
    return (root/rel).read_text(encoding='utf-8')

def must(rel,*tokens):
    s=text(rel)
    for token in tokens:
        assert token in s, f'{rel}: missing {token}'

assert text('VERSION').strip()=='4.1.0'
assert '"version": "4.1.0"' in text('apps/web/package.json')
assert 'wamercio-store-v4.1.0' in text('apps/web/public/sw.js')

# External call engine dependency must be gone from active deployment/configuration.
for rel in [
    '.env.example','docker-compose.yml',
    'services/api/internal/config/config.go','services/api/internal/httpapi/calls_premium.go',
]:
    s=text(rel)
    assert 'CALLS_ADAPTER_URL' not in s, f'{rel}: still depends on CALLS_ADAPTER_URL'
    assert 'CALLS_ADAPTER_SECRET' not in s, f'{rel}: still depends on CALLS_ADAPTER_SECRET'

must('services/whatsapp-bridge/go.mod','github.com/pion/webrtc/v4 v4.2.15','github.com/rs/zerolog v1.35.1')
must('services/whatsapp-bridge/internal/bridge/bridge.go',
     'events.CallOffer','events.CallAccept','events.CallPreAccept','events.CallTransport','events.CallTerminate','events.CallReject',
     'mux.HandleFunc("/calls", m.handleCallsEngine)')
must('services/whatsapp-bridge/internal/bridge/calls_engine.go',
     'signaling.GenerateCallID()','newBrowserCallBridge','SetEphemeralUDPPortRange','SetNAT1To1IPs',
     'StartCall','AcceptCall','RejectCall','EndCall','Hold()','Resume()','wamercio_embedded',
     'emitCallRecording','newCallRecorder')
must('services/whatsapp-bridge/internal/bridge/calls_recording.go',
     'callRecordingSampleRate = 16000','Stereo 16-bit PCM','writePCM16WAVHeader','/media/calls/')
must('services/whatsapp-bridge/internal/wacall/socket.go',
     'DangerousInternals','EncryptMessageForDevices','DecryptDM','ResolveLIDForPN','GetOwnLID','WaitResponse')
must('services/whatsapp-bridge/internal/voip/signaling/callkey.go','func GenerateCallID() string')
must('services/whatsapp-bridge/internal/voip/call/hold.go','func (m *CallManager) Hold() error','func (m *CallManager) Resume() error')

must('services/api/internal/httpapi/calls_premium.go',
     'engine_embedded','s.bridgeReq','callEngineEvent','callWebRTC','maybeTranscribeCall','callTranscriptionAPI',
     'if in.TranscribeCalls {','in.RecordCalls = true')
must('services/api/internal/httpapi/server.go','/calls/{id}/webrtc','/internal/calls/events', 's.callEngineEvent')

must('apps/web/lib/calls-webrtc.ts','RTCPeerConnection','createDataChannel','getUserMedia','AudioWorkletNode','sdp_offer')
must('apps/web/app/calls/page.tsx','Motor integrado','Conectar audio','Contestar','Poner en espera','Reanudar','Transferir llamada','Grabación')
assert (root/'apps/web/public/worklets/capture-processor.js').exists()
assert (root/'apps/web/public/worklets/playback-processor.js').exists()

must('.env.example','WAMERCIO_WEBRTC_EXTERNAL_IP=','WAMERCIO_WEBRTC_UDP_PORT_MIN=55000','WAMERCIO_WEBRTC_UDP_PORT_MAX=55100','WAMERCIO_CALLS_MAX_PER_STORE=8')
must('docker-compose.yml','WAMERCIO_WEBRTC_EXTERNAL_IP: ${WAMERCIO_WEBRTC_EXTERNAL_IP:-}','/udp"')

# Quote hotfix that triggered the previous failed deploy must remain fixed.
quote=text('apps/web/app/quote/[token]/page.tsx')
assert 'useEffect(load,[token])' not in quote
assert 'useEffect(()=>{void load()},[token])' in quote or 'useEffect(() => { void load() }, [token])' in quote

# No new migration is needed; Calls reuses 000047.
assert (root/'services/api/migrations/000047_calls_premium.up.sql').exists()
assert (root/'services/api/migrations/000047_calls_premium.down.sql').exists()

print('PASS: WAMERCIO 4.1.0 integrated calls contract')
