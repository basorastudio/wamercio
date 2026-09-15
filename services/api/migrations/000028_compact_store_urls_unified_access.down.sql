UPDATE platform_settings
SET value = jsonb_set(
              jsonb_set(value, '{nav_access_label}', to_jsonb('Acceder'::text), true),
              '{nav_register_label}', to_jsonb('Registrarme'::text), true
            ),
    updated_at = now()
WHERE key = 'landing';
