UPDATE platform_settings
SET value = jsonb_set(value, '{session_name}', to_jsonb('WAMERCIO'::text), true),
    updated_at = now()
WHERE key = 'whatsapp_platform'
  AND COALESCE(value->>'session_name', '') <> 'WAMERCIO';
