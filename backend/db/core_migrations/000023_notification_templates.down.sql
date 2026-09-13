DELETE FROM platform_settings WHERE key='notification_templates_seeded_v1';
DROP INDEX IF EXISTS idx_notification_templates_scope_category;
DROP INDEX IF EXISTS idx_notification_templates_business_event;
DROP INDEX IF EXISTS idx_notification_templates_platform_event;
DROP TABLE IF EXISTS notification_templates;
