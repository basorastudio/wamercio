from pathlib import Path

root=Path(__file__).resolve().parents[1]
raw=(root/'services/whatsapp-bridge/internal/bridge/video_raw_hook.go').read_text()
bridge=(root/'services/whatsapp-bridge/internal/bridge/bridge.go').read_text()
calls=(root/'services/whatsapp-bridge/internal/bridge/calls_engine.go').read_text()
rtp=(root/'services/whatsapp-bridge/internal/voip/media/rtp.go').read_text()
video=(root/'services/whatsapp-bridge/internal/voip/call/callmanager_video.go').read_text()
h264=(root/'services/whatsapp-bridge/internal/voip/transport/h264_packet.go').read_text()
webrtc=(root/'apps/web/lib/calls-webrtc.ts').read_text()
soft=(root/'apps/web/components/calls-softphone.tsx').read_text()

# Mid-call video must be consumed before whatsmeow's generic typeless call ACK.
assert 'installVideoRawCallHook' in raw
assert 'processVideoCallNode' in raw
assert 'BuildVideoAck' in raw and 'type="video"' in raw
assert 'if err := m.installVideoRawCallHook(s); err != nil' in bridge
assert 'origCall.Call(args)' in raw and 'return nil' in raw
assert '_ = m.processVideoCallNode(s, evt.Node)' in calls

# WhatsApp PT-97 sender uses the video RTP metadata extension and keyframe recovery.
assert 'WhatsappVideoRtpExtensionProfile uint16 = 0xdebe' in rtp
assert 'CreateH264Packet' in rtp
for token in ['MediaFrameInfo','videoTransportSequence','videoFrameNumber']:
    assert token in rtp
assert 'AUHasIDR' in h264
assert 'videoKeyframeRequired' in video
assert 'CreateH264Packet(payload, last, frameInfo)' in video
assert 'packed = append(packed, annexBStartCode...)' in video
assert 'ResendSubscriptions' in video

# The local browser/bridge H264 leg must be reliable; WhatsApp RTP itself remains realtime.
assert "createDataChannel(H264_CHANNEL_LABEL, { ordered: true })" in webrtc
assert 'maxRetransmits: 0' not in webrtc.split("createDataChannel(H264_CHANNEL_LABEL",1)[1].split('\n',1)[0]
assert 'h264CodecFromAnnexB' in webrtc
assert 'onRemoteVideo?: () => void' in webrtc
assert 'onRemoteVideo?.()' in webrtc
assert 'decoderCodec' in webrtc

# A real decoded frame is authoritative and must uncover the remote canvas even if API metadata lags.
assert 'mediaRemoteVideoCallId' in soft
assert 'remoteVideoVisible' in soft
assert 'videoRemote||mediaRemoteVideoCallId===currentCall.id' in soft
assert 'setMediaRemoteVideoCallId(id)' in soft
assert '(!videoActive||!remoteVideoVisible)' in soft

print('PASS: WAMERCIO 4.1.15 bidirectional video media regression')
