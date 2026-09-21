# WAMERCIO 2.3.0 — Centro SaaS funcional

## Objetivo
Convertir el Centro SaaS de WAMERCIO 2.2.2 en una configuración operativa real, manteniendo el diseño actual y reutilizando los patrones funcionales maduros del WAMERCIO/ColmaPro anterior sin copiar su arquitectura de datos ni su interfaz monolítica.

## Alcance
- General: soporte, plan por defecto real, gracia, registro público, zona horaria, moneda y locale.
- Territorio: GEO RD MAP, URL, timeout, caché, secreto API y prueba de conectividad.
- Tipos de negocio: búsqueda, alta/edición básica y activación desde Centro SaaS usando business_templates existentes.
- Dominios: URL pública real por ruta `wamercio.com/{slug}`, identificadores reservados y estado de dominios personalizados sin prometer routing no implementado.
- Bases de datos: estado real PostgreSQL, versión, tamaño, migraciones y contadores; credenciales permanecen en ENV.
- Bancos: CRUD con nombre, nombre corto, orden, estado y logo URL.
- WhatsApp: estado real, QR, conectar/desconectar y enlace al centro de soporte existente.
- Notificaciones: plantillas configurables y persistentes para eventos comerciales.
- Acceso: longitudes PIN de propietario y personal, recuperación, TTL, intentos y CTA; las longitudes se aplican a flujos reales de propietarios/personal.
- Identidad: habilitación, URL, Client ID, API Key cifrada, timeout, verificación obligatoria, límites y prueba de conexión.
- Legal: entidad responsable, versión, vigencia, jurisdicción, contacto, términos y privacidad; páginas públicas reales.
- Backups: programación, zona horaria, retención, R2, secretos cifrados y prueba de endpoint.
- Auditoría: búsqueda/filtros y registro por sección, sin secretos.

## Seguridad
Los secretos se almacenan en una tabla separada `platform_secrets` cifrados con AES-256-GCM usando `PLATFORM_CONFIG_SECRET`. El GET del Centro SaaS nunca devuelve el secreto; solo banderas `*_configured`. Un valor secreto vacío al guardar conserva el existente; un valor nuevo lo reemplaza.

## Persistencia
Cada sección se guarda de forma independiente con `PUT /api/v1/admin/platform/settings/{key}`. Se conserva el endpoint agregado anterior por compatibilidad, pero la UI deja de depender de él.

## Restricciones
- No cambiar apariencia base, navegación principal ni arquitectura multi-negocio.
- No exponer DATABASE_URL, JWT_SECRET, Redis o secretos internos del servidor.
- No duplicar el Centro WhatsApp existente.
- No crear una base PostgreSQL física por negocio.
- No añadir dependencias frontend nuevas.
