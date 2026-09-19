package media

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"math/big"
	"wamercio/services/whatsapp-bridge/internal/voip/core"
)

const (
	rtpVersion       = 2
	rtpMinHeaderSize = 12

	// WhatsApp video uses the 0xdebe one-byte RTP extension profile. The
	// media-frame-info values below match the native client/Web caller wire
	// format and are required for the peer to classify IDR vs delta frames.
	WhatsappVideoRtpExtensionProfile uint16 = 0xdebe
	VideoMediaFrameInfoIDR           uint8  = 0x08
	VideoMediaFrameInfoDelta         uint8  = 0x20
)

type RtpHeader struct {
	Version          uint8
	Padding          bool
	Extension        bool
	CsrcCount        uint8
	Marker           bool
	PayloadType      uint8
	SequenceNumber   uint16
	Timestamp        uint32
	Ssrc             uint32
	Csrc             []uint32
	ExtensionProfile uint16
	ExtensionData    []byte
}

func NewRtpHeader(payloadType uint8, seq uint16, ts, ssrc uint32) *RtpHeader {
	return &RtpHeader{
		Version:        rtpVersion,
		PayloadType:    payloadType,
		SequenceNumber: seq,
		Timestamp:      ts,
		Ssrc:           ssrc,
	}
}

func (h *RtpHeader) Size() int {
	s := rtpMinHeaderSize + int(h.CsrcCount)*4
	if h.Extension {
		s += 4 + len(h.ExtensionData)
	}
	return s
}

func (h *RtpHeader) Encode(buf []byte) (int, error) {
	if len(buf) < h.Size() {
		return 0, errors.New("buffer too small for RTP header")
	}

	buf[0] = (h.Version&0x03)<<6 |
		boolBit(h.Padding)<<5 |
		boolBit(h.Extension)<<4 |
		(h.CsrcCount & 0x0f)

	buf[1] = boolBit(h.Marker)<<7 | (h.PayloadType & 0x7f)

	binary.BigEndian.PutUint16(buf[2:], h.SequenceNumber)
	binary.BigEndian.PutUint32(buf[4:], h.Timestamp)
	binary.BigEndian.PutUint32(buf[8:], h.Ssrc)

	offset := 12
	for _, c := range h.Csrc {
		binary.BigEndian.PutUint32(buf[offset:], c)
		offset += 4
	}

	if h.Extension {
		binary.BigEndian.PutUint16(buf[offset:], h.ExtensionProfile)
		binary.BigEndian.PutUint16(buf[offset+2:], uint16(len(h.ExtensionData)/4))
		copy(buf[offset+4:], h.ExtensionData)
	}

	return h.Size(), nil
}

func DecodeRtpHeader(buf []byte) (*RtpHeader, error) {
	if len(buf) < rtpMinHeaderSize {
		return nil, errors.New("buffer too small for RTP header")
	}

	version := (buf[0] >> 6) & 0x03
	if version != rtpVersion {
		return nil, errors.New("invalid RTP version")
	}

	h := &RtpHeader{
		Version:        version,
		Padding:        (buf[0]>>5)&0x01 != 0,
		Extension:      (buf[0]>>4)&0x01 != 0,
		CsrcCount:      buf[0] & 0x0f,
		Marker:         (buf[1]>>7)&0x01 != 0,
		PayloadType:    buf[1] & 0x7f,
		SequenceNumber: binary.BigEndian.Uint16(buf[2:]),
		Timestamp:      binary.BigEndian.Uint32(buf[4:]),
		Ssrc:           binary.BigEndian.Uint32(buf[8:]),
	}

	headerSize := rtpMinHeaderSize + int(h.CsrcCount)*4
	if len(buf) < headerSize {
		return nil, errors.New("buffer too small for CSRC list")
	}

	offset := 12
	for i := 0; i < int(h.CsrcCount); i++ {
		h.Csrc = append(h.Csrc, binary.BigEndian.Uint32(buf[offset:]))
		offset += 4
	}

	if h.Extension && len(buf) >= offset+4 {
		h.ExtensionProfile = binary.BigEndian.Uint16(buf[offset:])
		extWords := binary.BigEndian.Uint16(buf[offset+2:])
		extBytes := int(extWords) * 4
		offset += 4
		if len(buf) >= offset+extBytes {
			h.ExtensionData = append([]byte(nil), buf[offset:offset+extBytes]...)
		}
	}

	return h, nil
}

type RtpPacket struct {
	Header  *RtpHeader
	Payload []byte
}

func (p *RtpPacket) Size() int {
	return p.Header.Size() + len(p.Payload)
}

func (p *RtpPacket) Encode() ([]byte, error) {
	buf := make([]byte, p.Size())
	headerSize, err := p.Header.Encode(buf)
	if err != nil {
		return nil, err
	}
	copy(buf[headerSize:], p.Payload)
	return buf, nil
}

func DecodeRtpPacket(buf []byte) (*RtpPacket, error) {
	header, err := DecodeRtpHeader(buf)
	if err != nil {
		return nil, err
	}
	payload := append([]byte(nil), buf[header.Size():]...)
	return &RtpPacket{Header: header, Payload: payload}, nil
}

type RtpSession struct {
	ssrc             uint32
	payloadType      uint8
	sequenceNumber   uint16
	sampleRate       int
	timestamp        uint32
	samplesPerPacket int

	// Video-only counters. Audio sessions ignore these fields. WhatsApp's H.264
	// RTP carries a 0xdebe extension with a frame number and a transport
	// sequence. Without it recent Android/iOS clients may accept the video
	// upgrade UI but discard every PT-97 packet.
	videoTransportSequence uint16
	videoFrameNumber       uint16
	videoFirstPacket       bool
}

func NewRtpSession(ssrc uint32, payloadType uint8, sampleRate, samplesPerPacket int) *RtpSession {
	return &RtpSession{
		ssrc:             ssrc,
		payloadType:      payloadType,
		sequenceNumber:   uint16(randUint(65536)),
		sampleRate:       sampleRate,
		timestamp:        uint32(randUint(1 << 32)),
		samplesPerPacket: samplesPerPacket,
		videoFrameNumber: 1,
		videoFirstPacket: true,
	}
}

func NewWhatsAppOpusSession(ssrc uint32) *RtpSession {
	return NewRtpSession(ssrc, core.PayloadTypeWhatsAppOpus, 16000, 960)
}

func NewH264Session(ssrc uint32) *RtpSession {
	return NewRtpSession(ssrc, core.PayloadTypeWhatsAppH264, 90000, 0)
}

func (s *RtpSession) CreatePacket(payload []byte, marker bool) *RtpPacket {
	return s.CreatePacketWithDuration(payload, s.samplesPerPacket, marker)
}

func (s *RtpSession) AdvanceTimestamp(samples uint32) {
	s.timestamp += samples
}

func (s *RtpSession) CreatePacketWithDuration(payload []byte, durationSamples int, marker bool) *RtpPacket {
	header := NewRtpHeader(s.payloadType, s.sequenceNumber, s.timestamp, s.ssrc)
	header.Marker = marker

	s.sequenceNumber++
	s.timestamp += uint32(durationSamples)

	return &RtpPacket{Header: header, Payload: payload}
}

// CreateH264Packet builds the WhatsApp PT-97 RTP header used by video calls.
// The 0xdebe extension shape mirrors the current native/Web caller: id=3
// media-frame-info (+ frame number on the first packet), id=5 initial bandwidth,
// id=6 short offset and id=9 transport sequence. The timestamp is advanced once
// per access unit by the caller through AdvanceTimestamp.
func (s *RtpSession) CreateH264Packet(payload []byte, marker bool, mediaFrameInfo uint8) *RtpPacket {
	header := NewRtpHeader(s.payloadType, s.sequenceNumber, s.timestamp, s.ssrc)
	header.Marker = marker
	header.Extension = true
	header.ExtensionProfile = WhatsappVideoRtpExtensionProfile

	ext := make([]byte, 0, 16)
	if s.videoFirstPacket {
		// One-byte extension header: ID=3, length=3 bytes.
		ext = append(ext, 0x32, mediaFrameInfo)
		ext = binary.BigEndian.AppendUint16(ext, s.videoFrameNumber)
	} else {
		// ID=3, length=1 byte.
		ext = append(ext, 0x30, mediaFrameInfo)
	}
	// ID=5 initial bandwidth (2 bytes), ID=6 short offset (2 bytes),
	// ID=9 transport sequence (2 bytes). Zero is a valid baseline value for
	// the first two fields and matches the proven meowcaller sender shape.
	ext = append(ext, 0x51, 0x00, 0x00)
	ext = append(ext, 0x61, 0x00, 0x00)
	ext = append(ext, 0x91)
	ext = binary.BigEndian.AppendUint16(ext, s.videoTransportSequence)
	for len(ext)%4 != 0 {
		ext = append(ext, 0)
	}
	header.ExtensionData = ext

	s.sequenceNumber++
	s.videoTransportSequence++
	if marker {
		s.videoFrameNumber++
		s.videoFirstPacket = true
	} else {
		s.videoFirstPacket = false
	}

	return &RtpPacket{Header: header, Payload: payload}
}

func boolBit(b bool) byte {
	if b {
		return 1
	}
	return 0
}

func randUint(max int64) int64 {
	n, err := rand.Int(rand.Reader, big.NewInt(max))
	if err != nil {
		panic(err)
	}
	return n.Int64()
}
