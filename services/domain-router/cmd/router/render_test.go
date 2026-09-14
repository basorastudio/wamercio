package main

import (
	"strings"
	"testing"
)

func TestRenderPublishesExactTenantAndCustomHostsWithTLS(t *testing.T) {
	out := render([]string{"pizzeria-juan.ltd.do", "pizzeriajuan.com"})
	for _, want := range []string{
		"Host(`pizzeria-juan.ltd.do`)",
		"Host(`pizzeriajuan.com`)",
		"service: wamercio-store-host-service",
		"certResolver: letsencrypt",
		"url: \"http://wamercio-gateway:8080\"",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("rendered config missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "HostRegexp") {
		t.Fatalf("exact host renderer must not emit HostRegexp:\n%s", out)
	}
}

func TestNormalizeHost(t *testing.T) {
	if got := normalizeHost(" Pizzeria-Juan.LTD.DO. "); got != "pizzeria-juan.ltd.do" {
		t.Fatalf("normalizeHost() = %q", got)
	}
}
