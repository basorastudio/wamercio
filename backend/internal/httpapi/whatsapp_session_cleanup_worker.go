package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"colmapro/backend/internal/platform/tenancy"
	waxum "github.com/basoradev/waxum-go"
)

const whatsappSessionCleanupInterval = 45 * time.Second

func (s *Server) listWhatsAppTenants(ctx context.Context, onlyConfigured bool) ([]tenancy.Tenant, error) {
	condition := ""
	if onlyConfigured {
		condition = `
		WHERE COALESCE(t.metadata -> 'whatsapp' ->> 'session_id','') <> ''
		   OR COALESCE(t.metadata -> 'whatsapp' ->> 'status','') NOT IN ('','pending')`
	}
	rows, err := s.tenantManager.CoreDB().Query(ctx, `
		SELECT t.id::text,t.name,t.slug,t.status,t.plan_slug,
		       COALESCE(d.domain,''),COALESCE(db.database_name,''),t.created_at
		FROM tenants t
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
	`+condition+`
		ORDER BY t.created_at
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tenants []tenancy.Tenant
	for rows.Next() {
		var tenant tenancy.Tenant
		if scanErr := rows.Scan(
			&tenant.ID,
			&tenant.Name,
			&tenant.Slug,
			&tenant.Status,
			&tenant.PlanSlug,
			&tenant.Domain,
			&tenant.DatabaseName,
			&tenant.CreatedAt,
		); scanErr == nil {
			tenants = append(tenants, tenant)
		}
	}
	return tenants, rows.Err()
}

// purgeManagedWhatsAppSessions removes every WAMERCIO-owned session from the
// current WAXUM provider before that provider is disabled or replaced. This
// prevents sessions from becoming unreachable orphans on the old instance.
func (s *Server) purgeManagedWhatsAppSessions(ctx context.Context, client *waxum.Client) error {
	if client == nil || s == nil || s.tenantManager == nil {
		return nil
	}
	list, _, err := client.Sessions.List(ctx)
	if err != nil {
		return err
	}
	remote := make(map[string]struct{})
	if list != nil {
		for _, session := range list.Sessions {
			remote[session.ID] = struct{}{}
		}
	}

	tenants, err := s.listWhatsAppTenants(ctx, false)
	if err != nil {
		return err
	}
	managed := []string{platformWhatsAppSessionID, platformWhatsAppLegacySessionID}
	for _, tenant := range tenants {
		managed = append(managed, businessWhatsAppSessionID(tenant))
	}

	var deleteErrors []error
	for _, sessionID := range managed {
		if _, exists := remote[sessionID]; !exists {
			continue
		}
		if deleteErr := deleteWaxumSessionCompletely(ctx, client, sessionID); deleteErr != nil {
			deleteErrors = append(deleteErrors, deleteErr)
		}
	}
	if len(deleteErrors) > 0 {
		return errors.Join(deleteErrors...)
	}

	platformConfig, _ := s.readPlatformWhatsAppConfig(ctx)
	_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, s.pendingPlatformWhatsAppConfig(ctx, platformConfig))
	for _, tenant := range tenants {
		config, readErr := s.readBusinessWhatsAppConfig(ctx, tenant)
		if readErr == nil {
			_ = s.writeBusinessWhatsAppConfig(ctx, tenant.ID, pendingBusinessWhatsAppConfig(tenant, config))
		}
	}
	return nil
}

func (s *Server) runWhatsAppSessionCleanupLoop(ctx context.Context) {
	ticker := time.NewTicker(whatsappSessionCleanupInterval)
	defer ticker.Stop()

	s.cleanupOrphanWhatsAppSessions(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.cleanupOrphanWhatsAppSessions(ctx)
		}
	}
}

func (s *Server) cleanupOrphanWhatsAppSessions(parent context.Context) {
	if s == nil || s.tenantManager == nil {
		return
	}
	ctx, cancel := context.WithTimeout(parent, 35*time.Second)
	defer cancel()

	client, err := s.platformWaxumClientFromSettings(ctx)
	if err != nil {
		return
	}

	platformConfig, readErr := s.readPlatformWhatsAppConfig(ctx)
	if readErr == nil {
		reconciled, deleted, reconcileErr := s.reconcilePlatformWhatsAppSession(ctx, client, platformConfig)
		if reconcileErr == nil {
			_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, reconciled)
			if deleted {
				s.auditPlatform(ctx, "system", "", "platform.whatsapp.orphan_session.deleted", sanitizePlatformWhatsAppConfig(reconciled))
			}
		} else if !errors.Is(reconcileErr, context.Canceled) && !errors.Is(reconcileErr, context.DeadlineExceeded) {
			slog.WarnContext(ctx, "platform WhatsApp session cleanup failed", "error", reconcileErr)
		}
	}

	tenants, err := s.listWhatsAppTenants(ctx, true)
	if err != nil {
		return
	}
	for _, tenant := range tenants {
		if ctx.Err() != nil {
			return
		}
		config, configErr := s.readBusinessWhatsAppConfig(ctx, tenant)
		if configErr != nil {
			continue
		}
		reconciled, deleted, reconcileErr := s.reconcileBusinessWhatsAppSession(ctx, client, tenant, config)
		if reconcileErr != nil {
			if !errors.Is(reconcileErr, context.Canceled) && !errors.Is(reconcileErr, context.DeadlineExceeded) {
				slog.WarnContext(ctx, "business WhatsApp session cleanup failed", "tenant_id", tenant.ID, "error", reconcileErr)
			}
			continue
		}
		_ = s.writeBusinessWhatsAppConfig(ctx, tenant.ID, reconciled)
		if deleted {
			s.auditPlatform(ctx, "system", tenant.ID, "business.whatsapp.orphan_session.deleted", map[string]any{
				"business": tenant.Name,
				"session":  businessWhatsAppSessionID(tenant),
			})
		}
	}
}
