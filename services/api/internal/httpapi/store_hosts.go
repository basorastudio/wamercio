package httpapi

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
)

type resolvedStoreHost struct {
	StoreID  string
	Slug     string
	Hostname string
	Custom   bool
}

func normalizeHostname(raw string) string {
	raw = strings.TrimSpace(strings.Split(raw, ",")[0])
	if raw == "" {
		return ""
	}
	if strings.Contains(raw, "://") {
		if u, err := url.Parse(raw); err == nil {
			raw = u.Host
		}
	}
	if host, _, err := net.SplitHostPort(raw); err == nil {
		raw = host
	}
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(raw)), ".")
}

func tenantSlugFromHost(host, root string) (string, bool) {
	host = normalizeHostname(host)
	root = normalizeHostname(root)
	suffix := "." + root
	if host == "" || root == "" || !strings.HasSuffix(host, suffix) {
		return "", false
	}
	label := strings.TrimSuffix(host, suffix)
	if label == "" || strings.Contains(label, ".") {
		return "", false
	}
	return label, true
}

func (s *Server) requestHostname(r *http.Request) string {
	for _, raw := range []string{r.Header.Get("X-Wamercio-Host"), r.Header.Get("X-Forwarded-Host"), r.Host} {
		if host := normalizeHostname(raw); host != "" {
			return host
		}
	}
	return ""
}

func (s *Server) requestScheme(r *http.Request) string {
	if v := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0]); v == "http" || v == "https" {
		return v
	}
	if r.TLS != nil {
		return "https"
	}
	if strings.HasPrefix(strings.ToLower(s.cfg.AppURL), "https://") {
		return "https"
	}
	return "http"
}

func (s *Server) requestOrigin(r *http.Request) string {
	host := s.requestHostname(r)
	if host == "" {
		return strings.TrimRight(s.cfg.AppURL, "/")
	}
	return s.requestScheme(r) + "://" + host
}

func (s *Server) resolveStoreHost(ctx context.Context, host string) (resolvedStoreHost, error) {
	host = normalizeHostname(host)
	if host == "" {
		return resolvedStoreHost{}, fmt.Errorf("host de negocio requerido")
	}
	tenantRoot := normalizeHostname(s.cfg.TenantRootDomain)
	if slug, ok := tenantSlugFromHost(host, tenantRoot); ok {
		var out resolvedStoreHost
		err := s.db.QueryRow(ctx, `SELECT id::text,slug FROM stores WHERE slug=$1 AND is_active=true`, slug).Scan(&out.StoreID, &out.Slug)
		if err != nil {
			return resolvedStoreHost{}, err
		}
		out.Hostname = host
		return out, nil
	}
	var out resolvedStoreHost
	err := s.db.QueryRow(ctx, `SELECT s.id::text,s.slug,d.hostname FROM store_domains d JOIN stores s ON s.id=d.store_id WHERE d.hostname=$1 AND d.status='active' AND s.is_active=true`, host).Scan(&out.StoreID, &out.Slug, &out.Hostname)
	if err != nil {
		return resolvedStoreHost{}, err
	}
	out.Custom = true
	return out, nil
}

func (s *Server) storePublicHostname(ctx context.Context, storeID, slug string) string {
	var hostname string
	_ = s.db.QueryRow(ctx, `SELECT hostname FROM store_domains WHERE store_id=$1 AND status='active' AND is_primary=true ORDER BY verified_at DESC NULLS LAST LIMIT 1`, storeID).Scan(&hostname)
	hostname = normalizeHostname(hostname)
	if hostname != "" {
		return hostname
	}
	root := normalizeHostname(s.cfg.TenantRootDomain)
	if root == "" {
		root = "ltd.do"
	}
	return slug + "." + root
}

func (s *Server) storePublicURL(ctx context.Context, storeID, slug string) string {
	return "https://" + s.storePublicHostname(ctx, storeID, slug)
}
