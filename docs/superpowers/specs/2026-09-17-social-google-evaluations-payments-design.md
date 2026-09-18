# WAMERCIO V2.9.0 — Social, Google Business, Evaluaciones y Pagos

## Objetivo
Portar a WAMERCIO las capacidades probadas de Hierro del Norte v1.5.16 para conexión social mediante Proxy Auth, publicación multicanal, Perfil de Empresa en Google, evaluaciones CSAT de atención y cuentas bancarias múltiples, adaptadas al modelo multi-tenant por `store_id` de WAMERCIO.

## Principios
- Cada conexión, publicación, cuenta bancaria, configuración y evaluación pertenece a una tienda.
- El propietario nunca introduce Client ID, Client Secret, access tokens ni contraseñas sociales.
- Se reutiliza el broker Proxy Auth de HDN por defecto: `https://auth-apps.bitapps.pro/apps` + `https://auth-apps.bitapps.pro/redirect/v2`.
- Facebook e Instagram comparten las credenciales Meta del broker, pero se guardan como destinos separados.
- Los tokens se cifran con `PLATFORM_CONFIG_SECRET` antes de persistir.
- OAuth usa `state` de corta duración; Google añade PKCE.
- Las publicaciones son idempotentes por destino: un reintento solo reenvía destinos pendientes/fallidos.
- La UX usa los mismos `StoreShell`, cards, tablas, modales, botones y paleta de WAMERCIO.
- `America/Santo_Domingo` es la zona horaria por defecto.

## Subsistemas

### 1. Conexiones sociales
Nueva pantalla `Configuración → Redes sociales` con Facebook, Instagram, LinkedIn y Perfil de Empresa en Google. El botón Conectar abre el proveedor oficial mediante Proxy Auth y el callback asocia los destinos descubiertos a la tienda activa. Se permiten varias cuentas/destinos por proveedor.

### 2. Multimedia y Publicaciones
`Multimedia` guarda recursos reutilizables por tienda. `Publicaciones` permite borradores, aprobadas, programadas, publicadas, fallidas y parciales; texto base + adaptación por proveedor; enlace; selección de recursos; destinos; publicar ahora; programar; reintentar fallos. Las promociones pueden abrir el compositor prellenado.

### 3. Google Business
Workspace por conexión con interruptores para ubicación, reseñas, publicaciones y horario. Se incluyen lectura del perfil, sincronización desde/hacia Google, reseñas y respuestas, rendimiento y multimedia. Las funciones que dependan de permisos/cuota del proveedor devuelven mensajes claros cuando no estén disponibles.

### 4. Evaluaciones
Al cerrar una conversación se puede generar una evaluación 1–5 vía WhatsApp. La configuración incluye pregunta, cinco etiquetas, feedback privado para notas bajas, agradecimiento e invitación neutral a reseña de Google. La primera respuesta válida queda definitiva. La pantalla de Evaluaciones ofrece filtros, promedio y distribución.

### 5. Métodos de pago y cuentas
La pantalla se divide en `Métodos` y `Cuentas`. Se agregan múltiples cuentas bancarias por tienda referenciando `platform_banks`; cuenta principal de transferencia; cuenta vinculada al terminal; comisión porcentual/fija; cheque opcional. La configuración legacy del store se migra como primera cuenta para conservar compatibilidad.

## Persistencia
Migraciones nuevas desde `000038`:
- `store_social_connections`
- `social_oauth_transactions`
- `store_social_posts`
- `store_social_post_deliveries`
- `store_media_assets`
- `store_google_business_settings`
- `store_evaluation_settings`
- `store_customer_evaluations`
- `store_evaluation_pending`
- `store_bank_accounts`
- columnas de liquidación bancaria en `stores`

## Seguridad
- Verificación de ownership `store_id` en todos los endpoints merchant.
- Tokens cifrados y nunca devueltos al frontend.
- `state` almacenado como hash y expiración de 10 minutos.
- Cookies OAuth HttpOnly, SameSite=Lax y Secure bajo HTTPS.
- PKCE para Google.
- URLs públicas de medios solo se resuelven contra `APP_URL`.
- No se permite publicar en destinos de otra tienda.

## Compatibilidad
No se cambia el contrato público del storefront. Los métodos legacy de pago siguen disponibles; las nuevas cuentas amplían el modelo. Si el broker social está caído, el resto de WAMERCIO continúa operativo.
