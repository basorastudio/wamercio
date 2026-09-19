from pathlib import Path

root=Path(__file__).resolve().parents[1]
soft=(root/'apps/web/components/calls-softphone.tsx').read_text()
webrtc=(root/'apps/web/lib/calls-webrtc.ts').read_text()
api=(root/'services/api/internal/httpapi/calls_premium.go').read_text()
bridge=(root/'services/whatsapp-bridge/internal/bridge/calls_engine.go').read_text()
bridge_events=(root/'services/whatsapp-bridge/internal/bridge/bridge.go').read_text()
upgrade=(root/'services/whatsapp-bridge/internal/voip/call/callmanager_video_upgrade.go').read_text()
signal=(root/'services/whatsapp-bridge/internal/voip/signaling/video_state.go').read_text()
offer=(root/'services/whatsapp-bridge/internal/voip/call/callmanager_signaling.go').read_text()
conversation=(root/'apps/web/app/conversations/page.tsx').read_text()

# Video belongs to the softphone, not to the chat toolbar.
assert 'startVideoUpgrade' in soft and '<Camera' in soft
assert "action:'video_start'" in soft and "action:'video_stop'" in soft
assert 'Video' not in conversation.split('title="Llamar por WhatsApp"')[0][-300:]  # no adjacent chat video CTA
assert 'video_start' not in conversation and 'video_stop' not in conversation

# Voice remains the initial mode in both directions.
assert 'cm.StartCall(ctx, externalCallID, peer, false)' in bridge
assert 'isVideo := false' in offer
assert 'todas las llamadas entran inicialmente en voz' in offer

# Only WAMERCIO can initiate upgrade; peer request is rejected.
assert 'RequestVideoUpgrade' in upgrade
assert 'VideoStateUpgradeRequestV2' in upgrade
assert 'peer video upgrade rejected by WAMERCIO policy' in upgrade
assert 'VideoStateUpgradeReject' in upgrade

# WhatsApp video state protocol and typed ACK are wired.
for token in ['VideoStateEnabled','VideoStateUpgradeAccept','VideoStateUpgradeReject','VideoStateStopped','VideoStateUpgradeCancel','VideoStateUpgradeRequestV2','BuildVideoAck']:
    assert token in signal or token in upgrade
assert 'type": "video"' in signal
assert 'events.UnknownCallEvent' in bridge_events
raw_hook=(root/'services/whatsapp-bridge/internal/bridge/video_raw_hook.go').read_text() if (root/'services/whatsapp-bridge/internal/bridge/video_raw_hook.go').exists() else ''
assert 'handleUnknownCallEvent' in bridge and ('BuildVideoAck' in bridge or ('BuildVideoAck' in raw_hook and 'installVideoRawCallHook' in raw_hook))

# Browser H264 bridge uses same WebRTC leg as PCM.
for token in ["H264_CHANNEL_LABEL = 'h264'",'VideoEncoder','VideoDecoder','MediaStreamTrackProcessor',"codec: 'avc1.42E01F'",'cameraStream','startVideo','stopVideo']:
    assert token in webrtc
assert 'h264ChannelLabel = "h264"' in bridge
assert 'OnBrowserVideo' in bridge and 'WriteVideo' in bridge
assert 'FeedCapturedVideo' in bridge and 'OnPeerVideo' in bridge
assert 'ResendSubscriptions' in (root/'services/whatsapp-bridge/internal/voip/call/callmanager_video.go').read_text()

# API exposes only in-call upgrade/downgrade actions and persists video state in JSON metadata.
assert '"video_start": true' in api and '"video_stop": true' in api
for token in ['video_active','video_pending','video_local','video_remote']:
    assert token in api and token in bridge and token in soft

# UX: video only on an active call, and returning to voice does not hang up.
assert "active&&audioConnected&&!videoActive&&!videoPending" in soft
assert "videoPending?'Cancelar video':'Volver a voz'" in soft
assert 'wam-video-stage' in soft and 'wam-local-video' in soft and 'wam-remote-video' in soft

print('PASS: WAMERCIO 4.1.13 voice-to-video softphone upgrade regression')
