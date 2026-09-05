package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
)

type WaxumIntegration struct {
	Enabled      bool   `json:"enabled"`
	SessionID    string `json:"session_id"`
	WebhookToken string `json:"webhook_token"`
	PhoneNumber  string `json:"phone_number,omitempty"`
	PushName     string `json:"push_name,omitempty"`
	LastStatus   string `json:"last_status,omitempty"`
}

func (s *Store) WaxumIntegration(ctx context.Context, tenantID string) (WaxumIntegration, error) {
	var enabled bool
	var raw []byte
	err := s.DB.QueryRow(ctx, `SELECT enabled,config_json FROM tenant_integrations WHERE tenant_id=$1 AND provider='waxum'`, tenantID).Scan(&enabled, &raw)
	if err != nil {
		return WaxumIntegration{}, err
	}
	var x WaxumIntegration
	_ = json.Unmarshal(raw, &x)
	x.Enabled = enabled
	return x, nil
}

func (s *Store) SaveWaxumIntegration(ctx context.Context, tenantID string, x WaxumIntegration) error {
	raw, _ := json.Marshal(x)
	_, err := s.DB.Exec(ctx, `INSERT INTO tenant_integrations(tenant_id,provider,enabled,config_json,updated_at)
		VALUES($1,'waxum',$2,$3,now())
		ON CONFLICT(tenant_id,provider) DO UPDATE SET enabled=excluded.enabled,config_json=excluded.config_json,updated_at=now()`, tenantID, x.Enabled, raw)
	return err
}

func (s *Store) TenantIdentity(ctx context.Context, tenantID string) (name, slug string, err error) {
	err = s.DB.QueryRow(ctx, `SELECT name,slug FROM tenants WHERE id=$1`, tenantID).Scan(&name, &slug)
	return
}

type OrderNotification struct {
	TenantID, TenantName, TenantSlug, OrderID, PublicCode string
	CustomerName, WhatsApp, WhatsAppText, Status          string
	Total                                                 float64
}

func (s *Store) OrderNotification(ctx context.Context, orderID string) (OrderNotification, error) {
	var x OrderNotification
	err := s.DB.QueryRow(ctx, `SELECT o.tenant_id::text,t.name,t.slug,o.id::text,o.public_code,o.customer_name,o.whatsapp,coalesce(o.whatsapp_text,''),o.status,o.total
		FROM orders o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1`, orderID).Scan(
		&x.TenantID, &x.TenantName, &x.TenantSlug, &x.OrderID, &x.PublicCode, &x.CustomerName, &x.WhatsApp, &x.WhatsAppText, &x.Status, &x.Total,
	)
	return x, err
}

func (s *Store) NotificationTemplate(ctx context.Context, tenantID, event string) (string, error) {
	var text string
	err := s.DB.QueryRow(ctx, `SELECT template_text FROM notification_templates WHERE tenant_id=$1 AND event=$2 AND channel='whatsapp' AND active=true`, tenantID, event).Scan(&text)
	return text, err
}

func (s *Store) RecordWhatsAppEvent(ctx context.Context, tenantID, sessionID, event string, payload []byte) error {
	if strings.TrimSpace(event) == "" {
		event = "unknown"
	}
	if len(payload) == 0 {
		payload = []byte(`{}`)
	}
	_, err := s.DB.Exec(ctx, `INSERT INTO whatsapp_events(tenant_id,session_id,event,payload) VALUES($1,$2,$3,$4::jsonb)`, tenantID, sessionID, event, payload)
	return err
}

func (s *Store) UpdateWaxumConnectionState(ctx context.Context, tenantID, status, phone, pushName string) error {
	x, err := s.WaxumIntegration(ctx, tenantID)
	if err != nil {
		return err
	}
	x.LastStatus = status
	if phone != "" {
		x.PhoneNumber = phone
	}
	if pushName != "" {
		x.PushName = pushName
	}
	return s.SaveWaxumIntegration(ctx, tenantID, x)
}

func (s *Store) EnabledWaxumIntegration(ctx context.Context, tenantID string) (WaxumIntegration, error) {
	x, err := s.WaxumIntegration(ctx, tenantID)
	if err != nil {
		return WaxumIntegration{}, err
	}
	if !x.Enabled || strings.TrimSpace(x.SessionID) == "" {
		return WaxumIntegration{}, errors.New("WhatsApp no está conectado para este negocio")
	}
	return x, nil
}
