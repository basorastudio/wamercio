package bridge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pion/webrtc/v4"
	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"

	"wamercio/services/whatsapp-bridge/internal/voip/call"
	"wamercio/services/whatsapp-bridge/internal/voip/core"
	"wamercio/services/whatsapp-bridge/internal/voip/media"
	"wamercio/services/whatsapp-bridge/internal/voip/signaling"
	"wamercio/services/whatsapp-bridge/internal/voip/wanode"
	"wamercio/services/whatsapp-bridge/internal/wacall"
)

// WAMERCIO Calls is deliberately embedded in the WhatsApp bridge. The same
// process that owns a linked whatsmeow session also owns its WhatsApp call
// signaling, relay/SRTP state and browser WebRTC leg. No external call adapter
// is required.

const (
	pcmChannelLabel = "pcm"
	defaultMaxCalls = 8
)

type activeCall struct {
	cm           *call.CallManager
	bridge       *browserCallBridge
	recorder     *callRecorder
	recordID     string // WAMERCIO whatsapp_calls.id for outbound calls; empty for inbound until core creates it.
	held         bool
	createdAt    time.Time
	lastActivity time.Time
	terminalOnce sync.Once
	mu           sync.RWMutex
}

type callRegistry struct {
	mu    sync.RWMutex
	calls map[string]*activeCall // key is WhatsApp call-id / external_call_id.
}

func newCallRegistry() *callRegistry { return &callRegistry{calls: map[string]*activeCall{}} }
func (r *callRegistry) add(id string, c *activeCall) {
	r.mu.Lock()
	r.calls[id] = c
	r.mu.Unlock()
}
func (r *callRegistry) get(id string) (*activeCall, bool) {
	r.mu.RLock()
	c, ok := r.calls[id]
	r.mu.RUnlock()
	return c, ok
}
func (r *callRegistry) remove(id string) (*activeCall, bool) {
	r.mu.Lock()
	c, ok := r.calls[id]
	if ok {
		delete(r.calls, id)
	}
	r.mu.Unlock()
	return c, ok
}
func (r *callRegistry) count() int {
	r.mu.RLock()
	n := len(r.calls)
	r.mu.RUnlock()
	return n
}

type engineCallSnapshot struct {
	ExternalCallID string    `json:"external_call_id"`
	RecordID       string    `json:"record_id,omitempty"`
	Status         string    `json:"status"`
	Direction      string    `json:"direction"`
	CreatedAt      time.Time `json:"created_at"`
	MediaReady     bool      `json:"media_ready"`
	RemoteJID      string    `json:"remote_jid,omitempty"`
	Phone          string    `json:"phone,omitempty"`
	DisplayName    string    `json:"display_name,omitempty"`
	MediaType      string    `json:"media_type,omitempty"`
}

func (r *callRegistry) snapshots() []engineCallSnapshot {
	r.mu.RLock()
	items := make([]struct {
		id string
		ac *activeCall
	}, 0, len(r.calls))
	for id, ac := range r.calls {
		items = append(items, struct {
			id string
			ac *activeCall
		}{id: id, ac: ac})
	}
	r.mu.RUnlock()
	out := make([]engineCallSnapshot, 0, len(items))
	for _, item := range items {
		if item.ac == nil || item.ac.cm == nil {
			continue
		}
		ci := item.ac.cm.CurrentCall()
		if ci == nil || ci.IsEnded() {
			continue
		}
		item.ac.mu.RLock()
		recordID := item.ac.recordID
		createdAt := item.ac.createdAt
		item.ac.mu.RUnlock()
		remoteJID := strings.TrimSpace(ci.PeerJid)
		phone := strings.TrimSpace(ci.CallerPn)
		if phone != "" {
			if jid, err := types.ParseJID(phone); err == nil {
				phone = strings.TrimSpace(jid.User)
			} else if at := strings.Index(phone, "@"); at > 0 {
				phone = phone[:at]
			}
		}
		if phone == "" && remoteJID != "" {
			if jid, err := types.ParseJID(remoteJID); err == nil {
				phone = strings.TrimSpace(jid.User)
			} else if at := strings.Index(remoteJID, "@"); at > 0 {
				phone = remoteJID[:at]
			}
		}
		out = append(out, engineCallSnapshot{ExternalCallID: item.id, RecordID: recordID, Status: mapEngineStatus(ci), Direction: callDirection(ci), CreatedAt: createdAt, MediaReady: item.ac.cm.MediaReady(), RemoteJID: remoteJID, Phone: phone, DisplayName: strings.TrimSpace(ci.PeerName), MediaType: string(ci.MediaType)})
	}
	return out
}
func (r *callRegistry) setBridge(id string, b *browserCallBridge) (*browserCallBridge, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.calls[id]
	if !ok {
		return nil, false
	}
	c.mu.Lock()
	old := c.bridge
	c.bridge = b
	c.mu.Unlock()
	return old, true
}
func (r *callRegistry) clearBridgeIfMatch(id string, b *browserCallBridge) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.calls[id]
	if !ok {
		return false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.bridge != b {
		return false
	}
	c.bridge = nil
	return true
}
func (r *callRegistry) setHeld(id string, held bool) bool {
	c, ok := r.get(id)
	if !ok {
		return false
	}
	c.mu.Lock()
	c.held = held
	c.mu.Unlock()
	return true
}
func (r *callRegistry) isHeld(id string) bool {
	c, ok := r.get(id)
	if !ok {
		return false
	}
	c.mu.RLock()
	held := c.held
	c.mu.RUnlock()
	return held
}

// browserCallBridge carries 16 kHz mono PCM over a WebRTC data channel. It is
// intentionally simple: the WhatsApp side keeps MLow/SRTP details isolated in
// CallManager while the browser only sees PCM.
type browserCallBridge struct {
	pc *webrtc.PeerConnection
	dc atomic.Pointer[webrtc.DataChannel]

	OnBrowserPCM func([]float32)
	OnTerminal   func()
}

func newBrowserPeerConnection() (*webrtc.PeerConnection, error) {
	var setting webrtc.SettingEngine
	if min, max, ok := webrtcUDPRangeFromEnv(); ok {
		if err := setting.SetEphemeralUDPPortRange(uint16(min), uint16(max)); err != nil {
			return nil, fmt.Errorf("configurar rango UDP WebRTC %d-%d: %w", min, max, err)
		}
	}
	if ips := webrtcExternalIPsFromEnv(); len(ips) > 0 {
		setting.SetNAT1To1IPs(ips, webrtc.ICECandidateTypeHost)
	}
	api := webrtc.NewAPI(webrtc.WithSettingEngine(setting))
	return api.NewPeerConnection(webrtc.Configuration{})
}

func webrtcExternalIPsFromEnv() []string {
	raw := strings.TrimSpace(os.Getenv("WAMERCIO_WEBRTC_EXTERNAL_IP"))
	if raw == "" {
		return nil
	}
	parts := strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ';' || r == ' ' || r == '\n' || r == '\t' })
	seen := map[string]bool{}
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		ip := strings.TrimSpace(part)
		if ip != "" && !seen[ip] {
			seen[ip] = true
			out = append(out, ip)
		}
	}
	return out
}

func webrtcUDPRangeFromEnv() (int, int, bool) {
	minRaw := strings.TrimSpace(os.Getenv("WAMERCIO_WEBRTC_UDP_PORT_MIN"))
	maxRaw := strings.TrimSpace(os.Getenv("WAMERCIO_WEBRTC_UDP_PORT_MAX"))
	if minRaw == "" && maxRaw == "" {
		return 0, 0, false
	}
	min, e1 := strconv.Atoi(minRaw)
	max, e2 := strconv.Atoi(maxRaw)
	if e1 != nil || e2 != nil || min < 1 || max < min || max > 65535 {
		return 0, 0, false
	}
	return min, max, true
}

var errInvalidBrowserSDP = errors.New("oferta WebRTC inválida")

func normalizeBrowserSDP(raw string) string {
	v := strings.TrimPrefix(raw, "\ufeff")
	v = strings.ReplaceAll(v, "\r\n", "\n")
	v = strings.ReplaceAll(v, "\r", "\n")
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	return strings.ReplaceAll(v, "\n", "\r\n") + "\r\n"
}

func newBrowserCallBridge(offerSDP string) (*browserCallBridge, string, error) {
	offerSDP = normalizeBrowserSDP(offerSDP)
	if offerSDP == "" {
		return nil, "", errInvalidBrowserSDP
	}
	pc, err := newBrowserPeerConnection()
	if err != nil {
		return nil, "", err
	}
	b := &browserCallBridge{pc: pc}
	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		if dc.Label() != pcmChannelLabel {
			return
		}
		b.dc.Store(dc)
		dc.OnMessage(func(msg webrtc.DataChannelMessage) {
			if cb := b.OnBrowserPCM; cb != nil && len(msg.Data) > 0 {
				cb(media.PCMInt16LEToFloat32(msg.Data))
			}
		})
	})
	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		if state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateClosed {
			if b.OnTerminal != nil {
				b.OnTerminal()
			}
			return
		}
		if state == webrtc.ICEConnectionStateDisconnected {
			// Give transient Wi-Fi/mobile-network changes a short grace period.
			// If the browser leg does not recover, release only that leg; the
			// WhatsApp call itself remains alive and the UI can reconnect audio.
			go func() {
				time.Sleep(5 * time.Second)
				if b.pc != nil && b.pc.ICEConnectionState() == webrtc.ICEConnectionStateDisconnected && b.OnTerminal != nil {
					b.OnTerminal()
				}
			}()
		}
	})
	if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: offerSDP}); err != nil {
		_ = pc.Close()
		return nil, "", fmt.Errorf("%w: %v", errInvalidBrowserSDP, err)
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		_ = pc.Close()
		return nil, "", err
	}
	gather := webrtc.GatheringCompletePromise(pc)
	if err := pc.SetLocalDescription(answer); err != nil {
		_ = pc.Close()
		return nil, "", err
	}
	select {
	case <-gather:
	case <-time.After(4 * time.Second):
	}
	if pc.LocalDescription() == nil {
		_ = pc.Close()
		return nil, "", errors.New("WebRTC no produjo una respuesta SDP")
	}
	return b, pc.LocalDescription().SDP, nil
}

func (b *browserCallBridge) WritePCM(pcm []float32) error {
	dc := b.dc.Load()
	if dc == nil || dc.ReadyState() != webrtc.DataChannelStateOpen || len(pcm) == 0 {
		return nil
	}
	return dc.Send(media.PCMFloat32ToInt16LE(pcm))
}
func (b *browserCallBridge) Close() {
	if b != nil && b.pc != nil {
		_ = b.pc.Close()
	}
}

func (m *Manager) maxCallsPerSession() int {
	v, err := strconv.Atoi(strings.TrimSpace(os.Getenv("WAMERCIO_CALLS_MAX_PER_STORE")))
	if err != nil || v <= 0 {
		return defaultMaxCalls
	}
	if v > 64 {
		return 64
	}
	return v
}

type callEngineSettings struct {
	Enabled    bool
	Record     bool
	Transcribe bool
	Ring       int
}

func (m *Manager) callSettingsForEngine(storeID string) callEngineSettings {
	out := callEngineSettings{Ring: 30}
	if storeID == "" {
		return out
	}
	// The SaaS support account is a first-class WhatsApp session. Calls are
	// enabled whenever that global session is linked, without store-level
	// recording/transcription settings or a tenant UUID.
	if storeID == SupportSessionKey {
		out.Enabled = true
		return out
	}
	if err := m.db.QueryRow(`SELECT is_active,record_calls,transcribe_calls,ring_seconds FROM store_call_settings WHERE store_id=$1`, storeID).Scan(&out.Enabled, &out.Record, &out.Transcribe, &out.Ring); err != nil {
		return callEngineSettings{Ring: 30}
	}
	if out.Ring < 5 || out.Ring > 120 {
		out.Ring = 30
	}
	// Transcribir requiere disponer del audio. Si una configuración antigua
	// dejó transcribe=true y record=false, grabamos de todos modos para no
	// perder la llamada. La API normaliza esta combinación al guardar.
	if out.Transcribe {
		out.Record = true
	}
	return out
}

func (m *Manager) callsEnabled(storeID string) (bool, int) {
	cfg := m.callSettingsForEngine(storeID)
	return cfg.Enabled, cfg.Ring
}

func wrapCall(from types.JID, inner *waBinary.Node) *waBinary.Node {
	content := []waBinary.Node{}
	if inner != nil {
		content = append(content, *inner)
	}
	return &waBinary.Node{Tag: "call", Attrs: waBinary.Attrs{"from": from}, Content: content}
}

func callIDFromNode(node *waBinary.Node) string {
	info := signaling.ExtractNodeInfo(node)
	if info == nil {
		return ""
	}
	return info.CallID
}

func mapEngineStatus(c *call.CallInfo) string {
	if c == nil {
		return "failed"
	}
	switch c.StateData.State {
	case core.CallStateInitiating, core.CallStateConnecting:
		return "connecting"
	case core.CallStateRinging, core.CallStateIncomingRinging:
		return "ringing"
	case core.CallStateActive:
		return "active"
	case core.CallStateOnHold:
		return "held"
	case core.CallStateEnded:
		switch c.StateData.EndReason {
		case core.EndCallReasonDeclined:
			return "rejected"
		case core.EndCallReasonTimeout, core.EndCallReasonBusy, core.EndCallReasonDoNotDisturb:
			if c.Direction == core.CallDirectionIncoming && c.StateData.ConnectedAt == nil {
				return "missed"
			}
			return "completed"
		case core.EndCallReasonFailed:
			return "failed"
		default:
			return "completed"
		}
	default:
		return "connecting"
	}
}

func callDirection(c *call.CallInfo) string {
	if c != nil && c.Direction == core.CallDirectionIncoming {
		return "in"
	}
	return "out"
}

func (m *Manager) emitCallState(s *Session, c *call.CallInfo, recordID string, event string) {
	if s == nil || c == nil || s.StoreID == SupportSessionKey {
		return
	}
	jid, _ := types.ParseJID(c.PeerJid)
	phone := phoneForJID(s, jid)
	name := strings.TrimSpace(c.PeerName)
	if name == "" && !jid.IsEmpty() {
		name = m.whatsappContactName(s, jid, "")
	}
	payload := map[string]any{
		"call_id":          recordID,
		"external_call_id": c.CallID,
		"store_id":         s.StoreID,
		"remote_jid":       c.PeerJid,
		"phone":            phone,
		"display_name":     name,
		"direction":        callDirection(c),
		"status":           mapEngineStatus(c),
		"metadata": map[string]any{
			"engine":     "wamercio_embedded",
			"media_type": string(c.MediaType),
			"event":      event,
			"end_reason": string(c.StateData.EndReason),
		},
	}
	m.postCore("/api/v1/internal/calls/events", payload)
}

func (m *Manager) emitCallRecording(s *Session, c *call.CallInfo, recordID, recordingURL string) {
	if s == nil || c == nil || recordingURL == "" || s.StoreID == SupportSessionKey {
		return
	}
	jid, _ := types.ParseJID(c.PeerJid)
	m.postCore("/api/v1/internal/calls/events", map[string]any{
		"call_id":          recordID,
		"external_call_id": c.CallID,
		"store_id":         s.StoreID,
		"remote_jid":       c.PeerJid,
		"phone":            phoneForJID(s, jid),
		"display_name":     c.PeerName,
		"direction":        callDirection(c),
		"status":           mapEngineStatus(c),
		"recording_url":    recordingURL,
		"metadata": map[string]any{
			"engine":    "wamercio_embedded",
			"event":     "recording_ready",
			"recording": "stereo_pcm16_wav",
		},
	})
}

func (m *Manager) finalizeEmbeddedCall(s *Session, callID string, ac *activeCall, c *call.CallInfo, recordID, event string) {
	if s == nil || ac == nil || c == nil {
		return
	}
	snapshot := *c
	ac.terminalOnce.Do(func() {
		// Local teardown always wins over persistence. This mirrors Hierro del
		// Norte: a terminated call is removed from the live registry immediately,
		// so a slow webhook can never keep the dialer blocked or the browser audio
		// attached to a call that WhatsApp already ended.
		if s.callReg != nil {
			_, _ = s.callReg.remove(callID)
		}
		ac.mu.Lock()
		bridge := ac.bridge
		ac.bridge = nil
		recorder := ac.recorder
		ac.recorder = nil
		ac.mu.Unlock()
		if bridge != nil {
			bridge.Close()
		}
		// Persist terminal state asynchronously. The API has monotonic call-state
		// protection, so a delayed earlier callback cannot resurrect this call.
		go m.emitCallState(s, &snapshot, recordID, event)
		if recorder != nil {
			go func(rec *callRecorder, info *call.CallInfo) {
				url, err := rec.finalize()
				if err != nil {
					slog.Error("wamercio calls: no se pudo finalizar grabación", "store_id", s.StoreID, "call_id", callID, "err", err)
					return
				}
				if url != "" {
					m.emitCallRecording(s, info, recordID, url)
				}
			}(recorder, &snapshot)
		}
	})
}

func (m *Manager) createCallManager(s *Session, callID, recordID string) *call.CallManager {
	cm := call.NewCallManager(wacall.NewSocket(s.Client), slog.Default().With("service", "wamercio-calls", "store_id", s.StoreID, "call_id", callID))
	now := time.Now()
	ac := &activeCall{cm: cm, recordID: recordID, createdAt: now, lastActivity: now}
	settings := m.callSettingsForEngine(s.StoreID)
	if settings.Record {
		if recorder, err := newCallRecorder(m.uploadDir, s.StoreID, callID); err != nil {
			slog.Error("wamercio calls: no se pudo iniciar grabación", "store_id", s.StoreID, "call_id", callID, "err", err)
		} else {
			ac.recorder = recorder
		}
	}
	s.callReg.add(callID, ac)
	touch := func() {
		ac.mu.Lock()
		ac.lastActivity = time.Now()
		ac.mu.Unlock()
	}
	cm.OnIncoming = func(c *call.CallInfo) {
		touch()
		snapshot := *c
		go m.emitCallState(s, &snapshot, recordID, "incoming")
	}
	cm.OnStateChange = func(c *call.CallInfo) {
		touch()
		if c.IsEnded() {
			m.finalizeEmbeddedCall(s, callID, ac, c, recordID, "ended")
			return
		}
		// Never block whatsmeow's event path on the SaaS API. HDN keeps its
		// call registry lifecycle local for the same reason.
		snapshot := *c
		go m.emitCallState(s, &snapshot, recordID, "state")
	}
	cm.OnEnded = func(c *call.CallInfo) {
		touch()
		m.finalizeEmbeddedCall(s, callID, ac, c, recordID, "ended")
	}
	cm.OnPeerAudio = func(pcm []float32) {
		if s.callReg.isHeld(callID) {
			return
		}
		cur, ok := s.callReg.get(callID)
		if !ok {
			return
		}
		cur.mu.Lock()
		cur.lastActivity = time.Now()
		b := cur.bridge
		rec := cur.recorder
		cur.mu.Unlock()
		if rec != nil {
			rec.writePeer(pcm)
		}
		if b != nil {
			_ = b.WritePCM(pcm)
		}
	}
	return cm
}

func (m *Manager) watchEmbeddedCallSetup(s *Session, callID string, timeout time.Duration) {
	go func() {
		timer := time.NewTimer(timeout)
		defer timer.Stop()
		<-timer.C
		if s == nil || s.callReg == nil {
			return
		}
		ac, ok := s.callReg.get(callID)
		if !ok || ac == nil || ac.cm == nil {
			return
		}
		ci := ac.cm.CurrentCall()
		if ci == nil || ci.IsEnded() || ci.IsActive() || ci.StateData.State == core.CallStateOnHold {
			return
		}
		slog.Warn("wamercio calls: setup timeout; liberando llamada estancada", "store_id", s.StoreID, "call_id", callID, "state", string(ci.StateData.State))
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		_ = ac.cm.EndCall(ctx, core.EndCallReasonTimeout)
	}()
}

func (m *Manager) handleIncomingCallOffer(s *Session, evt *events.CallOffer) {
	if s == nil || evt == nil || s.callReg == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	node := wrapCall(evt.From, evt.Data)
	callID := callIDFromNode(node)
	if callID == "" {
		return
	}
	enabled, ringSeconds := m.callsEnabled(s.StoreID)
	if !enabled || s.callReg.count() >= m.maxCallsPerSession() {
		info := signaling.ExtractNodeInfo(node)
		if info != nil {
			creator := wanode.AttrString(info.InnerNode.Attrs, "call-creator")
			if creator == "" {
				creator = evt.From.String()
			}
			_ = wacall.NewSocket(s.Client).SendNode(ctx, signaling.BuildRejectStanza(evt.From, info.CallID, wanode.MustJID(creator)))
		}
		return
	}
	cm := m.createCallManager(s, callID, "")
	cm.HandleCallOffer(ctx, node, evt.From)
	go func() {
		t := time.NewTimer(time.Duration(ringSeconds) * time.Second)
		defer t.Stop()
		<-t.C
		ac, ok := s.callReg.get(callID)
		if !ok || ac == nil || ac.cm == nil {
			return
		}
		ci := ac.cm.CurrentCall()
		if ci != nil && ci.StateData.State == core.CallStateIncomingRinging {
			_ = ac.cm.RejectCall(context.Background(), callID, core.EndCallReasonTimeout)
		}
	}()
}

func (m *Manager) handleCallAccept(s *Session, evt *events.CallAccept) {
	if s == nil || evt == nil || s.callReg == nil {
		return
	}
	node := wrapCall(evt.From, evt.Data)
	if ac, ok := s.callReg.get(callIDFromNode(node)); ok {
		ac.cm.HandleCallAccept(context.Background(), node, evt.From)
	}
}
func (m *Manager) handleCallPreAccept(s *Session, evt *events.CallPreAccept) {
	if s == nil || evt == nil || s.callReg == nil {
		return
	}
	node := wrapCall(evt.From, evt.Data)
	if ac, ok := s.callReg.get(callIDFromNode(node)); ok {
		ac.cm.HandleCallPreAccept(context.Background(), node, evt.From)
	}
}
func (m *Manager) handleCallTransport(s *Session, evt *events.CallTransport) {
	if s == nil || evt == nil || s.callReg == nil {
		return
	}
	node := wrapCall(evt.From, evt.Data)
	if ac, ok := s.callReg.get(callIDFromNode(node)); ok {
		ac.cm.HandleCallTransport(context.Background(), node, evt.From)
	}
}
func (m *Manager) handleCallTerminate(s *Session, from types.JID, data *waBinary.Node) {
	if s == nil || s.callReg == nil {
		return
	}
	node := wrapCall(from, data)
	if ac, ok := s.callReg.get(callIDFromNode(node)); ok {
		ac.cm.HandleCallTerminate(node)
	}
}

func (m *Manager) handleCallsEngine(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/calls"), "/")
	if r.Method == http.MethodGet && path == "status" {
		m.callsEngineStatus(w, r)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Método no permitido"})
		return
	}
	if path == "" {
		m.startEmbeddedCall(w, r)
		return
	}
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Ruta de llamada inválida"})
		return
	}
	callID, action := parts[0], parts[1]
	if action == "webrtc" {
		m.attachEmbeddedWebRTC(w, r, callID)
		return
	}
	m.controlEmbeddedCall(w, r, callID, action)
}

func (m *Manager) callsEngineStatus(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "store_id es obligatorio"})
		return
	}
	m.mu.RLock()
	s := m.sessions[storeID]
	m.mu.RUnlock()
	connected := sessionLinked(s) && s.Client.IsConnected() && s.Client.IsLoggedIn()
	active := 0
	activeSnapshots := []engineCallSnapshot{}
	if s != nil && s.callReg != nil {
		activeSnapshots = s.callReg.snapshots()
		active = len(activeSnapshots)
	}
	minUDP, maxUDP, ranged := webrtcUDPRangeFromEnv()
	if !ranged {
		minUDP, maxUDP = 0, 0
	}
	cfg := m.callSettingsForEngine(storeID)
	writeJSON(w, http.StatusOK, map[string]any{
		"engine_embedded":               true,
		"session_connected":             connected,
		"calls_enabled":                 cfg.Enabled,
		"record_calls":                  cfg.Record,
		"transcribe_calls":              cfg.Transcribe,
		"active_calls":                  active,
		"active_call_snapshots":         activeSnapshots,
		"max_calls":                     m.maxCallsPerSession(),
		"webrtc_external_ip_configured": len(webrtcExternalIPsFromEnv()) > 0,
		"webrtc_udp_range_configured":   ranged,
		"webrtc_udp_port_min":           minUDP,
		"webrtc_udp_port_max":           maxUDP,
	})
}

func decodeLimitedJSON(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(v)
}

func (m *Manager) startEmbeddedCall(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CallID      string `json:"call_id"`
		StoreID     string `json:"store_id"`
		RemoteJID   string `json:"remote_jid"`
		Phone       string `json:"phone"`
		DisplayName string `json:"display_name"`
	}
	if decodeLimitedJSON(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.CallID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "store_id y call_id son obligatorios"})
		return
	}
	enabled, _ := m.callsEnabled(in.StoreID)
	if !enabled {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "WAMERCIO Calls no está activado para este negocio"})
		return
	}
	s, err := m.sessionForSend(in.StoreID)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	if s.callReg == nil {
		s.callReg = newCallRegistry()
	}
	if s.callReg.count() >= m.maxCallsPerSession() {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Se alcanzó el máximo de llamadas simultáneas para este negocio"})
		return
	}
	target := strings.TrimSpace(in.RemoteJID)
	if target == "" {
		target = in.Phone
	}
	peer := parseTarget(target)
	if peer.User == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "WhatsApp inválido"})
		return
	}
	externalCallID := signaling.GenerateCallID()
	cm := m.createCallManager(s, externalCallID, in.CallID)
	ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
	defer cancel()
	if err := cm.StartCall(ctx, externalCallID, peer, false); err != nil {
		if ac, ok := s.callReg.remove(externalCallID); ok {
			if ac.bridge != nil {
				ac.bridge.Close()
			}
			if ac.recorder != nil {
				_, _ = ac.recorder.finalize()
			}
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "WhatsApp no pudo iniciar la llamada: " + err.Error()})
		return
	}
	// HDN uses a setup watchdog so a lost accept/terminate callback can never
	// leave an outgoing call occupying the dialer forever.
	_, ringSeconds := m.callsEnabled(in.StoreID)
	setupTimeout := time.Duration(ringSeconds+10) * time.Second
	if setupTimeout < 35*time.Second {
		setupTimeout = 35 * time.Second
	}
	m.watchEmbeddedCallSetup(s, externalCallID, setupTimeout)
	m.touchSession(s)
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "external_call_id": externalCallID, "status": "ringing", "engine": "wamercio_embedded"})
}

func (m *Manager) locateActiveCall(storeID, callID string) (*Session, *activeCall, bool) {
	m.mu.RLock()
	s := m.sessions[storeID]
	m.mu.RUnlock()
	if s == nil || s.callReg == nil {
		return s, nil, false
	}
	ac, ok := s.callReg.get(callID)
	return s, ac, ok
}

func (m *Manager) controlEmbeddedCall(w http.ResponseWriter, r *http.Request, callID, action string) {
	var in struct {
		StoreID         string `json:"store_id"`
		AssignedStaffID string `json:"assigned_staff_id"`
	}
	if decodeLimitedJSON(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "store_id es obligatorio"})
		return
	}
	_, ac, ok := m.locateActiveCall(in.StoreID, callID)
	if !ok || ac == nil || ac.cm == nil {
		// Hangup/reject are idempotent from the operator's perspective. If the
		// engine already removed the call after a peer-side terminate, returning a
		// terminal success prevents the UI from getting stuck on an obsolete
		// ringing/active record. Other actions still require a live call.
		if action == "hangup" {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "completed", "external_call_id": callID, "engine": "wamercio_embedded", "idempotent": true})
			return
		}
		if action == "reject" {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "rejected", "external_call_id": callID, "engine": "wamercio_embedded", "idempotent": true})
			return
		}
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Llamada activa no encontrada"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	var err error
	switch action {
	case "answer":
		err = ac.cm.AcceptCall(ctx, callID)
	case "reject":
		err = ac.cm.RejectCall(ctx, callID, core.EndCallReasonDeclined)
	case "hangup":
		err = ac.cm.EndCall(ctx, core.EndCallReasonUserEnded)
	case "hold":
		err = ac.cm.Hold()
		if err == nil {
			ac.mu.Lock()
			ac.held = true
			ac.mu.Unlock()
		}
	case "resume":
		err = ac.cm.Resume()
		if err == nil {
			ac.mu.Lock()
			ac.held = false
			ac.mu.Unlock()
		}
	case "transfer":
		// Transfer is an ownership operation in WAMERCIO. The WhatsApp call
		// remains alive in this embedded engine; the destination agent opens a
		// new WebRTC browser leg and replaces the previous browser bridge.
		if strings.TrimSpace(in.AssignedStaffID) == "" {
			err = errors.New("selecciona el agente destino")
		}
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Acción de llamada no soportada"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	ci := ac.cm.CurrentCall()
	status := mapEngineStatus(ci)
	if action == "transfer" && status == "held" {
		status = "held"
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": status, "external_call_id": callID, "engine": "wamercio_embedded"})
}

func (m *Manager) attachEmbeddedWebRTC(w http.ResponseWriter, r *http.Request, callID string) {
	var in struct {
		StoreID  string `json:"store_id"`
		SDPOffer string `json:"sdp_offer"`
	}
	if decodeLimitedJSON(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.SDPOffer) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "store_id y sdp_offer son obligatorios"})
		return
	}
	s, ac, ok := m.locateActiveCall(in.StoreID, callID)
	if !ok || ac == nil || ac.cm == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Llamada activa no encontrada"})
		return
	}
	b, answer, err := newBrowserCallBridge(in.SDPOffer)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	b.OnBrowserPCM = func(pcm []float32) {
		ac.mu.RLock()
		held := ac.held
		rec := ac.recorder
		ac.mu.RUnlock()
		ci := ac.cm.CurrentCall()
		active := ci != nil && ci.StateData.State == core.CallStateActive
		if !held && active {
			if rec != nil {
				rec.writeMic(pcm)
			}
			ac.cm.FeedCapturedPCM(pcm)
		}
	}
	b.OnTerminal = func() {
		if s != nil && s.callReg != nil && s.callReg.clearBridgeIfMatch(callID, b) {
			b.Close()
		}
	}
	old, found := s.callReg.setBridge(callID, b)
	if !found {
		b.Close()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Llamada finalizada antes de conectar el audio"})
		return
	}
	if old != nil && old != b {
		old.Close()
	}
	writeJSON(w, http.StatusOK, map[string]any{"sdp_answer": answer, "external_call_id": callID, "engine": "wamercio_embedded"})
}
