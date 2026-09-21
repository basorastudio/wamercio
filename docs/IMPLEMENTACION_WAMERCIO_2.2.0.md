# WAMERCIO 2.2.0 — Convergencia SaaS y operación comercial

Esta versión continúa sobre WAMERCIO 2.1.3 y toma del proyecto anterior únicamente patrones funcionales maduros. No copia su UI ni su arquitectura de base de datos.

## Superadministración

- Resumen central de plataforma.
- Página comercial editable con `{domain}` y modo mantenimiento.
- Propietarios y negocios en una misma gestión, incluyendo alta manual de propietario y primer negocio opcional.
- Planes y suscripciones unificados como flujo comercial SaaS.
- Clientes globales con identidad compartida por WhatsApp y relación con múltiples negocios.
- Usuarios SaaS internos con áreas permitidas.
- Centro SaaS para General, Territorio, Tipos de negocio, Dominios, Bases de datos, Bancos, WhatsApp, Notificaciones, Acceso, Identidad, Legal, Backups y Auditoría.
- Catálogo bancario dominicano central.
- Auditoría de cambios centrales, usuarios SaaS, bancos, planes y estados de propietarios.

## Operación de negocios

- Punto de Venta para registrar ventas presenciales y consultar actividad reciente de pedidos.
- Clientes registrados en la plataforma.
- Usuarios internos del negocio con rol y panel asignado.
- Centro de operaciones de Entregas y zonas de cobertura.
- Métodos de pago manuales con cuentas bancarias de referencia.
- Configuración de los negocios del propietario, preservando el editor visual actual de WAMERCIO.
- Menú simplificado para evitar duplicar Entregas y Métodos de pago dentro de Configuración.

## Datos

La migración `000014_saas_operations_convergence` agrega únicamente las estructuras complementarias que necesita esta convergencia: identidad global de clientes, ajustes centrales, bancos, personal interno, permisos SaaS y auditoría. Las migraciones se ejecutan automáticamente al iniciar el API.

## Compatibilidad

- Conserva las tablas, pedidos, productos, clientes, conversaciones y sesiones WhatsApp existentes.
- Conserva la arquitectura PostgreSQL central actual de WAMERCIO.
- No adopta la arquitectura física de una base PostgreSQL por tenant del proyecto anterior.
- No agrega dependencias frontend nuevas.
