package bridge

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
	"go.mau.fi/whatsmeow"
	waCompanionReg "go.mau.fi/whatsmeow/proto/waCompanionReg"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

type Session struct {
	StoreID string
	Client  *whatsmeow.Client
	Status  string
	QR      string
	Phone   string
	Updated time.Time
	stop    chan struct{}
}

type Manager struct {
	db              *sql.DB
	container       *sqlstore.Container
	coreURL, secret string
	http            *http.Client
	mu              sync.RWMutex
	sessions        map[string]*Session
}

func New(ctx context.Context, dbURL, coreURL, secret string) (*Manager, error) {
	// Brand new pairings as WAMERCIO so the WhatsApp Linked Devices screen
	// shows the product name instead of the underlying transport library.
	store.SetOSInfo("WAMERCIO", store.GetWAVersion())
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_DESKTOP.Enum()
	store.DeviceProps.RequireFullSync = proto.Bool(true)

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		return nil, err
	}
	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS whatsapp_bridge_sessions (store_id uuid PRIMARY KEY, jid text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`)
	if err != nil {
		return nil, err
	}
	container, err := sqlstore.New(ctx, "postgres", dbURL, nil)
	if err != nil {
		return nil, err
	}
	return &Manager{db: db, container: container, coreURL: strings.TrimRight(coreURL, "/"), secret: secret, http: &http.Client{Timeout: 12 * time.Second}, sessions: map[string]*Session{}}, nil
}
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.sessions {
		select {
		case <-s.stop:
		default:
			close(s.stop)
		}
		if s.Client != nil {
			s.Client.Disconnect()
		}
	}
	_ = m.container.Close()
	_ = m.db.Close()
}

func (m *Manager) Restore(ctx context.Context) error {
	rows, err := m.db.QueryContext(ctx, `SELECT store_id::text,jid FROM whatsapp_bridge_sessions`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var storeID, jidRaw string
		if rows.Scan(&storeID, &jidRaw) != nil {
			continue
		}
		jid, err := types.ParseJID(jidRaw)
		if err != nil {
			continue
		}
		dev, err := m.container.GetDevice(ctx, jid)
		if err != nil || dev == nil {
			continue
		}
		client := whatsmeow.NewClient(dev, nil)
		client.EnableAutoReconnect = true
		s := &Session{StoreID: storeID, Client: client, Status: "connecting", Updated: time.Now(), stop: make(chan struct{})}
		m.installHandler(s)
		m.mu.Lock()
		m.sessions[storeID] = s
		m.mu.Unlock()
		go func(ss *Session) {
			if err := ss.Client.Connect(); err != nil {
				m.setState(ss.StoreID, "disconnected", "")
			}
		}(s)
	}
	return rows.Err()
}

func (m *Manager) Router() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"ok": true, "service": "wamercio-whatsapp"})
	})
	mux.HandleFunc("/sessions/", m.handleSession)
	return m.auth(mux)
}
func (m *Manager) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" && r.Header.Get("X-Internal-Secret") != m.secret {
			writeJSON(w, 403, map[string]string{"error": "No autorizado"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (m *Manager) handleSession(w http.ResponseWriter, r *http.Request) {
	p := strings.TrimPrefix(r.URL.Path, "/sessions/")
	parts := strings.Split(strings.Trim(p, "/"), "/")
	if len(parts) < 2 {
		writeJSON(w, 404, map[string]string{"error": "Ruta inválida"})
		return
	}
	storeID, action := parts[0], parts[1]
	switch {
	case r.Method == "GET" && action == "status":
		m.status(w, storeID)
	case r.Method == "POST" && action == "connect":
		m.connect(w, r, storeID)
	case r.Method == "POST" && action == "disconnect":
		m.disconnect(w, r, storeID)
	case r.Method == "POST" && action == "messages":
		m.send(w, r, storeID)
	default:
		writeJSON(w, 404, map[string]string{"error": "Ruta inválida"})
	}
}
func (m *Manager) status(w http.ResponseWriter, storeID string) {
	m.mu.RLock()
	s := m.sessions[storeID]
	m.mu.RUnlock()
	if s == nil {
		writeJSON(w, 200, map[string]any{"status": "disconnected", "connected": false})
		return
	}
	writeJSON(w, 200, map[string]any{"status": s.Status, "connected": s.Client != nil && s.Client.IsConnected() && s.Client.IsLoggedIn(), "qr": s.QR, "phone": s.Phone, "updated_at": s.Updated})
}

func (m *Manager) connect(w http.ResponseWriter, r *http.Request, storeID string) {
	m.mu.RLock()
	existing := m.sessions[storeID]
	m.mu.RUnlock()
	if existing != nil && existing.Client != nil && existing.Client.IsLoggedIn() {
		if !existing.Client.IsConnected() {
			_ = existing.Client.Connect()
		}
		writeJSON(w, 200, map[string]any{"status": "connected", "connected": true})
		return
	}
	dev := m.container.NewDevice()
	client := whatsmeow.NewClient(dev, nil)
	client.EnableAutoReconnect = true
	s := &Session{StoreID: storeID, Client: client, Status: "starting", Updated: time.Now(), stop: make(chan struct{})}
	m.installHandler(s)
	m.mu.Lock()
	m.sessions[storeID] = s
	m.mu.Unlock()
	qrChan, err := client.GetQRChannel(context.Background())
	if err != nil {
		m.setState(storeID, "error", "")
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	go func() {
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				m.mu.Lock()
				if cur := m.sessions[storeID]; cur != nil {
					cur.QR = evt.Code
					cur.Status = "qr"
					cur.Updated = time.Now()
				}
				m.mu.Unlock()
			case "success":
				m.setState(storeID, "connected", "")
			case "timeout":
				m.setState(storeID, "timeout", "")
			default:
				log.Printf("whatsapp %s qr event: %s", storeID, evt.Event)
			}
		}
	}()
	if err := client.Connect(); err != nil {
		m.setState(storeID, "error", "")
		writeJSON(w, 502, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 202, map[string]any{"status": "starting", "message": "Escanea el QR cuando aparezca"})
}

func (m *Manager) installHandler(s *Session) {
	s.Client.AddEventHandler(func(evt any) {
		switch v := evt.(type) {
		case *events.Connected:
			m.setState(s.StoreID, "connected", "")
			// Keep the linked device visibly active without forcing the account to
			// appear online. Sending unavailable also publishes the push name.
			_ = s.Client.SendPresence(context.Background(), types.PresenceUnavailable)
			if s.Client.Store.ID != nil {
				jid := s.Client.Store.ID.String()
				_, _ = m.db.Exec(`INSERT INTO whatsapp_bridge_sessions(store_id,jid,updated_at) VALUES($1,$2,now()) ON CONFLICT(store_id) DO UPDATE SET jid=excluded.jid,updated_at=now()`, s.StoreID, jid)
				phone := s.Client.Store.ID.User
				m.mu.Lock()
				if cur := m.sessions[s.StoreID]; cur != nil {
					cur.Phone = phone
				}
				m.mu.Unlock()
				_, _ = m.db.Exec(`INSERT INTO whatsapp_sessions(store_id,jid,phone,status,last_seen_at,updated_at) VALUES($1,$2,$3,'connected',now(),now()) ON CONFLICT(store_id) DO UPDATE SET jid=excluded.jid,phone=excluded.phone,status='connected',last_seen_at=now(),updated_at=now()`, s.StoreID, jid, phone)
			}
		case *events.Disconnected:
			m.setState(s.StoreID, "disconnected", "")
			_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET status='disconnected',updated_at=now() WHERE store_id=$1`, s.StoreID)
		case *events.KeepAliveTimeout:
			if v.ErrorCount >= 2 && s.Client != nil && s.Client.IsLoggedIn() {
				go func() {
					s.Client.Disconnect()
					time.Sleep(1500 * time.Millisecond)
					_ = s.Client.Connect()
				}()
			}
		case *events.Message:
			m.forwardMessage(s.StoreID, v)
		}
	})
	go m.maintainSession(s)
}

func (m *Manager) maintainSession(s *Session) {
	// WhatsApp expires linked devices after long periods of inactivity. The
	// library already sends socket keep-alives; this low-frequency unavailable
	// presence also refreshes the companion activity without showing the user as online.
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if s.Client != nil && s.Client.IsConnected() && s.Client.IsLoggedIn() {
				_ = s.Client.SendPresence(context.Background(), types.PresenceUnavailable)
				_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET last_seen_at=now(),updated_at=now() WHERE store_id=$1`, s.StoreID)
				m.setState(s.StoreID, "connected", "")
			}
		case <-s.stop:
			return
		}
	}
}
func (m *Manager) setState(storeID, status, qr string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s := m.sessions[storeID]; s != nil {
		s.Status = status
		s.QR = qr
		s.Updated = time.Now()
	}
}
func (m *Manager) disconnect(w http.ResponseWriter, r *http.Request, storeID string) {
	m.mu.Lock()
	s := m.sessions[storeID]
	delete(m.sessions, storeID)
	m.mu.Unlock()
	if s != nil {
		select {
		case <-s.stop:
		default:
			close(s.stop)
		}
		if s.Client != nil {
			_ = s.Client.Logout(r.Context())
			s.Client.Disconnect()
		}
	}
	_, _ = m.db.ExecContext(r.Context(), `DELETE FROM whatsapp_bridge_sessions WHERE store_id=$1`, storeID)
	_, _ = m.db.ExecContext(r.Context(), `UPDATE whatsapp_sessions SET jid=NULL,phone=NULL,status='disconnected',updated_at=now() WHERE store_id=$1`, storeID)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

var nonDigits = regexp.MustCompile(`\D+`)

func phoneJID(phone string) types.JID {
	p := nonDigits.ReplaceAllString(phone, "")
	return types.NewJID(p, types.DefaultUserServer)
}
func (m *Manager) send(w http.ResponseWriter, r *http.Request, storeID string) {
	var in struct {
		To   string `json:"to"`
		Text string `json:"text"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&in) != nil || in.To == "" || in.Text == "" {
		writeJSON(w, 400, map[string]string{"error": "to y text son obligatorios"})
		return
	}
	m.mu.RLock()
	s := m.sessions[storeID]
	m.mu.RUnlock()
	if s == nil || s.Client == nil || !s.Client.IsLoggedIn() {
		writeJSON(w, 409, map[string]string{"error": "WhatsApp no está conectado"})
		return
	}
	if !s.Client.IsConnected() {
		if err := s.Client.Connect(); err != nil {
			writeJSON(w, 502, map[string]string{"error": "No se pudo reconectar"})
			return
		}
	}
	jid := phoneJID(in.To)
	if strings.Contains(in.To, "@") {
		if parsed, parseErr := types.ParseJID(in.To); parseErr == nil {
			jid = parsed
		}
	}
	resp, err := s.Client.SendMessage(r.Context(), jid, &waE2E.Message{Conversation: proto.String(in.Text)})
	if err != nil {
		writeJSON(w, 502, map[string]string{"error": err.Error()})
		return
	}
	_ = s.Client.SendPresence(context.Background(), types.PresenceUnavailable)
	_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET last_seen_at=now(),updated_at=now() WHERE store_id=$1`, storeID)
	writeJSON(w, 200, map[string]any{"ok": true, "id": resp.ID})
}

func messageText(v *events.Message) string {
	if v.Message == nil {
		return ""
	}
	if t := v.Message.GetConversation(); t != "" {
		return t
	}
	if x := v.Message.GetExtendedTextMessage(); x != nil {
		return x.GetText()
	}
	if x := v.Message.GetImageMessage(); x != nil {
		return x.GetCaption()
	}
	if x := v.Message.GetVideoMessage(); x != nil {
		return x.GetCaption()
	}
	return ""
}

func messageKind(v *events.Message) (string, string) {
	body := strings.TrimSpace(messageText(v))
	typ := strings.ToLower(strings.TrimSpace(v.Info.MediaType))
	if typ == "" {
		typ = strings.ToLower(strings.TrimSpace(v.Info.Type))
	}
	if typ == "" || typ == "chat" || typ == "text" || typ == "extendedtext" {
		typ = "text"
	}
	if body == "" {
		switch {
		case strings.Contains(typ, "image"):
			typ, body = "image", "Imagen"
		case strings.Contains(typ, "video"):
			typ, body = "video", "Video"
		case strings.Contains(typ, "audio") || strings.Contains(typ, "ptt"):
			typ, body = "audio", "Audio"
		case strings.Contains(typ, "document"):
			typ, body = "document", "Documento"
		case strings.Contains(typ, "sticker"):
			typ, body = "sticker", "Sticker"
		case strings.Contains(typ, "location"):
			typ, body = "location", "Ubicación"
		case strings.Contains(typ, "contact"):
			typ, body = "contact", "Contacto"
		case strings.Contains(typ, "reaction"):
			typ, body = "reaction", "Reacción"
		default:
			typ, body = "other", "Mensaje de WhatsApp"
		}
	}
	return typ, body
}

func directPhone(v *events.Message) string {
	if v.Info.IsGroup {
		return ""
	}
	for _, jid := range []types.JID{v.Info.Chat, v.Info.Sender, v.Info.SenderAlt} {
		if jid.Server == types.DefaultUserServer && jid.User != "" {
			return nonDigits.ReplaceAllString(jid.User, "")
		}
	}
	return ""
}

func (m *Manager) forwardMessage(storeID string, v *events.Message) {
	typ, body := messageKind(v)
	direction := "in"
	if v.Info.IsFromMe {
		direction = "out"
	}
	payload := map[string]any{
		"store_id": storeID, "remote_jid": v.Info.Chat.String(), "message_id": v.Info.ID,
		"body": body, "direction": direction, "type": typ, "display_name": v.Info.PushName,
		"phone": directPhone(v), "occurred_at": v.Info.Timestamp,
	}
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", m.coreURL+"/api/v1/internal/whatsapp/events", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Secret", m.secret)
	resp, err := m.http.Do(req)
	if err != nil {
		log.Printf("forward event: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		bb, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		log.Printf("forward event status %d: %s", resp.StatusCode, string(bb))
	}
}
