-- Renombrado integral de la plataforma a wamercio.
-- Esta migración también corrige instalaciones que ya hubieran aplicado 003 antes del renombrado.
UPDATE platform_settings
SET value = 'wamercio'
WHERE key = 'platform_name';
