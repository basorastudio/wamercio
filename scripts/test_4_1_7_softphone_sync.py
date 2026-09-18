from pathlib import Path
root=Path(__file__).resolve().parents[1]
def text(rel): return (root/rel).read_text(encoding='utf-8')

assert text('VERSION').strip()=='4.1.7'
assert '"version": "4.1.7"' in text('apps/web/package.json')
assert 'wamercio-store-v4.1.7' in text('apps/web/public/sw.js')

soft=text('apps/web/components/calls-softphone.tsx')
host=text('apps/web/components/calls-softphone-host.tsx')

# Same render tree for manual, automatic fallback and real Document PiP.
for token in [
    'const softphoneSurface=(inPip=false)',
    'softphoneSurface(true)',
    'softphoneSurface(false)',
    'h-[min(640px,calc(100dvh-24px))]',
    'w-[min(380px,calc(100vw-24px))]',
]:
    assert token in soft, token
assert 'void softphoneRef.current?.openPictureInPicture()' in host

# Counter follows the HDN rule: conversation time begins once answered/active,
# never from started_at while the phone is still ringing.
for token in [
    'const durationLabel=(seconds:number)',
    "!['active','held','transferred'].includes(visualStatus)",
    'currentCall.answered_at?new Date(currentCall.answered_at).getTime():0',
    "status==='ringing'?'Timbrando…'",
    "status==='connecting'?'Conectando…'",
]:
    assert token in soft, token
assert 'currentCall.answered_at||currentCall.started_at' not in soft
assert '{liveDuration}s ·' not in soft

# State-specific controls: no extra mute/audio/hangup buttons while incoming rings.
for token in [
    "const incomingRinging=currentCall.direction==='in'&&visualStatus==='ringing'",
    "const outgoingRinging=currentCall.direction==='out'&&visualStatus==='ringing'",
    'Contestar</button><button className="danger"',
    'Rechazar</button>',
    'Cancelar llamada</button>',
    'Conectando llamada…',
    "connectedPhase&&audioConnected",
    'Reconectar audio',
    'Transferir</span>',
]:
    assert token in soft, token
# Application navigation belongs in the header; it is not duplicated among call controls.
assert '{inPip&&<button' not in soft

# A successfully answered call or confirmed remote media is immediately represented
# as active in UI, avoiding stale Timbrando/Contestar/Rechazar controls.
assert "status:'active',answered_at:row.answered_at||answeredAt" in soft
assert 'mediaActiveCallId===currentCall.id' in soft
webrtc=text('apps/web/lib/calls-webrtc.ts')
for token in ['onRemoteAudio?: () => void','remoteAudioConfirmed = false','onRemoteAudio?.()']:
    assert token in webrtc, token

print('PASS: WAMERCIO 4.1.7 unified softphone/state-controls/timer regression')
