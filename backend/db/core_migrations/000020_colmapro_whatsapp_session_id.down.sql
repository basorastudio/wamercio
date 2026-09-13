UPDATE platform_settings
SET value = jsonb_set(
              jsonb_set(value, '{session_id}', to_jsonb('colmapro-saas-superadmin'::text), true),
              '{session_name}', to_jsonb('WAMERCIO'::text), true
            ),
    updated_at = now()
WHERE key = 'whatsapp_platform'
  AND COALESCE(value->>'session_id', '') = 'WAMERCIO';
