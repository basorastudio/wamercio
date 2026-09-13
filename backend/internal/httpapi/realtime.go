package httpapi

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

	"github.com/redis/go-redis/v9"
)

type EventBrokerConfig struct {
	QueueSize               int
	ReplaySize              int
	ReplayTenantLimit       int
	MaxConnectionsTotal     int
	MaxConnectionsTenant    int
	MaxConnectionsPerClient int
}

type eventClient struct {
	clientKey string
	events    chan tenantEvent
	done      chan struct{}
	stopOnce  sync.Once
}

func (c *eventClient) stop() {
	c.stopOnce.Do(func() { close(c.done) })
}

type EventBroker struct {
	mu          sync.Mutex
	config      EventBrokerConfig
	subscribers map[string]map[*eventClient]struct{}
	replay      map[string][]tenantEvent
	replayAt    map[string]time.Time
	closed      bool
	sequence    atomic.Uint64
	active      atomic.Int64
	published   atomic.Uint64
	dropped     atomic.Uint64
	slow        atomic.Uint64
	reconnects  atomic.Uint64
}

type EventBrokerStats struct {
	ActiveConnections int64
	PublishedEvents   uint64
	DroppedEvents     uint64
	SlowClients       uint64
	Reconnections     uint64
}

type tenantEvent struct {
	ID   string         `json:"id"`
	Type string         `json:"type"`
	Data map[string]any `json:"data,omitempty"`
	At   time.Time      `json:"at"`
}

func NewEventBroker(config EventBrokerConfig) *EventBroker {
	if config.QueueSize <= 0 {
		config.QueueSize = 32
	}
	if config.ReplaySize < 0 {
		config.ReplaySize = 0
	}
	if config.ReplayTenantLimit <= 0 {
		config.ReplayTenantLimit = 1000
	}
	return &EventBroker{
		config:      config,
		subscribers: make(map[string]map[*eventClient]struct{}),
		replay:      make(map[string][]tenantEvent),
		replayAt:    make(map[string]time.Time),
	}
}

func (b *EventBroker) Subscribe(tenantID, clientKey, lastEventID string) (<-chan tenantEvent, <-chan struct{}, func(), error) {
	tenantID = strings.TrimSpace(tenantID)
	clientKey = strings.TrimSpace(clientKey)
	if tenantID == "" {
		return nil, nil, nil, errors.New("tenant is required")
	}
	client := &eventClient{
		clientKey: clientKey,
		events:    make(chan tenantEvent, b.config.QueueSize),
		done:      make(chan struct{}),
	}

	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil, nil, nil, errors.New("event broker is closed")
	}
	if b.config.MaxConnectionsTotal > 0 && b.active.Load() >= int64(b.config.MaxConnectionsTotal) {
		b.mu.Unlock()
		return nil, nil, nil, errors.New("global connection limit reached")
	}
	subscribers := b.subscribers[tenantID]
	if subscribers == nil {
		subscribers = make(map[*eventClient]struct{})
		b.subscribers[tenantID] = subscribers
	}
	if b.config.MaxConnectionsTenant > 0 && len(subscribers) >= b.config.MaxConnectionsTenant {
		b.mu.Unlock()
		return nil, nil, nil, errors.New("tenant connection limit reached")
	}
	if clientKey != "" && b.config.MaxConnectionsPerClient > 0 {
		connections := 0
		for subscriber := range subscribers {
			if subscriber.clientKey == clientKey {
				connections++
			}
		}
		if connections >= b.config.MaxConnectionsPerClient {
			b.mu.Unlock()
			return nil, nil, nil, errors.New("client connection limit reached")
		}
	}
	subscribers[client] = struct{}{}
	if lastEventID != "" {
		b.reconnects.Add(1)
		replay := eventsAfter(b.replay[tenantID], lastEventID)
		if len(replay) > cap(client.events) {
			replay = replay[len(replay)-cap(client.events):]
		}
		for _, event := range replay {
			client.events <- event
		}
	}
	b.active.Add(1)
	b.mu.Unlock()

	var unsubscribeOnce sync.Once
	unsubscribe := func() {
		unsubscribeOnce.Do(func() {
			b.mu.Lock()
			if current := b.subscribers[tenantID]; current != nil {
				if _, exists := current[client]; exists {
					delete(current, client)
					b.active.Add(-1)
				}
				if len(current) == 0 {
					delete(b.subscribers, tenantID)
				}
			}
			b.mu.Unlock()
			client.stop()
		})
	}
	return client.events, client.done, unsubscribe, nil
}

func eventsAfter(events []tenantEvent, lastEventID string) []tenantEvent {
	for index := len(events) - 1; index >= 0; index-- {
		if events[index].ID == lastEventID {
			return events[index+1:]
		}
	}
	// If the requested cursor has already fallen outside the bounded replay
	// window, send the available window so the client can recover its view.
	return events
}

func (b *EventBroker) Publish(tenantID string, event tenantEvent) tenantEvent {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return event
	}
	if event.At.IsZero() {
		event.At = time.Now().UTC()
	}
	if event.ID == "" {
		event.ID = strconv.FormatInt(event.At.UnixNano(), 36) + "-" + strconv.FormatUint(b.sequence.Add(1), 36)
	}

	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return event
	}
	if b.config.ReplaySize > 0 {
		if _, exists := b.replay[tenantID]; !exists && len(b.replay) >= b.config.ReplayTenantLimit {
			b.evictOldestReplayTenantLocked()
		}
		replay := append(b.replay[tenantID], event)
		if len(replay) > b.config.ReplaySize {
			replay = append([]tenantEvent(nil), replay[len(replay)-b.config.ReplaySize:]...)
		}
		b.replay[tenantID] = replay
		b.replayAt[tenantID] = event.At
	}
	for client := range b.subscribers[tenantID] {
		select {
		case <-client.done:
			delete(b.subscribers[tenantID], client)
			b.active.Add(-1)
		case client.events <- event:
		default:
			delete(b.subscribers[tenantID], client)
			b.active.Add(-1)
			b.dropped.Add(1)
			b.slow.Add(1)
			client.stop()
		}
	}
	if len(b.subscribers[tenantID]) == 0 {
		delete(b.subscribers, tenantID)
	}
	b.mu.Unlock()
	b.published.Add(1)
	return event
}

func (b *EventBroker) Close() {
	if b == nil {
		return
	}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return
	}
	b.closed = true
	for tenantID, subscribers := range b.subscribers {
		for client := range subscribers {
			client.stop()
		}
		delete(b.subscribers, tenantID)
	}
	b.active.Store(0)
	b.replay = make(map[string][]tenantEvent)
	b.replayAt = make(map[string]time.Time)
	b.mu.Unlock()
}

func (b *EventBroker) evictOldestReplayTenantLocked() {
	var oldestTenant string
	var oldestAt time.Time
	for tenantID, updatedAt := range b.replayAt {
		if oldestTenant == "" || updatedAt.Before(oldestAt) {
			oldestTenant = tenantID
			oldestAt = updatedAt
		}
	}
	if oldestTenant != "" {
		delete(b.replay, oldestTenant)
		delete(b.replayAt, oldestTenant)
	}
}

func (b *EventBroker) Stats() EventBrokerStats {
	if b == nil {
		return EventBrokerStats{}
	}
	return EventBrokerStats{
		ActiveConnections: b.active.Load(),
		PublishedEvents:   b.published.Load(),
		DroppedEvents:     b.dropped.Load(),
		SlowClients:       b.slow.Load(),
		Reconnections:     b.reconnects.Load(),
	}
}

func (s *Server) eventsStream(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.EnableRealtimeEvents {
		writeError(w, badRequest("Los eventos en tiempo real no están activos"))
		return
	}
	tenantID := tenantIDFromContext(r.Context())
	if tenantID == "" {
		writeError(w, badRequest("No se pudo resolver el negocio para los eventos"))
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, badRequest("El servidor no soporta eventos en tiempo real"))
		return
	}

	clientKey := requestIP(r)
	if customerID, ok := r.Context().Value(customerIDContextKey{}).(string); ok && customerID != "" {
		clientKey = "customer:" + customerID
	}
	events, disconnected, unsubscribe, err := s.events.Subscribe(tenantID, clientKey, r.Header.Get("Last-Event-ID"))
	if err != nil {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Se alcanzó el límite temporal de conexiones en tiempo real. Intenta nuevamente en unos segundos."})
		return
	}
	defer unsubscribe()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	controller := http.NewResponseController(w)
	if err := writeSSEWithDeadline(controller, w, flusher, s.cfg.SSEWriteTimeout, "ready", tenantEvent{Type: "ready", At: time.Now().UTC()}); err != nil {
		return
	}

	heartbeatInterval := s.cfg.SSEHeartbeatInterval
	if heartbeatInterval <= 0 {
		heartbeatInterval = 25 * time.Second
	}
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-disconnected:
			return
		case event := <-events:
			if err := writeSSEWithDeadline(controller, w, flusher, s.cfg.SSEWriteTimeout, event.Type, event); err != nil {
				return
			}
		case <-ticker.C:
			if err := writeSSEWithDeadline(controller, w, flusher, s.cfg.SSEWriteTimeout, "heartbeat", tenantEvent{Type: "heartbeat", At: time.Now().UTC()}); err != nil {
				return
			}
		}
	}
}

func writeSSEWithDeadline(controller *http.ResponseController, w io.Writer, flusher http.Flusher, timeout time.Duration, eventName string, payload tenantEvent) error {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	_ = controller.SetWriteDeadline(time.Now().Add(timeout))
	err := writeSSE(w, eventName, payload)
	if err == nil {
		flusher.Flush()
	}
	_ = controller.SetWriteDeadline(time.Time{})
	return err
}

func writeSSE(w io.Writer, eventName string, payload tenantEvent) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if payload.ID != "" {
		if _, err := fmt.Fprintf(w, "id: %s\n", payload.ID); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(w, "event: %s\n", eventName); err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "data: %s\n\n", data)
	return err
}

type distributedTenantEvent struct {
	Origin   string      `json:"origin"`
	TenantID string      `json:"tenant_id"`
	Event    tenantEvent `json:"event"`
}

type realtimeLifecycle struct {
	mu     sync.Mutex
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func newRealtimeLifecycle() *realtimeLifecycle {
	return &realtimeLifecycle{}
}

func newInstanceID() string {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "wamercio"
	}
	return hostname + "-" + strconv.FormatInt(time.Now().UnixNano(), 36)
}

func (s *Server) StartRealtime(ctx context.Context) {
	if s == nil || s.redis == nil || !s.cfg.EnableRealtimeEvents || s.realtime == nil {
		return
	}
	s.realtime.mu.Lock()
	if s.realtime.cancel != nil {
		s.realtime.mu.Unlock()
		return
	}
	realtimeContext, cancel := context.WithCancel(ctx)
	s.realtime.cancel = cancel
	s.realtime.wg.Add(1)
	s.realtime.mu.Unlock()
	go func() {
		defer s.realtime.wg.Done()
		s.consumeDistributedEvents(realtimeContext)
	}()
}

func (s *Server) consumeDistributedEvents(ctx context.Context) {
	channel := s.realtimeChannel()
	for ctx.Err() == nil {
		pubsub := s.redis.Subscribe(ctx, channel)
		if _, err := pubsub.Receive(ctx); err != nil {
			_ = pubsub.Close()
			if !sleepContext(ctx, time.Second) {
				return
			}
			continue
		}
		messages := pubsub.Channel(redis.WithChannelSize(256))
		for {
			select {
			case <-ctx.Done():
				_ = pubsub.Close()
				return
			case message, ok := <-messages:
				if !ok {
					_ = pubsub.Close()
					if !sleepContext(ctx, time.Second) {
						return
					}
					goto reconnect
				}
				var distributed distributedTenantEvent
				if err := json.Unmarshal([]byte(message.Payload), &distributed); err != nil || distributed.Origin == s.instanceID {
					continue
				}
				s.events.Publish(distributed.TenantID, distributed.Event)
			}
		}
	reconnect:
	}
}

func (s *Server) realtimeChannel() string {
	channel := strings.TrimSpace(s.cfg.SSERedisChannel)
	if channel == "" {
		return "wamercio:realtime:events"
	}
	return channel
}

func sleepContext(ctx context.Context, duration time.Duration) bool {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (s *Server) StopRealtime() {
	if s == nil {
		return
	}
	if s.realtime != nil {
		s.realtime.mu.Lock()
		cancel := s.realtime.cancel
		s.realtime.cancel = nil
		s.realtime.mu.Unlock()
		if cancel != nil {
			cancel()
		}
		s.realtime.wg.Wait()
	}
	if s.events != nil {
		s.events.Close()
	}
}

func (s *Server) publishTenantEvent(ctx context.Context, eventType string, data map[string]any) {
	if s.events == nil || !s.cfg.EnableRealtimeEvents {
		return
	}
	tenantID := tenantIDFromContext(ctx)
	if tenantID == "" {
		return
	}
	event := s.events.Publish(tenantID, tenantEvent{Type: eventType, Data: data, At: time.Now().UTC()})
	if s.redis == nil {
		return
	}
	payload, err := json.Marshal(distributedTenantEvent{Origin: s.instanceID, TenantID: tenantID, Event: event})
	if err != nil {
		return
	}
	timeout := s.cfg.RedisOperationTimeout
	if timeout <= 0 {
		timeout = 300 * time.Millisecond
	}
	publishContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	startedAt := time.Now()
	err = s.redis.Publish(publishContext, s.realtimeChannel(), payload).Err()
	if s.metrics != nil {
		s.metrics.observeRedis(startedAt, err)
	}
	if err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
		slog.WarnContext(ctx, "realtime event distribution failed", "tenant_id", tenantID, "event_type", eventType, "error", err)
	}
}
