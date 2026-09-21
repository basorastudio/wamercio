-- WAMERCIO 2.5.8: cabecera pública con una sola acción de acceso.
-- Los slugs compactos se aplican al crear/editar identificadores desde la aplicación;
-- no se renombran tiendas existentes para evitar romper enlaces ya compartidos.
UPDATE platform_settings
SET value = jsonb_set(value - 'nav_register_label', '{nav_access_label}', to_jsonb('Acceso'::text), true),
    updated_at = now()
WHERE key = 'landing';
