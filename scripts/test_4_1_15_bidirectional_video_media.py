from pathlib import Path

root=Path(__file__).resolve().parents[1]
video=(root/'services/whatsapp-bridge/internal/voip/call/callmanager_video.go').read_text()
upgrade=(root/'services/whatsapp-bridge/internal/voip/call/callmanager_video_upgrade.go').read_text()
webrtc=(root/'apps/web/lib/calls-webrtc.ts').read_text()
bridge=(root/'services/whatsapp-bridge/internal/bridge/calls_engine.go').read_text()

# WhatsApp video PT-97 must carry the 0xDEBE video metadata extension. A negotiated
# video state without this media shape is the exact failure where both clients switch
# to video UI but no remote image is rendered.
for token in ['whatsAppVideoExtensionProfile = 0xDEBE','buildWhatsAppVideoExtension','videoMediaFrameInfoIDR','videoMediaFrameInfoDelta']:
    assert token in video, token
assert 'pkt.Header.ExtensionProfile = whatsAppVideoExtensionProfile' in video
assert 'pkt.Header.ExtensionData = buildWhatsAppVideoExtension' in video

# Upgrade accept must announce state=1 in the WhatsApp shape used by current clients:
# no stale H264,AV1 codec offer on the active-media transition.
assert 'VideoStateEnabled, "", &orientation' in upgrade

# Browser encoder is normalized to Annex-B even when the Chromium HW encoder emits AVCC,
# and the receiver derives the AVC codec from the peer SPS instead of hard-coding one profile.
for token in ['avccToAnnexB','parameterSetsFromAvcC','codecFromAnnexB','waitForDataChannelOpen']:
    assert token in webrtc, token
assert "avc: { format: 'annexb' as const }" in webrtc
assert 'VideoEncoderCtor.isConfigSupported' in webrtc
assert 'getDecoder(codec)' in webrtc

# The same WebRTC h264 DataChannel remains bidirectional.
assert 'OnBrowserVideo' in bridge and 'FeedCapturedVideo' in bridge
assert 'OnPeerVideo' in bridge and 'WriteVideo' in bridge

# Runtime counters/log markers make a broken direction immediately diagnosable.
for token in ['video outbound access unit','video inbound access unit','videoOutboundFrames','videoInboundFrames']:
    assert token in video or token in (root/'services/whatsapp-bridge/internal/voip/call/callmanager.go').read_text(), token

print('PASS: WAMERCIO 4.1.15 bidirectional video media regression')
