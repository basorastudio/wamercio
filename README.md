# WAMERCIO 2.9.3

WAMERCIO 2.9.3 consolida el comercio conversacional con publicación social, Perfil de Empresa en Google, evaluaciones nativas por WhatsApp y pagos bancarios avanzados, manteniendo el modelo multi-tenant por tienda y el diseño actual de WAMERCIO.

La experiencia pública conserva el flujo de catálogo, **Mi compra**, pedidos y cuenta del cliente.

## Comercio social y conexiones administradas

Las tiendas pueden conectar **Facebook, Instagram, LinkedIn y Perfil de Empresa en Google** desde **Configuración → Redes sociales** mediante el Proxy Auth administrado. El comercio no introduce Client ID, Client Secret, token ni contraseña dentro de WAMERCIO; los tokens de conexión se almacenan cifrados en el backend con `PLATFORM_CONFIG_SECRET`.

Los módulos visibles incorporados son **Multimedia**, **Publicaciones**, **Evaluaciones** y la ampliación de **Métodos de pago**. Cada conexión, publicación, activo multimedia y configuración pertenece a un `store_id`.

## Publicaciones y Promociones

El compositor social admite borradores, aprobadas, programadas, publicación inmediata, estados parciales/fallidos, reintentos por destino, texto por plataforma, enlace/CTA y recursos de la Biblioteca multimedia. Una Promoción de WAMERCIO puede abrir directamente el compositor con el contexto de la promoción prellenado.

## Perfil de Empresa en Google

El workspace de Google Business permite trabajar con perfil, ubicación, horario, reseñas/respuestas, rendimiento y multimedia. La sincronización de horarios normaliza explícitamente el formato Google ↔ WAMERCIO en lugar de almacenar el payload del proveedor directamente.

## Evaluaciones nativas por WhatsApp

Al cerrar una conversación, WAMERCIO puede enviar una **encuesta nativa de WhatsApp** con cinco respuestas configurables de 1 a 5. El bridge utiliza `BuildPollCreation`, correlaciona el ID enviado y descifra la selección recibida mediante `DecryptPollVote`; solo el voto perteneciente a la encuesta pendiente de esa conversación puede registrar la evaluación. El flujo admite feedback posterior, agradecimiento e invitación neutral a reseña de Google.

El panel de Evaluaciones incluye filtros por agente, canal y fechas, impresión y exportación compatible con Excel.

## Métodos de pago y cuentas bancarias

Cada tienda puede registrar varias cuentas bancarias usando el catálogo de bancos de la plataforma, elegir la cuenta principal para transferencias y la cuenta vinculada a terminal, y configurar comisión porcentual/fija. El método **Cheque** requiere habilitación del negocio y autorización explícita del cliente en ese negocio.

## Actualización

Las migraciones nuevas son `000038_social_google_evaluations`, `000039_store_bank_accounts` y `000040_customer_cheque_authorization`. Consulta `CHANGELOG.md` y `DEPLOY_DOKPLOY.md` antes de desplegar.

## Bloqueo comercial por negocio (2.8.12)

Los negocios pueden bloquear a un cliente localmente indicando un motivo obligatorio. El bloqueo no afecta la cuenta global del cliente ni su acceso a otros negocios. Superadmin puede auditar los bloqueos por negocio.
