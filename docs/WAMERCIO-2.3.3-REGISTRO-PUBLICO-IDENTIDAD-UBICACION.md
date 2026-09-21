# WAMERCIO 2.3.3 — Registro público, identidad y ubicación

La versión 2.3.3 aplica al modal público de acceso/registro el mismo criterio de separación que ya utiliza el Superadmin: la persona propietaria conserva Cédula y datos personales, mientras el negocio conserva su tipo, nombre y ubicación comercial.

## Flujo de alta

1. El usuario introduce su WhatsApp.
2. Si ya existe, WAMERCIO solicita el PIN.
3. Si es nuevo, WAMERCIO valida el número mediante la sesión SaaS `support` de whatsmeow.
4. El usuario selecciona una plantilla/tipo de negocio.
5. En “Personaliza tu comercio” se completan WhatsApp, Cédula, nombre, apellido, fecha de nacimiento, género, tipo de negocio, nombre comercial, ubicación y PIN.
6. Si Identidad Dominicana está habilitada, una Cédula válida autocompleta el perfil personal.
7. Si GEO RD MAP está habilitado, Provincia, Municipio/Distrito y Barrio usan el catálogo territorial; si no está disponible, se habilita captura manual.
8. El backend vuelve a validar WhatsApp y Cédula antes de crear propietario y negocio.

## Seguridad

Los endpoints públicos de validación tienen rate limit. La API Key de Identidad y la API Key de GEO RD MAP permanecen del lado servidor.
