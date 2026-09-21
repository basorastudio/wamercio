package bridge

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"wamercio/services/whatsapp-bridge/internal/voip/media"
)

const callRecordingSampleRate = 16000

type callRecorder struct {
	mu             sync.Mutex
	dir            string
	base           string
	micPath        string
	peerPath       string
	mic            *os.File
	peer           *os.File
	closed         bool
	started        time.Time
	micNextSample  int64
	peerNextSample int64
	micStarted     bool
	peerStarted    bool
}

func safeCallPathPart(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return "call"
	}
	var b strings.Builder
	for _, r := range v {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	out := strings.Trim(b.String(), "_")
	if out == "" {
		return "call"
	}
	if len(out) > 160 {
		out = out[:160]
	}
	return out
}

func newCallRecorder(uploadDir, storeID, callID string) (*callRecorder, error) {
	storePart := safeCallPathPart(storeID)
	base := safeCallPathPart(callID)
	dir := filepath.Join(uploadDir, "calls", storePart)
	tmp := filepath.Join(dir, ".tmp")
	if err := os.MkdirAll(tmp, 0755); err != nil {
		return nil, err
	}
	micPath := filepath.Join(tmp, base+"-agent.pcm")
	peerPath := filepath.Join(tmp, base+"-customer.pcm")
	mic, err := os.OpenFile(micPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		return nil, err
	}
	peer, err := os.OpenFile(peerPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		_ = mic.Close()
		_ = os.Remove(micPath)
		return nil, err
	}
	return &callRecorder{dir: dir, base: base, micPath: micPath, peerPath: peerPath, mic: mic, peer: peer, started: time.Now()}, nil
}

func (r *callRecorder) writeMic(pcm []float32) {
	if r == nil || len(pcm) == 0 {
		return
	}
	r.writeTrack(true, media.PCMFloat32ToInt16LE(pcm), int64(len(pcm)))
}

func (r *callRecorder) writePeer(pcm []float32) {
	if r == nil || len(pcm) == 0 {
		return
	}
	r.writeTrack(false, media.PCMFloat32ToInt16LE(pcm), int64(len(pcm)))
}

func (r *callRecorder) writeTrack(mic bool, data []byte, samples int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed || samples <= 0 {
		return
	}
	target := int64(time.Since(r.started).Seconds() * callRecordingSampleRate)
	var file *os.File
	var next *int64
	var started *bool
	if mic {
		file, next, started = r.mic, &r.micNextSample, &r.micStarted
	} else {
		file, next, started = r.peer, &r.peerNextSample, &r.peerStarted
	}
	if file == nil {
		return
	}
	if !*started {
		*next = target
		*started = true
	} else if target > *next+callRecordingSampleRate/10 {
		// Preserve meaningful transport/browser gaps instead of compressing
		// time. Short scheduler jitter remains contiguous. Sparse gaps read as
		// silence when the final stereo WAV is assembled.
		*next = target
	}
	_, _ = file.WriteAt(data, *next*2)
	*next += samples
}

func (r *callRecorder) finalize() (string, error) {
	if r == nil {
		return "", nil
	}
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return "", nil
	}
	r.closed = true
	if r.mic != nil {
		_ = r.mic.Sync()
		_ = r.mic.Close()
		r.mic = nil
	}
	if r.peer != nil {
		_ = r.peer.Sync()
		_ = r.peer.Close()
		r.peer = nil
	}
	r.mu.Unlock()

	defer os.Remove(r.micPath)
	defer os.Remove(r.peerPath)

	micInfo, micErr := os.Stat(r.micPath)
	peerInfo, peerErr := os.Stat(r.peerPath)
	if micErr != nil && peerErr != nil {
		return "", fmt.Errorf("no se pudo leer audio temporal de la llamada")
	}
	var micBytes, peerBytes int64
	if micErr == nil {
		micBytes = micInfo.Size() &^ 1
	}
	if peerErr == nil {
		peerBytes = peerInfo.Size() &^ 1
	}
	maxBytes := micBytes
	if peerBytes > maxBytes {
		maxBytes = peerBytes
	}
	if maxBytes == 0 {
		return "", nil
	}

	samples := maxBytes / 2
	// Stereo 16-bit PCM: left=agente, right=cliente.
	dataSize := samples * 4
	if dataSize > int64(^uint32(0))-44 {
		return "", fmt.Errorf("la grabación excede el límite WAV clásico")
	}
	outPath := filepath.Join(r.dir, r.base+".wav")
	out, err := os.OpenFile(outPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		return "", err
	}
	ok := false
	defer func() {
		_ = out.Close()
		if !ok {
			_ = os.Remove(outPath)
		}
	}()
	if err = writePCM16WAVHeader(out, uint32(dataSize), callRecordingSampleRate, 2); err != nil {
		return "", err
	}

	mic, _ := os.Open(r.micPath)
	peer, _ := os.Open(r.peerPath)
	if mic != nil {
		defer mic.Close()
	}
	if peer != nil {
		defer peer.Close()
	}
	const chunkSamples = 4096
	micBuf := make([]byte, chunkSamples*2)
	peerBuf := make([]byte, chunkSamples*2)
	stereo := make([]byte, chunkSamples*4)
	for sampleOffset := int64(0); sampleOffset < samples; sampleOffset += chunkSamples {
		nSamples := int64(chunkSamples)
		if remain := samples - sampleOffset; remain < nSamples {
			nSamples = remain
		}
		nBytes := int(nSamples * 2)
		clear(micBuf[:nBytes])
		clear(peerBuf[:nBytes])
		if mic != nil && sampleOffset*2 < micBytes {
			_, _ = mic.ReadAt(micBuf[:nBytes], sampleOffset*2)
		}
		if peer != nil && sampleOffset*2 < peerBytes {
			_, _ = peer.ReadAt(peerBuf[:nBytes], sampleOffset*2)
		}
		outBytes := int(nSamples * 4)
		for i := 0; i < int(nSamples); i++ {
			copy(stereo[i*4:i*4+2], micBuf[i*2:i*2+2])
			copy(stereo[i*4+2:i*4+4], peerBuf[i*2:i*2+2])
		}
		if _, err = out.Write(stereo[:outBytes]); err != nil {
			return "", err
		}
	}
	if err = out.Sync(); err != nil {
		return "", err
	}
	ok = true
	return "/media/calls/" + safeCallPathPart(filepath.Base(r.dir)) + "/" + filepath.Base(outPath), nil
}

func writePCM16WAVHeader(w io.Writer, dataSize uint32, sampleRate uint32, channels uint16) error {
	byteRate := sampleRate * uint32(channels) * 2
	blockAlign := channels * 2
	values := []any{
		[]byte("RIFF"), uint32(36) + dataSize, []byte("WAVE"),
		[]byte("fmt "), uint32(16), uint16(1), channels, sampleRate, byteRate, blockAlign, uint16(16),
		[]byte("data"), dataSize,
	}
	for _, v := range values {
		if b, ok := v.([]byte); ok {
			if _, err := w.Write(b); err != nil {
				return err
			}
			continue
		}
		if err := binary.Write(w, binary.LittleEndian, v); err != nil {
			return err
		}
	}
	return nil
}
