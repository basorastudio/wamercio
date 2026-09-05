package store

import "context"

type Entitlements struct {
	ProductLimit                                         int
	Marketplace, Variations, Banners, WhatsAppAutomation bool
}

func (s *Store) Entitlements(ctx context.Context, tenantID string) (Entitlements, error) {
	var x Entitlements
	err := s.DB.QueryRow(ctx, `SELECT coalesce(p.product_limit,0),p.marketplace_enabled,p.variations_enabled,p.banners_enabled,p.whatsapp_automation_enabled FROM subscriptions su JOIN plans p ON p.id=su.plan_id WHERE su.tenant_id=$1 AND su.status='active' AND (su.expires_at IS NULL OR su.expires_at>=current_date) ORDER BY su.created_at DESC LIMIT 1`, tenantID).Scan(&x.ProductLimit, &x.Marketplace, &x.Variations, &x.Banners, &x.WhatsAppAutomation)
	return x, err
}
func (s *Store) ProductCount(ctx context.Context, tenantID string) (int, error) {
	var n int
	err := s.DB.QueryRow(ctx, `SELECT count(*) FROM products WHERE tenant_id=$1 AND active=true`, tenantID).Scan(&n)
	return n, err
}
