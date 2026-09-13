-- WAMERCIO 2.3.0: Centro SaaS funcional y secretos cifrados.

CREATE TABLE IF NOT EXISTS platform_secrets (
  key varchar(180) PRIMARY KEY,
  ciphertext text NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_banks ADD COLUMN IF NOT EXISTS logo_url text;

UPDATE platform_settings SET value = jsonb_set(value, '{maintenance_text}', to_jsonb('La página principal estará temporalmente en mantenimiento. Los negocios activos continúan operando desde sus enlaces públicos.'::text), true) WHERE key='landing' AND coalesce(value->>'maintenance_text','') ILIKE '%subdominio%';
UPDATE platform_settings SET value = ('{"support_whatsapp":"","support_email":"soporte@wamercio.com","default_plan":"emprende","grace_days":5,"public_registration":true,"timezone":"America/Santo_Domingo","currency":"DOP","locale":"es-DO"}'::jsonb || value) - 'tenant_domain' WHERE key='general';
UPDATE platform_settings SET value = '{"provider":"GEO RD MAP","enabled":false,"country":"DO","base_url":"https://geo.ltd.do","health_path":"/api/v1/territories/health","timeout_seconds":12,"cache_minutes":60}'::jsonb || value WHERE key='territory';
UPDATE platform_settings SET value = '{"source":"business_templates","allow_custom":true}'::jsonb || value WHERE key='business_types';
UPDATE platform_settings SET value = (('{"route_mode":"path","reserved_subdomains":["www","api","admin","proyecto","geo","id","waxum","catalogo","terminos","privacidad"]}'::jsonb || value) - 'tenant_domain' - 'custom_domains_enabled' - 'force_https') WHERE key='domains';
UPDATE platform_settings SET value = '{"engine":"PostgreSQL","isolation":"logical_per_business"}'::jsonb || value WHERE key='database';
UPDATE platform_settings SET value = '{"provider":"WhatsApp Bridge","global_support_session":true}'::jsonb || value WHERE key='whatsapp';
UPDATE platform_settings SET value = '{"order_new":"Hola {cliente}, recibimos tu pedido #{pedido} en {negocio}.\n{detalle}\n\nTotal: {total}\nSeguimiento: {seguimiento}","order_confirmed":"Hola {cliente}, tu pedido #{pedido} en {negocio} fue confirmado. Total: {total}.","order_ready":"Hola {cliente}, tu pedido #{pedido} en {negocio} está listo.","order_on_the_way":"Hola {cliente}, tu pedido #{pedido} en {negocio} va en camino.","order_delivered":"Hola {cliente}, tu pedido #{pedido} fue entregado. ¡Gracias por comprar en {negocio}!","recovery":"Hola {cliente}, puedes continuar tu compra en {negocio}."}'::jsonb || value WHERE key='notifications';
UPDATE platform_settings SET value = '{"owner_pin_length":4,"staff_pin_length":4,"legacy_owner_pin_lengths":[],"recovery_enabled":true,"recovery_method":"otp","recovery_ttl_minutes":10,"max_attempts":5,"cta_title":"Recuperar acceso","cta_message":"Usa este enlace seguro para recuperar tu acceso a WAMERCIO.","cta_button":"Recuperar acceso","cta_image_url":""}'::jsonb || value WHERE key='access';
UPDATE platform_settings SET value = '{"enabled":false,"provider":"IDENTIDAD DOMINICANA","base_url":"https://id.ltd.do","client_id":"wamercio","timeout_seconds":12,"require_owner_verification":false,"daily_limit":500,"monthly_limit":10000}'::jsonb || value WHERE key='identity';
UPDATE platform_settings SET value = '{"responsible_entity":"WAMERCIO","version":"1.0","effective_date":"","jurisdiction":"República Dominicana","contact_email":"legal@wamercio.com","terms_url":"/terminos","privacy_url":"/privacidad","terms_text":"","privacy_text":""}'::jsonb || value WHERE key='legal';
UPDATE platform_settings SET value = '{"provider":"Cloudflare R2","enabled":false,"schedule":"15 3 * * *","timezone":"America/Santo_Domingo","retention_daily":7,"retention_weekly":4,"retention_monthly":6,"r2_account_id":"","r2_bucket":"","r2_endpoint":"","r2_access_key_id":"","r2_prefix":"wamercio/backups"}'::jsonb || value WHERE key='backups';
