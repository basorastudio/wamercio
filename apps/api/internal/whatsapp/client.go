package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client implements the Waxum REST API documented by the project OpenAPI.
// Authentication is performed with the platform-level Superadmin bearer token;
// each SaaS tenant is isolated by its own Waxum session_id.
type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func New(base, token string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(base, "/"),
		Token:   strings.TrimSpace(token),
		HTTP:    &http.Client{Timeout: 20 * time.Second},
	}
}

func (c *Client) Configured() bool { return c.BaseURL != "" && c.Token != "" }

func (c *Client) do(ctx context.Context, method, path string, body, out any) (int, error) {
	if !c.Configured() {
		return 0, errors.New("Waxum no está configurado en la plataforma")
	}
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, reader)
	if err != nil {
		return 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(payload))
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return resp.StatusCode, fmt.Errorf("Waxum HTTP %d: %s", resp.StatusCode, msg)
	}
	if out != nil && len(payload) > 0 {
		if err := json.Unmarshal(payload, out); err != nil {
			return resp.StatusCode, fmt.Errorf("respuesta Waxum inválida: %w", err)
		}
	}
	return resp.StatusCode, nil
}

func sessionPath(sessionID, suffix string) string {
	return "/api/v1/sessions/" + url.PathEscape(sessionID) + suffix
}

type WebhookRequest struct {
	URL    string   `json:"url"`
	Events []string `json:"events,omitempty"`
	Secret string   `json:"secret,omitempty"`
}

type CreateSessionRequest struct {
	ID      string          `json:"id,omitempty"`
	Name    string          `json:"name,omitempty"`
	Reuse   bool            `json:"reuse,omitempty"`
	Webhook *WebhookRequest `json:"webhook,omitempty"`
}

type SessionInfo struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type CreateSessionResponse struct {
	Session SessionInfo `json:"session"`
}

type PairStatus struct {
	Code      any `json:"code,omitempty"`
	ExpiresAt any `json:"expires_at,omitempty"`
}

type SessionStatusResponse struct {
	Status       string     `json:"status"`
	IsLoggedIn   bool       `json:"is_logged_in"`
	SocketAlive  bool       `json:"socket_alive"`
	Paused       bool       `json:"paused"`
	PhoneNumber  string     `json:"phone_number,omitempty"`
	PushName     string     `json:"push_name,omitempty"`
	Reachability string     `json:"reachability,omitempty"`
	Pair         PairStatus `json:"pair"`
}

type QRCodeResponse struct {
	QRCodes        []string `json:"qr_codes"`
	TimeoutSeconds int64    `json:"timeout_seconds"`
	Status         string   `json:"status"`
}

type SendResponse struct {
	MessageID  string `json:"message_id,omitempty"`
	Status     string `json:"status,omitempty"`
	ScheduleID string `json:"schedule_id,omitempty"`
}

type QuickReplyButton struct {
	ID          string `json:"id"`
	DisplayText string `json:"display_text"`
}

type ListRow struct {
	RowID       string `json:"row_id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
}

type ListSection struct {
	Title string    `json:"title"`
	Rows  []ListRow `json:"rows"`
}

func (c *Client) CreateSession(ctx context.Context, in CreateSessionRequest) (CreateSessionResponse, int, error) {
	var out CreateSessionResponse
	status, err := c.do(ctx, http.MethodPost, "/api/v1/sessions", in, &out)
	return out, status, err
}

func (c *Client) GetSession(ctx context.Context, sessionID string) (SessionInfo, int, error) {
	var out SessionInfo
	status, err := c.do(ctx, http.MethodGet, sessionPath(sessionID, ""), nil, &out)
	return out, status, err
}

func (c *Client) Connect(ctx context.Context, sessionID string) error {
	_, err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/connect"), map[string]any{}, nil)
	// Already connected is a successful state for our SaaS.
	if err != nil && strings.Contains(err.Error(), "HTTP 409") {
		return nil
	}
	return err
}

func (c *Client) Disconnect(ctx context.Context, sessionID string) error {
	_, err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/disconnect"), nil, nil)
	return err
}

func (c *Client) DeleteSession(ctx context.Context, sessionID string) error {
	_, err := c.do(ctx, http.MethodDelete, sessionPath(sessionID, ""), nil, nil)
	return err
}

func (c *Client) Status(ctx context.Context, sessionID string) (SessionStatusResponse, error) {
	var out SessionStatusResponse
	_, err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/status"), nil, &out)
	return out, err
}

func (c *Client) QR(ctx context.Context, sessionID string) (QRCodeResponse, error) {
	var out QRCodeResponse
	_, err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/qr"), nil, &out)
	return out, err
}

func (c *Client) RegisterWebhook(ctx context.Context, sessionID string, in WebhookRequest) error {
	_, err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/webhooks"), in, nil)
	if err != nil && strings.Contains(err.Error(), "HTTP 409") {
		return nil
	}
	return err
}

func (c *Client) SendText(ctx context.Context, sessionID, to, text string) (SendResponse, error) {
	var out SendResponse
	_, err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/messages/text"), map[string]any{
		"to": NormalizeRecipient(to), "text": text,
	}, &out)
	return out, err
}

func (c *Client) SendQuickReply(ctx context.Context, sessionID, to, body, footer string, buttons []QuickReplyButton) (SendResponse, error) {
	var out SendResponse
	payload := map[string]any{"to": NormalizeRecipient(to), "body_text": body, "buttons": buttons}
	if strings.TrimSpace(footer) != "" {
		payload["footer_text"] = footer
	}
	_, err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/messages/quick-reply"), payload, &out)
	return out, err
}

func (c *Client) SendList(ctx context.Context, sessionID, to, title, description, buttonText, footer string, sections []ListSection) (SendResponse, error) {
	var out SendResponse
	payload := map[string]any{
		"to": NormalizeRecipient(to), "title": title, "description": description,
		"button_text": buttonText, "sections": sections,
	}
	if strings.TrimSpace(footer) != "" {
		payload["footer"] = footer
	}
	_, err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/messages/list"), payload, &out)
	return out, err
}

func (c *Client) SendCTAURL(ctx context.Context, sessionID, to, displayText, targetURL, header, body, footer, imageURL string) (SendResponse, error) {
	var out SendResponse
	payload := map[string]any{
		"to": NormalizeRecipient(to), "display_text": displayText, "url": targetURL,
		"body_text": body,
	}
	if strings.TrimSpace(header) != "" {
		payload["header_text"] = header
	}
	if strings.TrimSpace(footer) != "" {
		payload["footer_text"] = footer
	}
	if strings.TrimSpace(imageURL) != "" {
		payload["image"] = map[string]string{"url": imageURL}
	}
	_, err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/messages/cta-url"), payload, &out)
	return out, err
}

// NormalizeRecipient converts Dominican/local phone formats to Waxum's JID format.
// Existing JIDs are returned unchanged.
func NormalizeRecipient(v string) string {
	v = strings.TrimSpace(v)
	if strings.Contains(v, "@") {
		return v
	}
	var digits strings.Builder
	for _, r := range v {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	d := digits.String()
	if len(d) == 10 && (strings.HasPrefix(d, "809") || strings.HasPrefix(d, "829") || strings.HasPrefix(d, "849")) {
		d = "1" + d
	}
	return d + "@s.whatsapp.net"
}
