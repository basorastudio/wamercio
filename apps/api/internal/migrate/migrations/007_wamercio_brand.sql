-- Renombrado integral de la plataforma a wamercio.
-- Corrige instalaciones que ya hubieran aplicado 003 antes del renombrado.
-- system_settings es la tabla real creada por 003_admin_and_operations.sql.
INSERT INTO system_settings(key, value, updated_at)
VALUES ('platform_name', 'wamercio', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;
