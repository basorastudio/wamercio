package call

import (
	"time"
	"wamercio/services/whatsapp-bridge/internal/voip/core"
	"wamercio/services/whatsapp-bridge/internal/voip/media"
	"wamercio/services/whatsapp-bridge/internal/voip/transport"
)

const (
	videoRtpStepSamples      = 90000 / 15
	videoCongestionDropBytes = 48 * 1024
	videoSlotWord            = 2
)

var (
	videoCallSlots  = []uint32{0, 1, 4, 2, 3, 5}
	annexBStartCode = []byte{0, 0, 0, 1}
)

func (m *CallManager) setupVideoMediaLocked(sendKM, recvKM core.SrtpKeyingMaterial, ourDeviceJid, peerDeviceJid string) {
	call := m.currentCall
	if call == nil || call.StateData.VideoOff {
		return
	}
	vsess, err := media.NewSrtpSession(sendKM, recvKM, core.SRTPSendAuthTagLen, core.SRTPRecvAuthTagLen)
	if err != nil {
		m.log.Error("video srtp session failed", "err", err)
		return
	}
	m.videoSrtpSession = vsess
	m.videoSelfSsrc = media.GenerateSecureSsrc(call.CallID, ourDeviceJid, videoSlotWord)
	m.videoRtpSession = media.NewH264Session(m.videoSelfSsrc)
	m.videoKeyframeRequired = true
	m.videoRemoteFrameSeen = false
	m.lastVideoAUAt = time.Time{}
	m.videoFrameBuf = nil
	if m.videoDepacketizer == nil {
		m.videoDepacketizer = &transport.H264Depacketizer{}
	}

	selfSsrcs := make([]uint32, len(videoCallSlots))
	peerSsrcs := make([]uint32, len(videoCallSlots))
	for i, slot := range videoCallSlots {
		selfSsrcs[i] = media.GenerateSecureSsrc(call.CallID, ourDeviceJid, slot)
		peerSsrcs[i] = media.GenerateSecureSsrc(call.CallID, peerDeviceJid, slot)
	}
	m.relay.SetStreamSsrcs(selfSsrcs, peerSsrcs)
	// Mid-call video is enabled after the relay was already registered for audio.
	// Re-advertise the SSRC set so the relay starts forwarding the H.264 streams.
	go m.relay.ResendSubscriptions()
	m.log.Info("video media ready", "call_id", call.CallID, "self_video_ssrc", m.videoSelfSsrc,
		"stream_ssrcs", len(selfSsrcs)+len(peerSsrcs))
}

// FeedCapturedVideo accepts one Annex-B access unit produced by WebCodecs. Recent
// WhatsApp clients expect the complete access unit to be packetized as one logical
// video NAL stream (with embedded Annex-B start codes), plus the 0xdebe video RTP
// metadata extension. Sending every SPS/PPS/IDR NAL as an unrelated RTP unit can make
// the peer enter video mode but render only the avatar/black frame.
func (m *CallManager) FeedCapturedVideo(au []byte) {
	m.mu.Lock()
	rtpSess, srtpSess, relay := m.videoRtpSession, m.videoSrtpSession, m.relay
	keyframeRequired := m.videoKeyframeRequired
	m.mu.Unlock()
	if rtpSess == nil || srtpSess == nil || !relay.HasConnection() || len(au) == 0 {
		return
	}
	if relay.BufferedAmount() > videoCongestionDropBytes {
		return
	}

	nalus := transport.SplitAnnexB(au)
	if len(nalus) == 0 {
		return
	}
	idr := transport.AUHasIDR(au)
	if keyframeRequired && !idr {
		return
	}

	// Match the current WhatsApp Web/meowcaller wire shape: the complete access
	// unit is fragmented as a single RTP NAL stream. AUD NALs are transport noise
	// and are deliberately omitted.
	packed := make([]byte, 0, len(au))
	for _, nalu := range nalus {
		if len(nalu) == 0 || nalu[0]&0x1f == 9 {
			continue
		}
		if len(packed) > 0 {
			packed = append(packed, annexBStartCode...)
		}
		packed = append(packed, nalu...)
	}
	if len(packed) == 0 {
		return
	}
	payloads := transport.PackageH264NALU(packed)
	if len(payloads) == 0 {
		return
	}

	m.mu.Lock()
	first := m.lastVideoAUAt.IsZero()
	m.lastVideoAUAt = time.Now()
	if idr {
		m.videoKeyframeRequired = false
	}
	m.mu.Unlock()
	if !first {
		rtpSess.AdvanceTimestamp(videoRtpStepSamples)
	}
	frameInfo := media.VideoMediaFrameInfoDelta
	if idr {
		frameInfo = media.VideoMediaFrameInfoIDR
	}
	for i, payload := range payloads {
		last := i == len(payloads)-1
		pkt := rtpSess.CreateH264Packet(payload, last, frameInfo)
		protected, err := srtpSess.Protect(pkt)
		if err != nil {
			continue
		}
		relay.Broadcast(protected)
	}
}

func (m *CallManager) handleVideoRelayData(data []byte) {
	if len(data) < 12 {
		return
	}

	m.mu.Lock()
	// Media is authoritative. If signaling state=4/1 was delayed but PT-97 is
	// already arriving after an agent-initiated upgrade, recover the video state
	// and keying rather than dropping the first remote frames forever.
	if m.videoSrtpSession == nil && m.currentCall != nil && !m.currentCall.IsEnded() &&
		m.currentCall.StateData.State == core.CallStateActive && m.currentCall.VideoUpgradePending {
		m.currentCall.VideoUpgradePending = false
		m.currentCall.LocalVideo = true
		m.currentCall.RemoteVideo = true
		m.currentCall.MediaType = core.CallMediaTypeVideo
		m.currentCall.StateData.VideoOff = false
		m.initVideoKeysLocked()
		m.emitState()
	}
	if m.videoSrtpSession == nil || m.videoDepacketizer == nil {
		m.mu.Unlock()
		return
	}
	if readRtpSsrc(data) == m.videoSelfSsrc {
		m.mu.Unlock()
		return
	}
	srtp := m.videoSrtpSession
	depack := m.videoDepacketizer
	m.mu.Unlock()

	pkt, err := srtp.Unprotect(data)
	if err != nil {
		m.log.Debug("video srtp unprotect error", "err", err)
		return
	}
	if len(pkt.Payload) == 0 {
		return
	}
	nalus := depack.Depacketize(pkt.Payload)

	m.mu.Lock()
	for _, nalu := range nalus {
		m.videoFrameBuf = append(m.videoFrameBuf, annexBStartCode...)
		m.videoFrameBuf = append(m.videoFrameBuf, nalu...)
	}
	var frame []byte
	stateChanged := false
	if pkt.Header.Marker && len(m.videoFrameBuf) > 0 {
		frame = append([]byte(nil), m.videoFrameBuf...)
		m.videoFrameBuf = nil
		if !m.videoRemoteFrameSeen && m.currentCall != nil && !m.currentCall.IsEnded() {
			m.videoRemoteFrameSeen = true
			m.currentCall.VideoUpgradePending = false
			m.currentCall.RemoteVideo = true
			m.currentCall.MediaType = core.CallMediaTypeVideo
			m.currentCall.StateData.VideoOff = false
			stateChanged = true
		}
	}
	cb := m.OnPeerVideo
	if stateChanged {
		m.emitState()
	}
	m.mu.Unlock()

	if frame != nil && cb != nil {
		cb(frame)
	}
}

func readRtpSsrc(data []byte) uint32 {
	if len(data) < 12 {
		return 0
	}
	return uint32(data[8])<<24 | uint32(data[9])<<16 | uint32(data[10])<<8 | uint32(data[11])
}
