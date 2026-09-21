UPDATE stores
SET template_config = coalesce(template_config,'{}'::jsonb) - 'supports_dine_in',
    updated_at = now();

UPDATE business_templates
SET settings = coalesce(settings,'{}'::jsonb) - 'supports_dine_in',
    updated_at = now();
