from pathlib import Path
root=Path(__file__).resolve().parents[1]
def text(rel): return (root/rel).read_text(encoding='utf-8')

version=text('VERSION').strip()
assert version in {'4.1.7','4.1.8'}
assert f'"version": "{version}"' in text('apps/web/package.json')
assert f'wamercio-store-v{version}' in text('apps/web/public/sw.js')

soft=text('apps/web/components/calls-softphone.tsx')
host=text('apps/web/components/calls-softphone-host.tsx')

# Softphone surface remains canonical. V4.1.8 removes the embedded clone and
# uses only Document PiP; V4.1.7 still had the same-surface fallback.
assert 'const softphoneSurface' in soft
assert 'softphoneSurface()' in soft or 'softphoneSurface(true)' in soft
assert 'void softphoneRef.current?.openPictureInPicture()' in host
if version=='4.1.8':
    assert 'embeddedContent' not in soft
    assert 'softphoneSurface(false)' not in soft
else:
    assert 'softphoneSurface(false)' in soft

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
