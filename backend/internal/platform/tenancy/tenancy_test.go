package tenancy

import (
	"context"
	"testing"
)

type unrelatedContextKey struct{}

func TestWithoutTenantPreservesLifecycleAndUnrelatedValues(t *testing.T) {
	parent, cancel := context.WithCancel(context.Background())
	withValue := context.WithValue(parent, unrelatedContextKey{}, "preserved")
	withTenant := WithTenant(withValue, Tenant{ID: "tenant-a"}, nil)
	central := WithoutTenant(withTenant)

	if _, ok := FromContext(central); ok {
		t.Fatal("tenant identity leaked into central context")
	}
	if got := central.Value(unrelatedContextKey{}); got != "preserved" {
		t.Fatalf("unrelated value = %v", got)
	}
	cancel()
	select {
	case <-central.Done():
	default:
		t.Fatal("cancellation was not preserved")
	}
}
