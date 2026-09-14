package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	outputName       = "wamercio-store-hosts.yml"
	legacyOutputName = "wamercio-custom-domains.yml"
)

func loadReservedLabels(ctx context.Context, db *pgxpool.Pool) map[string]struct{} {
	reserved := map[string]struct{}{
		"www": {}, "api": {}, "admin": {}, "proyecto": {}, "geo": {}, "id": {},
		"waxum": {}, "catalogo": {}, "terminos": {}, "privacidad": {}, "cliente": {}, "domains": {},
	}
	var raw []byte
	if err := db.QueryRow(ctx, `SELECT coalesce(value->'reserved_subdomains','[]'::jsonb) FROM platform_settings WHERE key='domains'`).Scan(&raw); err == nil {
		var labels []string
		if json.Unmarshal(raw, &labels) == nil {
			for _, label := range labels {
				label = normalizeHost(label)
				if label != "" && !strings.Contains(label, ".") {
					reserved[label] = struct{}{}
				}
			}
		}
	}
	return reserved
}

func loadHosts(ctx context.Context, db *pgxpool.Pool, tenantRoot string) ([]string, error) {
	tenantRoot = normalizeHost(tenantRoot)
	if tenantRoot == "" {
		tenantRoot = "ltd.do"
	}
	reserved := loadReservedLabels(ctx, db)
	hostSet := make(map[string]struct{})

	rows, err := db.Query(ctx, `SELECT slug FROM stores WHERE is_active=true ORDER BY slug`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var raw string
		if rows.Scan(&raw) != nil {
			continue
		}
		slug := normalizeHost(raw)
		if slug == "" || strings.Contains(slug, ".") {
			continue
		}
		if _, blocked := reserved[slug]; blocked {
			continue
		}
		hostSet[slug+"."+tenantRoot] = struct{}{}
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	rows, err = db.Query(ctx, `SELECT hostname FROM store_domains WHERE status='active' ORDER BY hostname`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		if rows.Scan(&raw) != nil {
			continue
		}
		host := normalizeHost(raw)
		if host != "" {
			hostSet[host] = struct{}{}
		}
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}

	hosts := make([]string, 0, len(hostSet))
	for host := range hostSet {
		hosts = append(hosts, host)
	}
	return hosts, nil
}

func sync(ctx context.Context, db *pgxpool.Pool, target, tenantRoot string) error {
	hosts, err := loadHosts(ctx, db, tenantRoot)
	if err != nil {
		return err
	}
	data := render(hosts)
	path := filepath.Join(target, outputName)
	tmp := path + ".tmp"
	current, _ := os.ReadFile(path)
	if string(current) == data {
		_ = os.Remove(filepath.Join(target, legacyOutputName))
		return nil
	}
	if err = os.WriteFile(tmp, []byte(data), 0o644); err != nil {
		return err
	}
	if err = os.Rename(tmp, path); err != nil {
		return err
	}
	_ = os.Remove(filepath.Join(target, legacyOutputName))
	log.Printf("published %d exact store host router(s)", len(hosts))
	return nil
}

func main() {
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	target := strings.TrimSpace(os.Getenv("TRAEFIK_DYNAMIC_DIR"))
	tenantRoot := strings.TrimSpace(os.Getenv("TENANT_ROOT_DOMAIN"))
	if target == "" {
		target = "/target"
	}
	if tenantRoot == "" {
		tenantRoot = "ltd.do"
	}
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	run := func() {
		if err := sync(context.Background(), db, target, tenantRoot); err != nil {
			log.Printf("domain sync: %v", err)
		}
	}
	run()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		run()
	}
}
