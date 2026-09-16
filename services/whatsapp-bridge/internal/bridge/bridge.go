package bridge

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
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

const SupportSessionKey = "support"

type Session struct {
	StoreID  string
	Client   *whatsmeow.Client
	Status   string
	QR       string
	Phone    string
	Updated  time.Time
	stop     chan struct{}
	qrCancel context.CancelFunc
}

type historySyncJob struct {
	From         time.Time
	To           time.Time
	LastActivity time.Time
}

type historySyncPolicyConfig struct {
	Mode string
	From time.Time
	To   time.Time
}

type Manager struct {
	db              *sql.DB
	container       *sqlstore.Container
	coreURL, secret string
	uploadDir       string
	http            *http.Client
	mu              sync.RWMutex
	sessions        map[string]*Session
	profileMu       sync.Mutex
	profileRefresh  map[string]time.Time
	profileSem      chan struct{}
	historyMu       sync.Mutex
	historyJobs     map[string]*historySyncJob
}

func New(ctx context.Context, dbURL, coreURL, secret, uploadDir string) (*Manager, error) {
	store.SetOSInfo("WAMERCIO", store.GetWAVersion())
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_DESKTOP.Enum()
	store.DeviceProps.RequireFullSync = proto.Bool(false)

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		return nil, err
	}
	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}
	// v2 uses a text session key so the SaaS support number can coexist with store UUID sessions.
	if _, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS whatsapp_bridge_sessions_v2 (session_key text PRIMARY KEY, jid text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return nil, err
	}
	// Preserve legacy store mappings created before 1.7.
	_, _ = db.ExecContext(ctx, `DO $$ BEGIN IF to_regclass('public.whatsapp_bridge_sessions') IS NOT NULL THEN INSERT INTO whatsapp_bridge_sessions_v2(session_key,jid,updated_at) SELECT store_id::text,jid,updated_at FROM whatsapp_bridge_sessions ON CONFLICT(session_key) DO NOTHING; END IF; END $$;`)
	container, err := sqlstore.New(ctx, "postgres", dbURL, nil)
	if err != nil {
		return nil, err
	}
	if uploadDir == "" {
		uploadDir = "/app/data/uploads"
	}
	_ = os.MkdirAll(filepath.Join(uploadDir, "whatsapp"), 0755)
	return &Manager{db: db, container: container, coreURL: strings.TrimRight(coreURL, "/"), secret: secret, uploadDir: uploadDir, http: &http.Client{Timeout: 45 * time.Second}, sessions: map[string]*Session{}, profileRefresh: map[string]time.Time{}, profileSem: make(chan struct{}, 4), historyJobs: map[string]*historySyncJob{}}, nil
}

func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.sessions {
		if s.qrCancel != nil {
			s.qrCancel()
		}
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

func configureClient(client *whatsmeow.Client) {
	client.EnableAutoReconnect = true
	client.InitialAutoReconnect = true
	client.AutomaticMessageRerequestFromPhone = true
	client.AutoTrustIdentity = true
	client.EnableDecryptedEventBuffer = true
	client.UseRetryMessageStore = true
}

func sessionLinked(s *Session) bool {
	return s != nil && s.Client != nil && s.Client.Store != nil && s.Client.Store.ID != nil && s.Status != "logged_out"
}

func isDirectUserJID(jid types.JID) bool {
	jid = jid.ToNonAD()
	if jid.User == "" {
		return false
	}
	return jid.Server == types.DefaultUserServer || jid.Server == types.HiddenUserServer
}

func isDirectUserMessage(v *events.Message) bool {
	return v != nil && !v.Info.IsGroup && isDirectUserJID(v.Info.Chat)
}

func (m *Manager) isCurrentSession(s *Session) bool {
	if s == nil {
		return false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[s.StoreID] == s
}

func (m *Manager) stopLocalSession(s *Session, logout bool, ctx context.Context) {
	if s == nil {
		return
	}
	if s.qrCancel != nil {
		s.qrCancel()
	}
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
	if s.Client != nil {
		if logout {
			_ = s.Client.Logout(ctx)
		}
		s.Client.Disconnect()
	}
}

func (m *Manager) Restore(ctx context.Context) error {
	rows, err := m.db.QueryContext(ctx, `SELECT session_key,jid FROM whatsapp_bridge_sessions_v2`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var sessionKey, jidRaw string
		if rows.Scan(&sessionKey, &jidRaw) != nil {
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
		configureClient(client)
		s := &Session{StoreID: sessionKey, Client: client, Status: "connecting", Updated: time.Now(), stop: make(chan struct{})}
		m.installHandler(s)
		m.mu.Lock()
		m.sessions[sessionKey] = s
		m.mu.Unlock()
		go func(ss *Session) {
			if err := ss.Client.Connect(); err != nil {
				m.setSessionState(ss, "reconnecting", "")
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
	sessionKey, action := parts[0], parts[1]
	switch {
	case r.Method == "GET" && action == "status":
		m.status(w, sessionKey)
	case r.Method == "POST" && action == "connect":
		m.connect(w, r, sessionKey)
	case r.Method == "POST" && action == "disconnect":
		m.disconnect(w, r, sessionKey)
	case r.Method == "POST" && action == "check":
		m.checkNumber(w, r, sessionKey)
	case r.Method == "POST" && action == "profile":
		m.resolveProfile(w, r, sessionKey)
	case r.Method == "POST" && action == "messages":
		m.send(w, r, sessionKey)
	case r.Method == "POST" && action == "media":
		m.sendMedia(w, r, sessionKey)
	case r.Method == "POST" && action == "read":
		m.markRead(w, r, sessionKey)
	case r.Method == "POST" && action == "history-sync":
		m.manualHistorySync(w, r, sessionKey)
	default:
		writeJSON(w, 404, map[string]string{"error": "Ruta inválida"})
	}
}
func (m *Manager) linkedAccountMetadata(sessionKey string) (phone, name, pictureURL, pictureID string) {
	if sessionKey == SupportSessionKey {
		_ = m.db.QueryRow(`SELECT coalesce(whatsapp,''),coalesce(whatsapp_name,''),coalesce(profile_picture_url,''),coalesce(profile_picture_id,'') FROM support_whatsapp_session WHERE singleton=true`).Scan(&phone, &name, &pictureURL, &pictureID)
		return
	}
	_ = m.db.QueryRow(`SELECT coalesce(phone,''),coalesce(whatsapp_name,''),coalesce(profile_picture_url,''),coalesce(profile_picture_id,'') FROM whatsapp_sessions WHERE store_id=$1`, sessionKey).Scan(&phone, &name, &pictureURL, &pictureID)
	return
}

func (m *Manager) refreshLinkedAccountProfile(s *Session) {
	if !sessionLinked(s) || s.Client == nil || s.Client.Store == nil || s.Client.Store.ID == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	jid := s.Client.Store.ID.ToNonAD()
	name := strings.TrimSpace(s.Client.Store.BusinessName)
	if name == "" {
		name = strings.TrimSpace(s.Client.Store.PushName)
	}
	if name == "" {
		name = m.whatsappContactName(s, jid, "")
	}
	pictureURL, pictureID := "", ""
	if pic, err := s.Client.GetProfilePictureInfo(ctx, jid, &whatsmeow.GetProfilePictureParams{Preview: true}); err == nil && pic != nil && strings.TrimSpace(pic.URL) != "" {
		if localURL, saveErr := m.persistProfilePicture(s.StoreID, jid, pic.URL); saveErr == nil {
			pictureURL = localURL
			pictureID = pic.ID
		}
	}
	if s.StoreID == SupportSessionKey {
		_, _ = m.db.Exec(`UPDATE support_whatsapp_session SET whatsapp_name=coalesce(nullif($1,''),whatsapp_name),profile_picture_url=coalesce(nullif($2,''),profile_picture_url),profile_picture_id=coalesce(nullif($3,''),profile_picture_id),profile_picture_updated_at=now(),updated_at=now() WHERE singleton=true`, name, pictureURL, pictureID)
	} else {
		_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET whatsapp_name=coalesce(nullif($1,''),whatsapp_name),profile_picture_url=coalesce(nullif($2,''),profile_picture_url),profile_picture_id=coalesce(nullif($3,''),profile_picture_id),profile_picture_updated_at=now(),updated_at=now() WHERE store_id=$4`, name, pictureURL, pictureID, s.StoreID)
	}
}

func (m *Manager) status(w http.ResponseWriter, sessionKey string) {
	m.mu.RLock()
	s := m.sessions[sessionKey]
	m.mu.RUnlock()
	storedPhone, profileName, profilePictureURL, profilePictureID := m.linkedAccountMetadata(sessionKey)
	if s == nil {
		var jid string
		if err := m.db.QueryRow(`SELECT jid FROM whatsapp_bridge_sessions_v2 WHERE session_key=$1`, sessionKey).Scan(&jid); err == nil && jid != "" {
			writeJSON(w, 200, map[string]any{"status": "reconnecting", "connected": false, "linked": true, "phone": storedPhone, "whatsapp_name": profileName, "profile_picture_url": profilePictureURL, "profile_picture_id": profilePictureID})
			return
		}
		writeJSON(w, 200, map[string]any{"status": "disconnected", "connected": false, "linked": false, "phone": storedPhone, "whatsapp_name": profileName, "profile_picture_url": profilePictureURL, "profile_picture_id": profilePictureID})
		return
	}
	linked := sessionLinked(s)
	connected := linked && s.Client.IsConnected() && s.Client.IsLoggedIn()
	status := s.Status
	if connected {
		status = "connected"
	} else if linked && status != "logged_out" {
		status = "reconnecting"
	}
	phone := s.Phone
	if phone == "" {
		phone = storedPhone
	}
	if connected && profileName == "" && profilePictureURL == "" {
		m.refreshLinkedAccountProfile(s)
		storedPhone, profileName, profilePictureURL, profilePictureID = m.linkedAccountMetadata(sessionKey)
		if phone == "" {
			phone = storedPhone
		}
	}
	writeJSON(w, 200, map[string]any{"status": status, "connected": connected, "linked": linked, "qr": s.QR, "phone": phone, "whatsapp_name": profileName, "profile_picture_url": profilePictureURL, "profile_picture_id": profilePictureID, "updated_at": s.Updated})
}

func (m *Manager) connect(w http.ResponseWriter, r *http.Request, sessionKey string) {
	m.mu.RLock()
	existing := m.sessions[sessionKey]
	m.mu.RUnlock()
	if sessionLinked(existing) {
		connected := existing.Client.IsConnected() && existing.Client.IsLoggedIn()
		if !connected {
			m.setSessionState(existing, "reconnecting", "")
			go func(ss *Session) {
				if err := ss.Client.Connect(); err != nil {
					m.setSessionState(ss, "reconnecting", "")
				}
			}(existing)
		}
		writeJSON(w, 200, map[string]any{"status": map[bool]string{true: "connected", false: "reconnecting"}[connected], "connected": connected, "linked": true})
		return
	}
	if existing != nil {
		m.stopLocalSession(existing, false, r.Context())
	}
	dev := m.container.NewDevice()
	client := whatsmeow.NewClient(dev, nil)
	configureClient(client)
	qrCtx, qrCancel := context.WithCancel(context.Background())
	s := &Session{StoreID: sessionKey, Client: client, Status: "starting", Updated: time.Now(), stop: make(chan struct{}), qrCancel: qrCancel}
	m.installHandler(s)
	m.mu.Lock()
	m.sessions[sessionKey] = s
	m.mu.Unlock()
	qrChan, err := client.GetQRChannel(qrCtx)
	if err != nil {
		qrCancel()
		m.setSessionState(s, "error", "")
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	go func(ss *Session) {
		for evt := range qrChan {
			if !m.isCurrentSession(ss) {
				return
			}
			switch evt.Event {
			case "code":
				m.setSessionState(ss, "qr", evt.Code)
			case "success":
				m.setSessionState(ss, "connecting", "")
			case "timeout":
				m.setSessionState(ss, "timeout", "")
			default:
				log.Printf("whatsapp %s qr event: %s", sessionKey, evt.Event)
			}
		}
	}(s)
	if err := client.Connect(); err != nil {
		m.setSessionState(s, "error", "")
		writeJSON(w, 502, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 202, map[string]any{"status": "starting", "connected": false, "linked": false, "message": "Escanea el QR cuando aparezca"})
}

func (m *Manager) installHandler(s *Session) {
	s.Client.AddEventHandler(func(evt any) {
		switch v := evt.(type) {
		case *events.Connected:
			m.onConnected(s)
		case *events.Disconnected:
			if !m.setSessionState(s, "reconnecting", "") {
				return
			}
			if s.StoreID == SupportSessionKey {
				_, _ = m.db.Exec(`UPDATE support_whatsapp_session SET status='reconnecting',updated_at=now() WHERE singleton=true`)
			} else {
				_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET status='reconnecting',updated_at=now() WHERE store_id=$1`, s.StoreID)
			}
		case *events.KeepAliveTimeout:
			if v.ErrorCount >= 2 && s.Client != nil && sessionLinked(s) {
				go s.Client.ResetConnection()
			}
		case *events.KeepAliveRestored:
			if m.isCurrentSession(s) {
				m.touchSession(s)
			}
		case *events.Message:
			m.forwardMessage(s, v)
		case *events.Receipt:
			if m.isCurrentSession(s) {
				m.forwardReceipt(s.StoreID, v)
			}
		case *events.HistorySync:
			go m.forwardHistory(s, v)
		case *events.Picture:
			if m.isCurrentSession(s) && isDirectUserJID(v.JID) {
				m.invalidateContactProfile(s, v.JID)
				m.queueContactProfile(s, v.JID, phoneForJID(s, v.JID), "")
			}
		case *events.LoggedOut:
			m.markLoggedOut(s)
		}
	})
	go m.maintainSession(s)
}

func (m *Manager) onConnected(s *Session) {
	if !m.setSessionState(s, "connected", "") {
		return
	}
	m.mu.Lock()
	if m.sessions[s.StoreID] == s && s.qrCancel != nil {
		s.qrCancel()
		s.qrCancel = nil
	}
	m.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	// Reinforce the non-passive companion state after every connection. A very short
	// availability pulse registers the reconnect as active device traffic, then the
	// session returns to unavailable so the merchant is not shown permanently online.
	_ = s.Client.SetPassive(ctx, false)
	// Keep delivery acknowledgements active even though the companion normally
	// stays unavailable in the background. This mirrors a healthy linked device
	// without advertising the merchant as permanently online.
	s.Client.SetForceActiveDeliveryReceipts(true)
	// A short availability pulse on connect/reconnect registers real companion
	// activity with WhatsApp; immediately return to unavailable to preserve phone
	// notifications and normal background semantics.
	_ = s.Client.SendPresence(ctx, types.PresenceAvailable)
	go func(client *whatsmeow.Client) {
		time.Sleep(750 * time.Millisecond)
		pctx, pcancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer pcancel()
		_ = client.SendPresence(pctx, types.PresenceUnavailable)
	}(s.Client)
	if s.Client.Store.ID == nil {
		return
	}
	jid := s.Client.Store.ID.String()
	phone := s.Client.Store.ID.User
	_, _ = m.db.Exec(`INSERT INTO whatsapp_bridge_sessions_v2(session_key,jid,updated_at) VALUES($1,$2,now()) ON CONFLICT(session_key) DO UPDATE SET jid=excluded.jid,updated_at=now()`, s.StoreID, jid)
	m.mu.Lock()
	if cur := m.sessions[s.StoreID]; cur != nil {
		cur.Phone = phone
	}
	m.mu.Unlock()
	if s.StoreID == SupportSessionKey {
		_, _ = m.db.Exec(`INSERT INTO support_whatsapp_session(singleton,jid,whatsapp,status,last_seen_at,updated_at) VALUES(true,$1,$2,'connected',now(),now()) ON CONFLICT(singleton) DO UPDATE SET jid=excluded.jid,whatsapp=excluded.whatsapp,status='connected',last_seen_at=now(),updated_at=now()`, jid, phone)
	} else {
		_, _ = m.db.Exec(`INSERT INTO whatsapp_sessions(store_id,jid,phone,status,last_seen_at,updated_at) VALUES($1,$2,$3,'connected',now(),now()) ON CONFLICT(store_id) DO UPDATE SET jid=excluded.jid,phone=excluded.phone,status='connected',last_seen_at=now(),updated_at=now()`, s.StoreID, jid, phone)
	}
	go m.refreshLinkedAccountProfile(s)
}

func (m *Manager) maintainSession(s *Session) {
	// Periodically refresh the companion's active/non-passive state while keeping
	// user presence unavailable. Socket keep-alives are handled by whatsmeow.
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if s.Client != nil && s.Client.IsConnected() && s.Client.IsLoggedIn() {
				ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
				_ = s.Client.SetPassive(ctx, false)
				s.Client.SetForceActiveDeliveryReceipts(true)
				_ = s.Client.SendPresence(ctx, types.PresenceUnavailable)
				cancel()
				m.touchSession(s)
				m.setSessionState(s, "connected", "")
			}
		case <-s.stop:
			return
		}
	}
}
func (m *Manager) touchSession(s *Session) {
	if s.StoreID == SupportSessionKey {
		_, _ = m.db.Exec(`UPDATE support_whatsapp_session SET last_seen_at=now(),updated_at=now(),status='connected' WHERE singleton=true`)
	} else {
		_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET last_seen_at=now(),updated_at=now(),status='connected' WHERE store_id=$1`, s.StoreID)
	}
}
func (m *Manager) setSessionState(s *Session, status, qr string) bool {
	if s == nil {
		return false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.sessions[s.StoreID] != s {
		return false
	}
	s.Status = status
	s.QR = qr
	s.Updated = time.Now()
	return true
}

func (m *Manager) markLoggedOut(s *Session) {
	if !m.setSessionState(s, "logged_out", "") {
		return
	}
	m.mu.Lock()
	if m.sessions[s.StoreID] == s {
		s.Phone = ""
	}
	m.mu.Unlock()
	_, _ = m.db.Exec(`DELETE FROM whatsapp_bridge_sessions_v2 WHERE session_key=$1`, s.StoreID)
	if s.StoreID == SupportSessionKey {
		_, _ = m.db.Exec(`UPDATE support_whatsapp_session SET jid=NULL,whatsapp=NULL,status='disconnected',updated_at=now() WHERE singleton=true`)
	} else {
		_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET jid=NULL,phone=NULL,status='disconnected',updated_at=now() WHERE store_id=$1`, s.StoreID)
	}
}

func (m *Manager) disconnect(w http.ResponseWriter, r *http.Request, sessionKey string) {
	m.mu.Lock()
	s := m.sessions[sessionKey]
	delete(m.sessions, sessionKey)
	m.mu.Unlock()
	if s != nil {
		m.stopLocalSession(s, true, r.Context())
	}
	_, _ = m.db.ExecContext(r.Context(), `DELETE FROM whatsapp_bridge_sessions_v2 WHERE session_key=$1`, sessionKey)
	if sessionKey == SupportSessionKey {
		_, _ = m.db.ExecContext(r.Context(), `UPDATE support_whatsapp_session SET jid=NULL,whatsapp=NULL,status='disconnected',updated_at=now() WHERE singleton=true`)
	} else {
		_, _ = m.db.ExecContext(r.Context(), `UPDATE whatsapp_sessions SET jid=NULL,phone=NULL,status='disconnected',updated_at=now() WHERE store_id=$1`, sessionKey)
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

var nonDigits = regexp.MustCompile(`\D+`)
var unsafeFile = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func phoneJID(phone string) types.JID {
	p := nonDigits.ReplaceAllString(phone, "")
	return types.NewJID(p, types.DefaultUserServer)
}
func (m *Manager) checkNumber(w http.ResponseWriter, r *http.Request, sessionKey string) {
	var in struct {
		Phone string `json:"phone"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&in) != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "phone es obligatorio"})
		return
	}
	digits := nonDigits.ReplaceAllString(in.Phone, "")
	if len(digits) < 8 || len(digits) > 15 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Número de WhatsApp inválido"})
		return
	}
	s, err := m.sessionForSend(sessionKey)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	results, err := s.Client.IsOnWhatsApp(ctx, []string{"+" + digits})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "No se pudo validar el número en WhatsApp: " + err.Error()})
		return
	}
	registered := false
	jid := ""
	query := "+" + digits
	if len(results) > 0 {
		registered = results[0].IsIn
		query = results[0].Query
		if !results[0].JID.IsEmpty() {
			jid = results[0].JID.String()
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"registered": registered,
		"phone":      "+" + digits,
		"query":      query,
		"jid":        jid,
	})
}

func (m *Manager) resolveProfile(w http.ResponseWriter, r *http.Request, sessionKey string) {
	var in struct {
		Phone string `json:"phone"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&in) != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "phone es obligatorio"})
		return
	}
	digits := nonDigits.ReplaceAllString(in.Phone, "")
	if len(digits) < 8 || len(digits) > 15 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Número de WhatsApp inválido"})
		return
	}
	s, err := m.sessionForSend(sessionKey)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	results, err := s.Client.IsOnWhatsApp(ctx, []string{"+" + digits})
	if err != nil || len(results) == 0 || !results[0].IsIn || results[0].JID.IsEmpty() {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "El número no está disponible en WhatsApp"})
		return
	}
	jid := results[0].JID.ToNonAD()
	name := m.whatsappContactName(s, jid, "")
	out := map[string]any{
		"ok":                  true,
		"phone":               digits,
		"jid":                 jid.String(),
		"whatsapp_name":       name,
		"profile_picture_url": "",
		"profile_picture_id":  "",
		"picture_available":   false,
	}
	pic, picErr := s.Client.GetProfilePictureInfo(ctx, jid, &whatsmeow.GetProfilePictureParams{Preview: true})
	if picErr == nil && pic != nil && strings.TrimSpace(pic.URL) != "" {
		if localURL, saveErr := m.persistProfilePicture(sessionKey, jid, pic.URL); saveErr == nil {
			out["profile_picture_url"] = localURL
			out["profile_picture_id"] = pic.ID
			out["picture_available"] = true
		}
	}
	m.touchSession(s)
	writeJSON(w, http.StatusOK, out)
}

func (m *Manager) sessionForSend(sessionKey string) (*Session, error) {
	m.mu.RLock()
	s := m.sessions[sessionKey]
	m.mu.RUnlock()
	if s == nil || s.Client == nil || !s.Client.IsLoggedIn() {
		return nil, fmt.Errorf("WhatsApp no está conectado")
	}
	if !s.Client.IsConnected() {
		if err := s.Client.Connect(); err != nil {
			return nil, fmt.Errorf("no se pudo reconectar: %w", err)
		}
	}
	return s, nil
}
func parseTarget(raw string) types.JID {
	jid := phoneJID(raw)
	if strings.Contains(raw, "@") {
		if parsed, err := types.ParseJID(raw); err == nil {
			jid = parsed
		}
	}
	return jid
}
func (m *Manager) send(w http.ResponseWriter, r *http.Request, sessionKey string) {
	var in struct {
		To   string `json:"to"`
		Text string `json:"text"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&in) != nil || in.To == "" || in.Text == "" {
		writeJSON(w, 400, map[string]string{"error": "to y text son obligatorios"})
		return
	}
	s, err := m.sessionForSend(sessionKey)
	if err != nil {
		writeJSON(w, 409, map[string]string{"error": err.Error()})
		return
	}
	resp, err := s.Client.SendMessage(r.Context(), parseTarget(in.To), &waE2E.Message{Conversation: proto.String(in.Text)})
	if err != nil {
		writeJSON(w, 502, map[string]string{"error": err.Error()})
		return
	}
	m.touchSession(s)
	writeJSON(w, 200, map[string]any{"ok": true, "id": resp.ID})
}

func (m *Manager) markRead(w http.ResponseWriter, r *http.Request, sessionKey string) {
	var in struct {
		Chat       string   `json:"chat"`
		MessageIDs []string `json:"message_ids"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&in) != nil || strings.TrimSpace(in.Chat) == "" || len(in.MessageIDs) == 0 {
		writeJSON(w, 400, map[string]string{"error": "chat y message_ids son obligatorios"})
		return
	}
	s, err := m.sessionForSend(sessionKey)
	if err != nil {
		writeJSON(w, 409, map[string]string{"error": err.Error()})
		return
	}
	ids := make([]types.MessageID, 0, len(in.MessageIDs))
	for _, id := range in.MessageIDs {
		if strings.TrimSpace(id) != "" {
			ids = append(ids, types.MessageID(id))
		}
	}
	if len(ids) == 0 {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	chat := parseTarget(in.Chat)
	if err := s.Client.MarkRead(r.Context(), ids, time.Now(), chat, types.EmptyJID); err != nil {
		writeJSON(w, 502, map[string]string{"error": err.Error()})
		return
	}
	m.touchSession(s)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (m *Manager) sendMedia(w http.ResponseWriter, r *http.Request, sessionKey string) {
	s, err := m.sessionForSend(sessionKey)
	if err != nil {
		writeJSON(w, 409, map[string]string{"error": err.Error()})
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeJSON(w, 400, map[string]string{"error": "Archivo inválido o demasiado grande"})
		return
	}
	to := strings.TrimSpace(r.FormValue("to"))
	caption := strings.TrimSpace(r.FormValue("caption"))
	if to == "" {
		writeJSON(w, 400, map[string]string{"error": "Destino obligatorio"})
		return
	}
	f, h, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": "Archivo obligatorio"})
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 32<<20))
	if err != nil || len(data) == 0 {
		writeJSON(w, 400, map[string]string{"error": "No se pudo leer el archivo"})
		return
	}
	mimeType := strings.TrimSpace(r.FormValue("mime_type"))
	if mimeType == "" {
		mimeType = h.Header.Get("Content-Type")
	}
	kind, mediaType := outgoingMediaType(mimeType, h.Filename)
	up, err := s.Client.Upload(r.Context(), data, mediaType)
	if err != nil {
		writeJSON(w, 502, map[string]string{"error": "No se pudo subir el archivo a WhatsApp"})
		return
	}
	msg := &waE2E.Message{}
	switch kind {
	case "image":
		msg.ImageMessage = &waE2E.ImageMessage{Caption: proto.String(caption), Mimetype: proto.String(mimeType), URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey, FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: &up.FileLength}
	case "video":
		msg.VideoMessage = &waE2E.VideoMessage{Caption: proto.String(caption), Mimetype: proto.String(mimeType), URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey, FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: &up.FileLength}
	case "audio":
		ptt := strings.Contains(strings.ToLower(mimeType), "ogg") || strings.Contains(strings.ToLower(mimeType), "opus")
		msg.AudioMessage = &waE2E.AudioMessage{Mimetype: proto.String(mimeType), PTT: proto.Bool(ptt), URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey, FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: &up.FileLength}
	default:
		msg.DocumentMessage = &waE2E.DocumentMessage{Mimetype: proto.String(mimeType), FileName: proto.String(h.Filename), Caption: proto.String(caption), URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey, FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: &up.FileLength}
	}
	resp, err := s.Client.SendMessage(r.Context(), parseTarget(to), msg)
	if err != nil {
		writeJSON(w, 502, map[string]string{"error": err.Error()})
		return
	}
	localURL, _ := m.persistOutgoingMedia(sessionKey, string(resp.ID), kind, mimeType, h.Filename, data)
	m.touchSession(s)
	writeJSON(w, 200, map[string]any{"ok": true, "id": resp.ID, "type": kind, "media_url": localURL, "mime_type": mimeType, "file_name": h.Filename, "caption": caption})
}

func outgoingMediaType(mimeType, name string) (string, whatsmeow.MediaType) {
	m := strings.ToLower(mimeType)
	ext := strings.ToLower(filepath.Ext(name))
	switch {
	case strings.HasPrefix(m, "image/"):
		return "image", whatsmeow.MediaImage
	case strings.HasPrefix(m, "video/"):
		return "video", whatsmeow.MediaVideo
	case strings.HasPrefix(m, "audio/"):
		return "audio", whatsmeow.MediaAudio
	case ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".gif":
		return "image", whatsmeow.MediaImage
	case ext == ".mp4" || ext == ".mov" || ext == ".webm":
		return "video", whatsmeow.MediaVideo
	case ext == ".mp3" || ext == ".ogg" || ext == ".opus" || ext == ".m4a" || ext == ".wav":
		return "audio", whatsmeow.MediaAudio
	default:
		return "document", whatsmeow.MediaDocument
	}
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
	if x := v.Message.GetDocumentMessage(); x != nil {
		return x.GetCaption()
	}
	if x := v.Message.GetReactionMessage(); x != nil {
		return x.GetText()
	}
	if x := v.Message.GetButtonsMessage(); x != nil {
		return fallback(x.GetContentText(), x.GetText())
	}
	if x := v.Message.GetButtonsResponseMessage(); x != nil {
		return fallback(x.GetSelectedDisplayText(), x.GetSelectedButtonID())
	}
	if x := v.Message.GetListMessage(); x != nil {
		return fallback(x.GetTitle(), fallback(x.GetDescription(), x.GetButtonText()))
	}
	if x := v.Message.GetListResponseMessage(); x != nil {
		return fallback(x.GetTitle(), x.GetDescription())
	}
	if x := v.Message.GetInteractiveMessage(); x != nil && x.GetBody() != nil {
		return x.GetBody().GetText()
	}
	if x := v.Message.GetInteractiveResponseMessage(); x != nil && x.GetBody() != nil {
		return x.GetBody().GetText()
	}
	if x := v.Message.GetProductMessage(); x != nil {
		return fallback(x.GetBody(), "Producto")
	}
	if x := v.Message.GetOrderMessage(); x != nil {
		return fallback(x.GetOrderTitle(), fallback(x.GetMessage(), "Pedido de WhatsApp"))
	}
	if x := v.Message.GetEventMessage(); x != nil {
		return fallback(x.GetName(), x.GetDescription())
	}
	if x := v.Message.GetInvoiceMessage(); x != nil {
		return fallback(x.GetNote(), "Factura")
	}
	return ""
}

func pollV4Name(wrapper *waE2E.FutureProofMessage) string {
	if wrapper == nil || wrapper.GetMessage() == nil {
		return "Encuesta"
	}
	inner := wrapper.GetMessage()
	if x := inner.GetPollCreationMessage(); x != nil {
		return fallback(x.GetName(), "Encuesta")
	}
	if x := inner.GetPollCreationMessageV2(); x != nil {
		return fallback(x.GetName(), "Encuesta")
	}
	if x := inner.GetPollCreationMessageV3(); x != nil {
		return fallback(x.GetName(), "Encuesta")
	}
	if x := inner.GetPollCreationMessageV5(); x != nil {
		return fallback(x.GetName(), "Encuesta")
	}
	if x := inner.GetPollCreationMessageV6(); x != nil {
		return fallback(x.GetName(), "Encuesta")
	}
	return "Encuesta"
}

type mediaMeta struct {
	Type     string
	Body     string
	URL      string
	MimeType string
	FileName string
	FileSize int64
	Caption  string
}

func (m *Manager) extractMedia(s *Session, v *events.Message) mediaMeta {
	meta := mediaMeta{Type: "text", Body: strings.TrimSpace(messageText(v))}
	if v.Message == nil {
		return meta
	}
	var dl whatsmeow.DownloadableMessage
	switch {
	case v.Message.GetImageMessage() != nil:
		x := v.Message.GetImageMessage()
		meta.Type = "image"
		if x.GetViewOnce() {
			meta.Type = "view_once_image"
		}
		meta.Caption = x.GetCaption()
		meta.Body = fallback(meta.Caption, "Imagen")
		meta.MimeType = x.GetMimetype()
		meta.FileSize = int64(x.GetFileLength())
		dl = x
	case v.Message.GetVideoMessage() != nil:
		x := v.Message.GetVideoMessage()
		meta.Type = "video"
		if x.GetGifPlayback() {
			meta.Type = "gif"
		}
		if x.GetViewOnce() {
			meta.Type = "view_once_" + meta.Type
		}
		meta.Caption = x.GetCaption()
		meta.Body = fallback(meta.Caption, "Video")
		meta.MimeType = x.GetMimetype()
		meta.FileSize = int64(x.GetFileLength())
		dl = x
	case v.Message.GetPtvMessage() != nil:
		x := v.Message.GetPtvMessage()
		meta.Type = "ptv"
		meta.Body = "Video circular"
		meta.MimeType = x.GetMimetype()
		meta.FileSize = int64(x.GetFileLength())
		dl = x
	case v.Message.GetAudioMessage() != nil:
		x := v.Message.GetAudioMessage()
		meta.Type = "audio"
		meta.Body = "Audio"
		if x.GetPTT() {
			meta.Type = "ptt"
			meta.Body = "Nota de voz"
		}
		if x.GetViewOnce() {
			meta.Type = "view_once_" + meta.Type
		}
		meta.MimeType = x.GetMimetype()
		meta.FileSize = int64(x.GetFileLength())
		dl = x
	case v.Message.GetDocumentMessage() != nil:
		x := v.Message.GetDocumentMessage()
		meta.Type = "document"
		meta.Caption = x.GetCaption()
		meta.FileName = x.GetFileName()
		meta.Body = fallback(meta.Caption, fallback(meta.FileName, "Documento"))
		meta.MimeType = x.GetMimetype()
		meta.FileSize = int64(x.GetFileLength())
		dl = x
	case v.Message.GetStickerMessage() != nil:
		x := v.Message.GetStickerMessage()
		meta.Type = "sticker"
		meta.Body = "Sticker"
		meta.MimeType = x.GetMimetype()
		meta.FileSize = int64(x.GetFileLength())
		dl = x
	case v.Message.GetLocationMessage() != nil:
		x := v.Message.GetLocationMessage()
		meta.Type = "location"
		meta.Body = fmt.Sprintf("Ubicación · %.6f, %.6f", x.GetDegreesLatitude(), x.GetDegreesLongitude())
	case v.Message.GetLiveLocationMessage() != nil:
		x := v.Message.GetLiveLocationMessage()
		meta.Type = "live_location"
		meta.Body = fmt.Sprintf("Ubicación en vivo · %.6f, %.6f", x.GetDegreesLatitude(), x.GetDegreesLongitude())
	case v.Message.GetContactMessage() != nil:
		x := v.Message.GetContactMessage()
		meta.Type = "contact"
		meta.Body = fallback(x.GetDisplayName(), "Contacto")
	case v.Message.GetContactsArrayMessage() != nil:
		meta.Type = "contacts_array"
		meta.Body = "Contactos"
	case v.Message.GetReactionMessage() != nil:
		meta.Type = "reaction"
		meta.Body = fallback(v.Message.GetReactionMessage().GetText(), "Reacción")
	case v.Message.GetPollCreationMessage() != nil:
		meta.Type = "poll"
		meta.Body = fallback(v.Message.GetPollCreationMessage().GetName(), "Encuesta")
	case v.Message.GetPollCreationMessageV2() != nil:
		meta.Type = "poll"
		meta.Body = fallback(v.Message.GetPollCreationMessageV2().GetName(), "Encuesta")
	case v.Message.GetPollCreationMessageV3() != nil:
		meta.Type = "poll"
		meta.Body = fallback(v.Message.GetPollCreationMessageV3().GetName(), "Encuesta")
	case v.Message.GetPollCreationMessageV4() != nil:
		meta.Type = "poll"
		meta.Body = pollV4Name(v.Message.GetPollCreationMessageV4())
	case v.Message.GetPollCreationMessageV5() != nil:
		meta.Type = "poll"
		meta.Body = fallback(v.Message.GetPollCreationMessageV5().GetName(), "Encuesta")
	case v.Message.GetPollCreationMessageV6() != nil:
		meta.Type = "poll"
		meta.Body = fallback(v.Message.GetPollCreationMessageV6().GetName(), "Encuesta")
	case v.Message.GetPollUpdateMessage() != nil:
		meta.Type = "poll_vote"
		meta.Body = "Voto en encuesta"
	case v.Message.GetButtonsMessage() != nil:
		meta.Type = "buttons"
		meta.Body = fallback(messageText(v), "Mensaje con botones")
	case v.Message.GetButtonsResponseMessage() != nil:
		meta.Type = "buttons_response"
		meta.Body = fallback(messageText(v), "Respuesta de botón")
	case v.Message.GetListMessage() != nil:
		meta.Type = "list"
		meta.Body = fallback(messageText(v), "Lista de opciones")
	case v.Message.GetListResponseMessage() != nil:
		meta.Type = "list_response"
		meta.Body = fallback(messageText(v), "Respuesta de lista")
	case v.Message.GetInteractiveMessage() != nil:
		meta.Type = "interactive"
		meta.Body = fallback(messageText(v), "Mensaje interactivo")
	case v.Message.GetInteractiveResponseMessage() != nil:
		meta.Type = "interactive_response"
		meta.Body = fallback(messageText(v), "Respuesta interactiva")
	case v.Message.GetProductMessage() != nil:
		meta.Type = "product"
		meta.Body = fallback(messageText(v), "Producto")
	case v.Message.GetOrderMessage() != nil:
		meta.Type = "order"
		meta.Body = fallback(messageText(v), "Pedido de WhatsApp")
	case v.Message.GetEventMessage() != nil:
		meta.Type = "event"
		meta.Body = fallback(messageText(v), "Evento")
	case v.Message.GetInvoiceMessage() != nil:
		meta.Type = "invoice"
		meta.Body = fallback(messageText(v), "Factura")
	default:
		if meta.Body == "" {
			meta.Type = "other"
			meta.Body = "Mensaje de WhatsApp"
		}
	}
	if dl != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
		data, err := s.Client.Download(ctx, dl)
		cancel()
		if err != nil {
			log.Printf("media download %s/%s: %v", s.StoreID, v.Info.ID, err)
			return meta
		}
		url, name, err := m.persistMedia(s.StoreID, string(v.Info.ID), meta.Type, meta.MimeType, meta.FileName, data)
		if err != nil {
			log.Printf("media persist %s/%s: %v", s.StoreID, v.Info.ID, err)
		} else {
			meta.URL = url
			meta.FileName = name
			meta.FileSize = int64(len(data))
		}
	}
	return meta
}

func fallback(v, d string) string {
	if strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return d
}
func mediaExt(kind, mimeType, fileName string) string {
	if ext := strings.ToLower(filepath.Ext(fileName)); ext != "" && len(ext) <= 8 {
		return ext
	}
	m := strings.ToLower(strings.Split(mimeType, ";")[0])
	known := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4", "video/webm": ".webm", "audio/ogg": ".ogg", "audio/opus": ".opus", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "application/pdf": ".pdf"}
	if x := known[m]; x != "" {
		return x
	}
	switch kind {
	case "image":
		return ".jpg"
	case "video":
		return ".mp4"
	case "audio":
		return ".ogg"
	case "sticker":
		return ".webp"
	default:
		return ".bin"
	}
}
func (m *Manager) persistMedia(sessionKey, messageID, kind, mimeType, fileName string, data []byte) (string, string, error) {
	dirKey := unsafeFile.ReplaceAllString(sessionKey, "_")
	dir := filepath.Join(m.uploadDir, "whatsapp", dirKey)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", "", err
	}
	ext := mediaExt(kind, mimeType, fileName)
	base := unsafeFile.ReplaceAllString(messageID, "_") + ext
	path := filepath.Join(dir, base)
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", "", err
	}
	return "/media/whatsapp/" + dirKey + "/" + base, fallback(fileName, base), nil
}
func (m *Manager) persistOutgoingMedia(sessionKey, messageID, kind, mimeType, fileName string, data []byte) (string, string) {
	u, n, err := m.persistMedia(sessionKey, messageID, kind, mimeType, fileName, data)
	if err != nil {
		return "", ""
	}
	return u, n
}

func phoneForJID(s *Session, jid types.JID) string {
	jid = jid.ToNonAD()
	if jid.Server == types.DefaultUserServer && jid.User != "" {
		return nonDigits.ReplaceAllString(jid.User, "")
	}
	if jid.Server == types.HiddenUserServer && s != nil && s.Client != nil && s.Client.Store != nil && s.Client.Store.LIDs != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		pn, err := s.Client.Store.LIDs.GetPNForLID(ctx, jid)
		cancel()
		if err == nil && !pn.IsEmpty() && pn.User != "" {
			return nonDigits.ReplaceAllString(pn.User, "")
		}
	}
	return ""
}

func skipOwnPhone(ownPhone, candidatePhone string) bool {
	ownPhone = nonDigits.ReplaceAllString(ownPhone, "")
	candidatePhone = nonDigits.ReplaceAllString(candidatePhone, "")
	return ownPhone != "" && candidatePhone != "" && ownPhone == candidatePhone
}

func sessionOwnPhone(s *Session) string {
	if s == nil || s.Client == nil || s.Client.Store == nil || s.Client.Store.ID == nil {
		return ""
	}
	return phoneForJID(s, s.Client.Store.ID.ToNonAD())
}

func isOwnConversationJID(s *Session, jid types.JID) bool {
	if s == nil || s.Client == nil || s.Client.Store == nil || s.Client.Store.ID == nil {
		return false
	}
	jid = jid.ToNonAD()
	ownJID := s.Client.Store.ID.ToNonAD()
	if jid.String() == ownJID.String() {
		return true
	}
	return skipOwnPhone(sessionOwnPhone(s), phoneForJID(s, jid))
}

func directPhone(s *Session, v *events.Message) string {
	if v == nil || v.Info.IsGroup {
		return ""
	}
	ownPhone := sessionOwnPhone(s)
	for _, jid := range []types.JID{v.Info.Chat, v.Info.Sender, v.Info.SenderAlt} {
		phone := phoneForJID(s, jid)
		if phone == "" || skipOwnPhone(ownPhone, phone) {
			continue
		}
		return phone
	}
	return ""
}

func (m *Manager) profileTargetJID(s *Session, jid types.JID) types.JID {
	jid = jid.ToNonAD()
	if jid.Server == types.HiddenUserServer && s != nil && s.Client != nil && s.Client.Store != nil && s.Client.Store.LIDs != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		pn, err := s.Client.Store.LIDs.GetPNForLID(ctx, jid)
		cancel()
		if err == nil && !pn.IsEmpty() {
			return pn.ToNonAD()
		}
	}
	return jid
}

func (m *Manager) whatsappContactName(s *Session, jid types.JID, fallbackName string) string {
	fallbackName = strings.TrimSpace(fallbackName)
	if s == nil || s.Client == nil || s.Client.Store == nil || s.Client.Store.Contacts == nil {
		return fallbackName
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	candidates := []types.JID{jid.ToNonAD()}
	target := m.profileTargetJID(s, jid)
	if target.String() != candidates[0].String() {
		candidates = append(candidates, target)
	}
	for _, candidate := range candidates {
		info, err := s.Client.Store.Contacts.GetContact(ctx, candidate)
		if err != nil || !info.Found {
			continue
		}
		for _, name := range []string{info.BusinessName, info.PushName, info.FullName, info.FirstName} {
			if strings.TrimSpace(name) != "" {
				return strings.TrimSpace(name)
			}
		}
	}
	return fallbackName
}

func (m *Manager) profileRefreshKey(s *Session, jid types.JID) string {
	if s == nil {
		return jid.ToNonAD().String()
	}
	return s.StoreID + "|" + jid.ToNonAD().String()
}

func (m *Manager) invalidateContactProfile(s *Session, jid types.JID) {
	m.profileMu.Lock()
	delete(m.profileRefresh, m.profileRefreshKey(s, jid))
	m.profileMu.Unlock()
}

func (m *Manager) queueContactProfile(s *Session, jid types.JID, phone, fallbackName string) {
	if s == nil || s.StoreID == SupportSessionKey || !m.isCurrentSession(s) || !isDirectUserJID(jid) {
		return
	}
	key := m.profileRefreshKey(s, jid)
	m.profileMu.Lock()
	if last, ok := m.profileRefresh[key]; ok && time.Since(last) < 6*time.Hour {
		m.profileMu.Unlock()
		return
	}
	m.profileRefresh[key] = time.Now()
	m.profileMu.Unlock()
	go func() {
		m.profileSem <- struct{}{}
		defer func() { <-m.profileSem }()
		if !m.isCurrentSession(s) {
			return
		}
		m.refreshContactProfile(s, jid.ToNonAD(), phone, fallbackName)
	}()
}

func (m *Manager) refreshContactProfile(s *Session, conversationJID types.JID, phone, fallbackName string) {
	if !m.isCurrentSession(s) || s.Client == nil {
		return
	}
	name := m.whatsappContactName(s, conversationJID, fallbackName)
	if phone == "" {
		phone = phoneForJID(s, conversationJID)
	}
	payload := map[string]any{
		"store_id": s.StoreID, "remote_jid": conversationJID.String(), "phone": phone, "whatsapp_name": name,
		"profile_picture_url": "", "profile_picture_id": "",
	}
	target := m.profileTargetJID(s, conversationJID)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	pic, err := s.Client.GetProfilePictureInfo(ctx, target, &whatsmeow.GetProfilePictureParams{Preview: true})
	cancel()
	if err == nil && pic != nil && strings.TrimSpace(pic.URL) != "" {
		if localURL, err := m.persistProfilePicture(s.StoreID, conversationJID, pic.URL); err == nil {
			payload["profile_picture_url"] = localURL
			payload["profile_picture_id"] = pic.ID
		}
	}
	m.postCore("/api/v1/internal/whatsapp/profile", payload)
}

func (m *Manager) persistProfilePicture(sessionKey string, jid types.JID, sourceURL string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := m.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("perfil HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil || len(data) == 0 {
		return "", fmt.Errorf("perfil vacío")
	}
	dirKey := unsafeFile.ReplaceAllString(sessionKey, "_")
	dir := filepath.Join(m.uploadDir, "whatsapp", dirKey, "profiles")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	userKey := unsafeFile.ReplaceAllString(jid.ToNonAD().User, "_")
	if userKey == "" {
		userKey = "contact"
	}
	base := userKey + ".jpg"
	if err := os.WriteFile(filepath.Join(dir, base), data, 0644); err != nil {
		return "", err
	}
	return "/media/whatsapp/" + dirKey + "/profiles/" + base, nil
}

func (m *Manager) forwardMessage(s *Session, v *events.Message) {
	if !m.isCurrentSession(s) || !isDirectUserMessage(v) || isOwnConversationJID(s, v.Info.Chat) {
		return
	}
	meta := m.extractMedia(s, v)
	direction := "in"
	if v.Info.IsFromMe {
		direction = "out"
	}
	phone := directPhone(s, v)
	whatsappName := m.whatsappContactName(s, v.Info.Chat, v.Info.PushName)
	payload := map[string]any{
		"store_id": s.StoreID, "session_key": s.StoreID, "remote_jid": v.Info.Chat.String(), "message_id": v.Info.ID,
		"body": meta.Body, "direction": direction, "type": meta.Type, "display_name": whatsappName,
		"phone": phone, "occurred_at": v.Info.Timestamp, "media_url": meta.URL, "mime_type": meta.MimeType,
		"file_name": meta.FileName, "file_size": meta.FileSize, "caption": meta.Caption,
	}
	m.postCore("/api/v1/internal/whatsapp/events", payload)
	m.queueContactProfile(s, v.Info.Chat, phone, whatsappName)
	m.touchSession(s)
}
func (m *Manager) forwardReceipt(sessionKey string, v *events.Receipt) {
	ids := make([]string, 0, len(v.MessageIDs))
	for _, id := range v.MessageIDs {
		ids = append(ids, string(id))
	}
	m.postCore("/api/v1/internal/whatsapp/receipts", map[string]any{"session_key": sessionKey, "message_ids": ids, "type": string(v.Type), "occurred_at": v.Timestamp})
}
func parseSyncDate(value string, endOfDay bool) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, nil
	}
	t, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, err
	}
	if endOfDay {
		t = t.Add(24*time.Hour - time.Nanosecond)
	}
	return t, nil
}

func historyMessageAllowed(ts, from, to time.Time) bool {
	if ts.IsZero() {
		return false
	}
	if !from.IsZero() && ts.Before(from) {
		return false
	}
	if !to.IsZero() && ts.After(to) {
		return false
	}
	return true
}

func (m *Manager) historySyncPolicy(sessionKey string) historySyncPolicyConfig {
	// The global support account has no per-store configuration. Keep it conservative
	// instead of silently importing an unlimited archive.
	if sessionKey == SupportSessionKey {
		now := time.Now().UTC()
		return historySyncPolicyConfig{Mode: "automatic", From: now.AddDate(0, 0, -30), To: now}
	}
	var mode string
	var fromSQL, toSQL sql.NullTime
	if err := m.db.QueryRow(`SELECT coalesce(history_sync_mode,'manual'),history_sync_from,history_sync_to FROM whatsapp_sessions WHERE store_id=$1`, sessionKey).Scan(&mode, &fromSQL, &toSQL); err != nil {
		return historySyncPolicyConfig{Mode: "manual"}
	}
	cfg := historySyncPolicyConfig{Mode: strings.ToLower(strings.TrimSpace(mode))}
	if cfg.Mode == "auto" {
		cfg.Mode = "automatic"
	}
	if cfg.Mode != "automatic" {
		cfg.Mode = "manual"
	}
	if fromSQL.Valid {
		cfg.From = fromSQL.Time
	}
	if toSQL.Valid {
		cfg.To = toSQL.Time.Add(24*time.Hour - time.Nanosecond)
	}
	return cfg
}

func (m *Manager) saveHistoryAnchor(sessionKey string, evt *events.Message) {
	if evt == nil || !isDirectUserMessage(evt) || evt.Info.ID == "" || evt.Info.Timestamp.IsZero() {
		return
	}
	_, _ = m.db.Exec(`INSERT INTO whatsapp_history_anchors(session_key,chat_jid,message_id,message_timestamp,from_me,updated_at)
		VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(session_key,chat_jid) DO UPDATE SET
		message_id=excluded.message_id,message_timestamp=excluded.message_timestamp,from_me=excluded.from_me,updated_at=now()
		WHERE whatsapp_history_anchors.message_timestamp < excluded.message_timestamp`, sessionKey, evt.Info.Chat.ToNonAD().String(), evt.Info.ID, evt.Info.Timestamp, evt.Info.IsFromMe)
}

func (m *Manager) currentHistoryJob(sessionKey string) *historySyncJob {
	m.historyMu.Lock()
	defer m.historyMu.Unlock()
	job := m.historyJobs[sessionKey]
	if job == nil {
		return nil
	}
	copy := *job
	return &copy
}

func (m *Manager) touchHistoryJob(sessionKey string) {
	m.historyMu.Lock()
	if job := m.historyJobs[sessionKey]; job != nil {
		job.LastActivity = time.Now()
	}
	m.historyMu.Unlock()
}

func (m *Manager) requestOlderHistory(s *Session, evt *events.Message) {
	if s == nil || evt == nil || s.Client == nil || evt.Info.ID == "" || evt.Info.Timestamp.IsZero() {
		return
	}
	info := &types.MessageInfo{
		MessageSource: types.MessageSource{Chat: evt.Info.Chat.ToNonAD(), IsFromMe: evt.Info.IsFromMe},
		ID:            evt.Info.ID, Timestamp: evt.Info.Timestamp,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if _, err := s.Client.SendPeerMessage(ctx, s.Client.BuildHistorySyncRequest(info, 50)); err != nil {
		log.Printf("whatsapp %s history request for %s: %v", s.StoreID, info.Chat, err)
	}
}

func (m *Manager) finishHistorySyncWhenIdle(sessionKey string) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		m.historyMu.Lock()
		job := m.historyJobs[sessionKey]
		if job == nil {
			m.historyMu.Unlock()
			return
		}
		idle := time.Since(job.LastActivity)
		if idle < 12*time.Second {
			m.historyMu.Unlock()
			continue
		}
		delete(m.historyJobs, sessionKey)
		m.historyMu.Unlock()
		_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET history_sync_status='completed',history_sync_last_at=now(),history_sync_error=null,updated_at=now() WHERE store_id=$1`, sessionKey)
		return
	}
}

func (m *Manager) manualHistorySync(w http.ResponseWriter, r *http.Request, sessionKey string) {
	m.mu.RLock()
	s := m.sessions[sessionKey]
	m.mu.RUnlock()
	if !sessionLinked(s) || s.Client == nil || !s.Client.IsConnected() || !s.Client.IsLoggedIn() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "El dispositivo de WhatsApp debe estar conectado"})
		return
	}
	var in struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	from, err := parseSyncDate(in.From, false)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Fecha desde inválida"})
		return
	}
	to, err := parseSyncDate(in.To, true)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Fecha hasta inválida"})
		return
	}
	if from.IsZero() || to.IsZero() || to.Before(from) || to.Sub(from) > 367*24*time.Hour {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Selecciona un rango válido de hasta 366 días"})
		return
	}
	rows, err := m.db.Query(`SELECT chat_jid,message_id,message_timestamp,from_me FROM whatsapp_history_anchors WHERE session_key=$1 ORDER BY message_timestamp DESC`, sessionKey)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "No se pudo consultar el historial disponible"})
		return
	}
	defer rows.Close()
	type anchor struct {
		jid    string
		id     string
		ts     time.Time
		fromMe bool
	}
	anchors := []anchor{}
	for rows.Next() {
		var a anchor
		if rows.Scan(&a.jid, &a.id, &a.ts, &a.fromMe) == nil {
			anchors = append(anchors, a)
		}
	}
	if len(anchors) == 0 {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "WhatsApp todavía no ha entregado referencias de historial. Espera unos segundos y vuelve a intentar."})
		return
	}
	m.historyMu.Lock()
	m.historyJobs[sessionKey] = &historySyncJob{From: from, To: to, LastActivity: time.Now()}
	m.historyMu.Unlock()
	_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET history_sync_status='running',history_sync_error=null,updated_at=now() WHERE store_id=$1`, sessionKey)
	sent := 0
	for _, a := range anchors {
		jid, err := types.ParseJID(a.jid)
		if err != nil || !isDirectUserJID(jid) {
			continue
		}
		info := &types.MessageInfo{MessageSource: types.MessageSource{Chat: jid.ToNonAD(), IsFromMe: a.fromMe}, ID: a.id, Timestamp: a.ts}
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		_, sendErr := s.Client.SendPeerMessage(ctx, s.Client.BuildHistorySyncRequest(info, 50))
		cancel()
		if sendErr == nil {
			sent++
		}
	}
	if sent == 0 {
		m.historyMu.Lock()
		delete(m.historyJobs, sessionKey)
		m.historyMu.Unlock()
		_, _ = m.db.Exec(`UPDATE whatsapp_sessions SET history_sync_status='error',history_sync_error='No se pudo solicitar el historial',updated_at=now() WHERE store_id=$1`, sessionKey)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "No se pudo solicitar el historial a WhatsApp"})
		return
	}
	go m.finishHistorySyncWhenIdle(sessionKey)
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "running", "chats": sent})
}

func (m *Manager) forwardHistory(s *Session, v *events.HistorySync) {
	if !m.isCurrentSession(s) || v == nil || v.Data == nil {
		return
	}
	policy := m.historySyncPolicy(s.StoreID)
	job := m.currentHistoryJob(s.StoreID)
	isOnDemand := strings.EqualFold(v.Data.GetSyncType().String(), "ON_DEMAND")
	if isOnDemand && job != nil {
		m.touchHistoryJob(s.StoreID)
	}
	for _, conv := range v.Data.GetConversations() {
		jid, err := types.ParseJID(conv.GetID())
		if err != nil || !isDirectUserJID(jid) {
			continue
		}
		var oldest *events.Message
		for _, hm := range conv.GetMessages() {
			evt, err := s.Client.ParseWebMessage(jid, hm.GetMessage())
			if err != nil || evt == nil || !isDirectUserMessage(evt) {
				continue
			}
			m.saveHistoryAnchor(s.StoreID, evt)
			if oldest == nil || evt.Info.Timestamp.Before(oldest.Info.Timestamp) {
				oldest = evt
			}
			allowed := false
			if isOnDemand && job != nil {
				allowed = historyMessageAllowed(evt.Info.Timestamp, job.From, job.To)
			} else if policy.Mode == "automatic" {
				allowed = historyMessageAllowed(evt.Info.Timestamp, policy.From, policy.To)
			}
			if allowed {
				m.forwardMessage(s, evt)
			}
		}
		if oldest != nil {
			if isOnDemand && job != nil && oldest.Info.Timestamp.After(job.From) {
				go m.requestOlderHistory(s, oldest)
			} else if policy.Mode == "automatic" && !policy.From.IsZero() && oldest.Info.Timestamp.After(policy.From) {
				// Automatic history import is also bounded by the configured date range.
				// Page backwards only until the lower bound is reached.
				go m.requestOlderHistory(s, oldest)
			}
		}
	}
}
func (m *Manager) postCore(path string, payload any) {
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", m.coreURL+path, bytes.NewReader(b))
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
