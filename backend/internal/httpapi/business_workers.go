package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"

	waxum "github.com/basoradev/waxum-go"
	"wamercio/backend/internal/platform/tenancy"

	"github.com/jackc/pgx/v5"
)

type businessWorkerLifecycle struct {
	mu     sync.Mutex
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

type outboxEventRecord struct {
	ID            string
	StoreID       string
	AggregateType string
	AggregateID   string
	EventType     string
	Payload       json.RawMessage
	Attempts      int
}

type whatsappNotificationRecord struct {
	ID          string
	StoreID     string
	RecipientID string
	EventType   string
	Title       string
	Message     string
	Data        json.RawMessage
	Attempts    int
}

func newBusinessWorkerLifecycle() *businessWorkerLifecycle {
	return &businessWorkerLifecycle{}
}

func (s *Server) StartBusinessWorkers(parent context.Context) {
	if s == nil || s.tenantManager == nil || s.businessWorkers == nil {
		return
	}
	if err := s.ensurePlatformNotificationTemplatesSchema(parent); err != nil {
		slog.WarnContext(parent, "notification template schema initialization failed", "error", err)
	}
	s.businessWorkers.mu.Lock()
	if s.businessWorkers.cancel != nil {
		s.businessWorkers.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parent)
	s.businessWorkers.cancel = cancel
	s.businessWorkers.wg.Add(2)
	s.businessWorkers.mu.Unlock()
	go func() {
		defer s.businessWorkers.wg.Done()
		s.runOutboxLoop(ctx)
	}()
	go func() {
		defer s.businessWorkers.wg.Done()
		s.runWhatsAppSessionCleanupLoop(ctx)
	}()
}

func (s *Server) StopBusinessWorkers() {
	if s == nil || s.businessWorkers == nil {
		return
	}
	s.businessWorkers.mu.Lock()
	cancel := s.businessWorkers.cancel
	s.businessWorkers.cancel = nil
	s.businessWorkers.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	s.businessWorkers.wg.Wait()
}

func (s *Server) runOutboxLoop(ctx context.Context) {
	outboxTicker := time.NewTicker(1 * time.Second)
	expiryTicker := time.NewTicker(15 * time.Minute)
	defer outboxTicker.Stop()
	defer expiryTicker.Stop()
	s.processActiveTenantBatchExpirations(ctx)
	for {
		s.processActiveTenantOutboxes(ctx)
		select {
		case <-ctx.Done():
			return
		case <-outboxTicker.C:
		case <-expiryTicker.C:
			s.processActiveTenantBatchExpirations(ctx)
		}
	}
}

func (s *Server) processActiveTenantBatchExpirations(ctx context.Context) {
	for _, tenant := range s.tenantManager.ActiveTenants() {
		if ctx.Err() != nil {
			return
		}
		operationContext, cancel := context.WithTimeout(ctx, 30*time.Second)
		pool, err := s.tenantManager.Pool(operationContext, tenant)
		if err == nil {
			tenantContext := tenancy.WithTenant(operationContext, tenant, pool)
			if expiryErr := s.expireTenantProductBatches(tenantContext); expiryErr != nil && !errors.Is(expiryErr, context.Canceled) && !errors.Is(expiryErr, context.DeadlineExceeded) {
				slog.WarnContext(ctx, "tenant batch expiration processing failed", "tenant_id", tenant.ID, "error", expiryErr)
			}
		}
		cancel()
	}
}

func (s *Server) processActiveTenantOutboxes(ctx context.Context) {
	for _, tenant := range s.tenantManager.ActiveTenants() {
		if ctx.Err() != nil {
			return
		}
		operationContext, cancel := context.WithTimeout(ctx, 30*time.Second)
		pool, err := s.tenantManager.Pool(operationContext, tenant)
		if err == nil {
			tenantContext := tenancy.WithTenant(operationContext, tenant, pool)
			if outboxErr := s.processTenantOutbox(tenantContext); outboxErr != nil && !errors.Is(outboxErr, context.Canceled) && !errors.Is(outboxErr, context.DeadlineExceeded) {
				slog.WarnContext(ctx, "tenant outbox processing failed", "tenant_id", tenant.ID, "error", outboxErr)
			}
			if notificationErr := s.processTenantWhatsAppNotifications(tenantContext); notificationErr != nil && !errors.Is(notificationErr, context.Canceled) && !errors.Is(notificationErr, context.DeadlineExceeded) {
				slog.WarnContext(ctx, "tenant WhatsApp notification processing failed", "tenant_id", tenant.ID, "error", notificationErr)
			}
		}
		cancel()
		if err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			slog.WarnContext(ctx, "tenant worker pool unavailable", "tenant_id", tenant.ID, "error", err)
		}
	}
}

func (s *Server) processTenantOutbox(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `
		WITH candidates AS (
			SELECT id FROM outbox_events
			WHERE (status IN ('pending','failed') OR (status='processing' AND updated_at < now() - interval '5 minutes'))
			  AND next_attempt_at <= now() AND attempts < 8
			ORDER BY created_at
			FOR UPDATE SKIP LOCKED
			LIMIT 25
		)
		UPDATE outbox_events event
		SET status='processing',attempts=event.attempts+1,updated_at=now()
		FROM candidates
		WHERE event.id=candidates.id
		RETURNING event.id::text,COALESCE(event.store_id::text,''),event.aggregate_type,event.aggregate_id,event.event_type,event.payload,event.attempts
	`)
	if err != nil {
		return err
	}
	events := []outboxEventRecord{}
	for rows.Next() {
		var event outboxEventRecord
		if err := rows.Scan(&event.ID, &event.StoreID, &event.AggregateType, &event.AggregateID, &event.EventType, &event.Payload, &event.Attempts); err != nil {
			rows.Close()
			return err
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	for _, event := range events {
		if err := s.dispatchOutboxEvent(ctx, event); err != nil {
			nextAttempt := time.Now().Add(time.Duration(event.Attempts*event.Attempts) * time.Second)
			status := "failed"
			if event.Attempts >= 8 {
				status = "dead"
			}
			_, _ = s.db.Exec(ctx, `UPDATE outbox_events SET status=$2,last_error=$3,next_attempt_at=$4,updated_at=now() WHERE id=$1::uuid`, event.ID, status, truncateError(err), nextAttempt)
			continue
		}
		_, err := s.db.Exec(ctx, `UPDATE outbox_events SET status='published',last_error='',published_at=now(),updated_at=now() WHERE id=$1::uuid`, event.ID)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) dispatchOutboxEvent(ctx context.Context, event outboxEventRecord) error {
	data := map[string]any{}
	if len(event.Payload) > 0 {
		if err := json.Unmarshal(event.Payload, &data); err != nil {
			return err
		}
	}
	data["outbox_event_id"] = event.ID
	eventName := realtimeEventName(event.EventType)
	s.publishTenantEvent(ctx, eventName, data)
	return nil
}

func realtimeEventName(eventType string) string {
	switch strings.TrimSpace(eventType) {
	case "inventory.stock.adjusted":
		return "product_updated"
	case "sale.created":
		return "sale_created"
	case "sale.voided":
		return "sale_voided"
	case "sale.returned":
		return "sale_returned"
	case "store_credit.payment.recorded":
		return "store_credit_updated"
	default:
		return strings.ReplaceAll(strings.TrimSpace(eventType), ".", "_")
	}
}

func (s *Server) processTenantWhatsAppNotifications(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `
		WITH candidates AS (
			SELECT id FROM business_notifications
			WHERE channel='whatsapp'
			  AND (status IN ('pending','failed') OR (status='processing' AND updated_at < now() - interval '5 minutes'))
			  AND attempts < 6
			  AND updated_at <= now() - (GREATEST(attempts * attempts, 0) * interval '1 minute')
			ORDER BY created_at
			FOR UPDATE SKIP LOCKED
			LIMIT 5
		)
		UPDATE business_notifications notification
		SET status='processing',attempts=notification.attempts+1,updated_at=now()
		FROM candidates
		WHERE notification.id=candidates.id
		RETURNING notification.id::text,COALESCE(notification.store_id::text,''),notification.recipient_id,
		          notification.event_type,notification.title,notification.message,COALESCE(notification.data,'{}'::jsonb),notification.attempts
	`)
	if err != nil {
		return err
	}
	notifications := []whatsappNotificationRecord{}
	for rows.Next() {
		var notification whatsappNotificationRecord
		if err := rows.Scan(&notification.ID, &notification.StoreID, &notification.RecipientID, &notification.EventType, &notification.Title, &notification.Message, &notification.Data, &notification.Attempts); err != nil {
			rows.Close()
			return err
		}
		notifications = append(notifications, notification)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if len(notifications) == 0 {
		return nil
	}

	tenant, _ := tenancy.FromContext(ctx)
	client, sessionID, err := s.businessWhatsAppDeliverySession(ctx, tenant.ID)
	for _, notification := range notifications {
		deliveryErr := err
		if deliveryErr == nil {
			deliveryErr = s.sendBusinessWhatsAppNotification(ctx, client, sessionID, notification)
		}
		if deliveryErr != nil {
			status := "failed"
			if notification.Attempts >= 6 {
				status = "dead"
			}
			_, _ = s.db.Exec(ctx, `
				UPDATE business_notifications
				SET status=$2,last_error=$3,updated_at=now()
				WHERE id=$1::uuid
			`, notification.ID, status, truncateError(deliveryErr))
			continue
		}
		if _, err := s.db.Exec(ctx, `
			UPDATE business_notifications
			SET status='sent',last_error='',sent_at=now(),updated_at=now()
			WHERE id=$1::uuid
		`, notification.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) sendBusinessWhatsAppNotification(ctx context.Context, client *waxum.Client, sessionID string, notification whatsappNotificationRecord) error {
	if client == nil {
		return errors.New("Waxum client is not available")
	}
	if strings.TrimSpace(notification.RecipientID) == "" {
		return errors.New("notification customer is missing")
	}
	var phone, customerName string
	if err := s.db.QueryRow(ctx, `SELECT whatsapp,COALESCE(name,'') FROM customers WHERE id=$1::uuid`, notification.RecipientID).Scan(&phone, &customerName); err != nil {
		return err
	}
	phone = normalizePlatformWhatsAppPhone(phone)
	if phone == "" {
		return errors.New("notification customer WhatsApp is invalid")
	}
	body := strings.TrimSpace(s.renderWhatsAppNotification(ctx, notification, customerName))
	if body == "" {
		return errors.New("notification message is empty")
	}
	if !strings.Contains(strings.ToLower(body), "wamercio") {
		body += "\n\nWAMERCIO"
	}
	sendContext, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_, _, err := client.Messages.SendText(sendContext, sessionID, &waxum.SendTextRequest{To: phone, Text: body})
	return err
}

func truncateError(err error) string {
	if err == nil {
		return ""
	}
	value := err.Error()
	if len(value) > 1000 {
		return value[:1000]
	}
	return value
}
