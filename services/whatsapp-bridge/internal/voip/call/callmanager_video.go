package call

import (
	"encoding/binary"
	"time"
	"wamercio/services/whatsapp-bridge/internal/voip/core"
	"wamercio/services/whatsapp-bridge/internal/voip/media"
	"wamercio/services/whatsapp-bridge/internal/voip/transport"
)

const (
	videoRtpStepSamples      = 90000 / 15
	videoCongestionDropBytes = 48 * 1024
	videoSlotWord            = 2

	// WhatsApp Web video uses the one-byte RTP header extension profile 0xDEBE.
	// Modern Android/iOS clients use MediaFrameInfo to classify IDR vs delta
	// frames. Sending plain PT-97 RTP without this extension can negotiate video
	// successfully while the peer still renders no remote frames.
	whatsAppVideoExtensionProfile = 0xDEBE
	videoMediaFrameInfoIDR        = 0x08
	videoMediaFrameInfoDelta      = 0x20
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
	m.videoFrameNumber = 1
	m.videoTransportSequence = 1
	m.videoOutboundFrames = 0
	m.videoInboundFrames = 0
	m.lastInboundVideoAt = time.Time{}
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
	// Re-advertise the stream descriptor set. SctpRelayManager deliberately sends
	// the registration repeatedly (immediate + 50/150/500/3000 ms) so mobile
	// clients that switch their video SSRC a few milliseconds after state=1 are
	// still picked up.
	go m.relay.ResendSubscriptions()
	m.log.Info("video media set up", "self_video_ssrc", m.videoSelfSsrc,
		"self_device", ourDeviceJid, "peer_device", peerDeviceJid,
		"stream_ssrcs", len(selfSsrcs)+len(peerSsrcs))
}

// buildWhatsAppVideoExtension returns the 0xDEBE one-byte-header extension body
// used by WhatsApp video RTP. The first packet of every access unit carries a
// frame number; every packet carries MediaFrameInfo, short-offset and transport
// sequence. This mirrors the current WhatsApp Web/WASM media shape and fixes the
// negotiated-but-black-video failure seen with extension-less PT-97 packets.
func buildWhatsAppVideoExtension(mediaFrameInfo byte, frameNumber *uint16, transportSequence uint16) []byte {
	frameInfoLen := 1
	if frameNumber != nil {
		frameInfoLen = 3
	}
	out := make([]byte, 0, 16)
	out = append(out, 0x30|byte(frameInfoLen-1), mediaFrameInfo)
	if frameNumber != nil {
		out = binary.BigEndian.AppendUint16(out, *frameNumber)
	}
	// id=5 initial bandwidth (2 bytes), id=6 short offset (2 bytes),
	// id=9 transport sequence (2 bytes).
	out = append(out, 0x51, 0x00, 0x00)
	out = append(out, 0x61, 0x00, 0x00)
	out = append(out, 0x91)
	out = binary.BigEndian.AppendUint16(out, transportSequence)
	for len(out)%4 != 0 {
		out = append(out, 0)
	}
	return out
}

func videoAccessUnitHasIDR(au []byte) bool {
	for _, nalu := range transport.SplitAnnexB(au) {
		if len(nalu) == 0 {
			continue
		}
		switch nalu[0] & 0x1f {
		case 5, 7: // IDR or SPS: both belong to a recovery access unit.
			return true
		}
	}
	return false
}

func (m *CallManager) FeedCapturedVideo(au []byte) {
	if len(au) == 0 {
		return
	}
	nalus := transport.SplitAnnexB(au)
	if len(nalus) == 0 {
		m.log.Debug("browser video frame ignored: not Annex-B", "bytes", len(au))
		return
	}

	m.mu.Lock()
	rtpSess, srtpSess, relay := m.videoRtpSession, m.videoSrtpSession, m.relay
	if rtpSess == nil || srtpSess == nil || relay == nil || !relay.HasConnection() {
		m.mu.Unlock()
		return
	}
	if relay.BufferedAmount() > videoCongestionDropBytes {
		m.mu.Unlock()
		return
	}

	firstAU := m.lastVideoAUAt.IsZero()
	m.lastVideoAUAt = time.Now()
	if !firstAU {
		rtpSess.AdvanceTimestamp(videoRtpStepSamples)
	}
	frameNumber := m.videoFrameNumber
	m.videoFrameNumber++
	transportSequence := m.videoTransportSequence
	idr := videoAccessUnitHasIDR(au)

	var payloads [][]byte
	for _, nalu := range nalus {
		// Keep RFC6184 NAL/FU-A packetization from WaCalls, but add WhatsApp's
		// video RTP metadata extension to every generated packet below.
		payloads = append(payloads, transport.PackageH264NALU(nalu)...)
	}
	if len(payloads) == 0 {
		m.mu.Unlock()
		return
	}
	for i, p := range payloads {
		last := i == len(payloads)-1
		pkt := rtpSess.CreatePacketWithDuration(p, 0, last)
		pkt.Header.Extension = true
		pkt.Header.ExtensionProfile = whatsAppVideoExtensionProfile
		mediaFrameInfo := byte(videoMediaFrameInfoDelta)
		if idr {
			mediaFrameInfo = videoMediaFrameInfoIDR
		}
		var framePtr *uint16
		if i == 0 {
			frameCopy := frameNumber
			framePtr = &frameCopy
		}
		pkt.Header.ExtensionData = buildWhatsAppVideoExtension(mediaFrameInfo, framePtr, transportSequence)
		transportSequence++
		srtp, err := srtpSess.Protect(pkt)
		if err != nil {
			m.log.Debug("video srtp protect error", "err", err)
			continue
		}
		relay.Broadcast(srtp)
	}
	m.videoTransportSequence = transportSequence
	m.videoOutboundFrames++
	if m.videoOutboundFrames == 1 || m.videoOutboundFrames%30 == 0 {
		m.log.Info("video outbound access unit", "frame", m.videoOutboundFrames,
			"bytes", len(au), "nalus", len(nalus), "idr", idr,
			"video_ssrc", m.videoSelfSsrc)
	}
	m.mu.Unlock()
}

func (m *CallManager) handleVideoRelayData(data []byte) {
	m.mu.Lock()
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
		m.log.Debug("video srtp unprotect error", "err", err, "ssrc", readRtpSsrc(data))
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
	if pkt.Header.Marker && len(m.videoFrameBuf) > 0 {
		frame = append([]byte(nil), m.videoFrameBuf...)
		m.videoFrameBuf = m.videoFrameBuf[:0]
		m.videoInboundFrames++
		m.lastInboundVideoAt = time.Now()
		if m.videoInboundFrames == 1 || m.videoInboundFrames%30 == 0 {
			m.log.Info("video inbound access unit", "frame", m.videoInboundFrames,
				"bytes", len(frame), "ssrc", pkt.Header.Ssrc)
		}
	}
	cb := m.OnPeerVideo
	m.mu.Unlock()

	if frame != nil && cb != nil {
		cb(frame)
	}
}

func readRtpSsrc(data []byte) uint32 {
	return uint32(data[8])<<24 | uint32(data[9])<<16 | uint32(data[10])<<8 | uint32(data[11])
}
