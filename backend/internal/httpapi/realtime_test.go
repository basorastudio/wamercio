package httpapi

import (
	"testing"
	"time"
)

func TestEventBrokerIsolatesTenants(t *testing.T) {
	broker := NewEventBroker(EventBrokerConfig{QueueSize: 4, ReplaySize: 4})
	t.Cleanup(broker.Close)

	tenantA, _, unsubscribeA, err := broker.Subscribe("tenant-a", "client-a", "")
	if err != nil {
		t.Fatalf("subscribe tenant A: %v", err)
	}
	t.Cleanup(unsubscribeA)
	tenantB, _, unsubscribeB, err := broker.Subscribe("tenant-b", "client-b", "")
	if err != nil {
		t.Fatalf("subscribe tenant B: %v", err)
	}
	t.Cleanup(unsubscribeB)

	broker.Publish("tenant-a", tenantEvent{Type: "order_created"})
	select {
	case event := <-tenantA:
		if event.Type != "order_created" {
			t.Fatalf("unexpected event type %q", event.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("tenant A did not receive its event")
	}
	select {
	case event := <-tenantB:
		t.Fatalf("tenant B received tenant A event: %#v", event)
	default:
	}
}

func TestEventBrokerReplaysAfterLastEventID(t *testing.T) {
	broker := NewEventBroker(EventBrokerConfig{QueueSize: 4, ReplaySize: 4})
	t.Cleanup(broker.Close)

	first := broker.Publish("tenant-a", tenantEvent{Type: "first"})
	second := broker.Publish("tenant-a", tenantEvent{Type: "second"})
	events, _, unsubscribe, err := broker.Subscribe("tenant-a", "client-a", first.ID)
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	t.Cleanup(unsubscribe)

	select {
	case replayed := <-events:
		if replayed.ID != second.ID {
			t.Fatalf("replayed ID = %q, want %q", replayed.ID, second.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("expected replayed event")
	}
}

func TestEventsAfterUnknownCursorReturnsBoundedWindow(t *testing.T) {
	events := []tenantEvent{{ID: "one"}, {ID: "two"}}
	replayed := eventsAfter(events, "expired")
	if len(replayed) != len(events) || replayed[0].ID != "one" || replayed[1].ID != "two" {
		t.Fatalf("unexpected replay window: %#v", replayed)
	}
}

func TestEventBrokerDisconnectsSlowClient(t *testing.T) {
	broker := NewEventBroker(EventBrokerConfig{QueueSize: 1, ReplaySize: 1})
	t.Cleanup(broker.Close)

	_, disconnected, unsubscribe, err := broker.Subscribe("tenant-a", "client-a", "")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	t.Cleanup(unsubscribe)
	broker.Publish("tenant-a", tenantEvent{Type: "first"})
	broker.Publish("tenant-a", tenantEvent{Type: "second"})

	select {
	case <-disconnected:
	case <-time.After(time.Second):
		t.Fatal("slow client was not disconnected")
	}
	if stats := broker.Stats(); stats.SlowClients != 1 || stats.ActiveConnections != 0 {
		t.Fatalf("unexpected stats: %#v", stats)
	}
}

func TestEventBrokerLimitsConnectionsPerClient(t *testing.T) {
	broker := NewEventBroker(EventBrokerConfig{QueueSize: 1, MaxConnectionsPerClient: 1})
	t.Cleanup(broker.Close)
	_, _, unsubscribe, err := broker.Subscribe("tenant-a", "client-a", "")
	if err != nil {
		t.Fatalf("first subscribe: %v", err)
	}
	t.Cleanup(unsubscribe)
	if _, _, _, err := broker.Subscribe("tenant-a", "client-a", ""); err == nil {
		t.Fatal("expected client connection limit error")
	}
}

func TestEventBrokerLimitsTotalConnections(t *testing.T) {
	broker := NewEventBroker(EventBrokerConfig{QueueSize: 1, MaxConnectionsTotal: 1})
	t.Cleanup(broker.Close)
	_, _, unsubscribe, err := broker.Subscribe("tenant-a", "client-a", "")
	if err != nil {
		t.Fatalf("first subscribe: %v", err)
	}
	t.Cleanup(unsubscribe)
	if _, _, _, err := broker.Subscribe("tenant-b", "client-b", ""); err == nil {
		t.Fatal("expected global connection limit error")
	}
}

func BenchmarkEventBrokerPublish(b *testing.B) {
	broker := NewEventBroker(EventBrokerConfig{ReplaySize: 0})
	b.Cleanup(broker.Close)
	b.ReportAllocs()
	for b.Loop() {
		broker.Publish("tenant-a", tenantEvent{Type: "order_updated"})
	}
}
