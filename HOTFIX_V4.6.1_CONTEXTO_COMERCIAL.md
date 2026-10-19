# HOTFIX WAMERCIO 4.6.1 — Adecuación contextual de plantillas e interfaces

Partir de WAMERCIO 4.6.0. Aplicar archivos del hotfix conservando rutas relativas, o utilizar el paquete completo.

- Se normalizan textos, botones, títulos de catálogo, estados y mensajes contextuales para 16 negocios.
- Se adapta checkout y notificación del backend para solicitudes de cita y cotización; cita solicitada no equivale a agenda confirmada.
- Se corrigen etiquetas de analítica que confundían operaciones pendientes con ingresos cobrados.
- Se mantiene la edición en SuperAdmin y las particularidades previas de cada negocio.
- No se requiere migración SQL adicional.

**No equivale a revisión de seguridad completa.** El perfil de módulos es presentación UI, no una revocación de permisos API. Confirmar en CI la compilación y realizar pruebas integrales antes de producción.

Documento completo: `AUDITORIA_V4.6.1_COERENCIA_COMERCIAL.md`.
