# WAMERCIO V4.3.2 — SuperAdmin UX, perfil y softphone global

## Objetivo

Esta entrega elimina la duplicidad funcional detectada en el SuperAdmin y separa claramente tres responsabilidades:

1. **Configuración → WhatsApp → Proveedor y sesión global:** único lugar para vincular, renovar QR, consultar identidad de la sesión y desvincular el número oficial de soporte.
2. **WhatsApp de soporte:** únicamente chat operativo con los comerciantes. No contiene QR ni acciones de vinculación/desvinculación.
3. **Softphone del SuperAdmin:** llamadas WhatsApp entrantes y salientes utilizando exclusivamente esa misma sesión global de soporte.

La implementación conserva el lenguaje visual WACatelog/WAMERCIO introducido en V4.2–V4.3 y reutiliza el patrón del softphone existente en los negocios.

## Cambios de interfaz

### WhatsApp de soporte

`apps/web/app/admin/whatsapp/page.tsx` fue convertido en un centro de chat puro. Mantiene listado de comerciantes, búsqueda, mensajes, adjuntos, estados de lectura/envío y refresco. Si la sesión global no está vinculada, muestra un estado informativo y dirige a Configuración en lugar de intentar crear un QR.

No hay llamadas frontend a `/admin/whatsapp/connect` ni `/admin/whatsapp/disconnect` fuera de `admin/settings/page.tsx`. Además, ambos endpoints quedan protegidos con `requireAdminArea("settings")`, por lo que la separación también se aplica en backend y no solo en la interfaz.

### Proveedor y sesión global

`apps/web/app/admin/settings/page.tsx` conserva las acciones reales de vincular/desvincular y el QR. El copy deja explícito que es el **único lugar** para administrar el dispositivo global.

Los enlaces `?section=whatsapp` abren directamente la sección WhatsApp. Se usa `window.location.search` dentro de `useEffect`, evitando introducir un requisito de `Suspense` por `useSearchParams` durante el build estático de Next.js 14.

### Perfil del SuperAdmin

Nueva ruta: `apps/web/app/admin/profile/page.tsx`.

Permite:

- actualizar nombre;
- actualizar correo de acceso;
- cambiar la contraseña validando la contraseña actual;
- consultar rol y permisos sin permitir autoescalado de privilegios.

Backend nuevo:

- `PATCH /api/v1/admin/me`
- `POST /api/v1/admin/me/password`

Al guardar el perfil se emite `wamercio:admin-profile-updated`, por lo que el nombre/iniciales de la topbar se actualizan sin recargar toda la aplicación.

### Sidebar y cuenta

`apps/web/components/superadmin-shell.tsx`:

- elimina el botón inferior duplicado **Cerrar sesión**;
- mantiene un único cierre de sesión en el menú superior de cuenta;
- añade **Mi perfil** al menú superior;
- renombra **WhatsApp SaaS** a **WhatsApp de soporte**;
- añade en el pie de la sidebar el launcher **Abrir softphone / Sesión global de soporte**.

## Softphone global del SuperAdmin

Nuevo componente: `apps/web/components/superadmin-support-softphone.tsx`.

El softphone sigue el patrón visual y operativo del softphone existente de negocios:

- Document Picture-in-Picture cuando el navegador lo permite;
- fallback flotante dentro del panel cuando PiP no está disponible o Chromium bloquea la creación automática sin gesto de usuario;
- directorio de comerciantes;
- teclado de marcación;
- llamada saliente;
- detección de llamada entrante;
- contestar/rechazar/colgar;
- silenciar/activar micrófono;
- poner en espera/reanudar;
- notificación de navegador para llamadas entrantes cuando existe permiso;
- continuidad mientras el SuperAdmin navega por otras secciones.

El botón **Contestar** aprovecha el gesto real del usuario para solicitar Document-PiP antes de negociar el audio, siguiendo el mismo criterio aplicado al softphone de negocios.

### API del softphone SuperAdmin

Se añadieron:

- `GET /api/v1/admin/whatsapp/calls/status`
- `POST /api/v1/admin/whatsapp/calls`
- `POST /api/v1/admin/whatsapp/calls/{id}/answer`
- `POST /api/v1/admin/whatsapp/calls/{id}/reject`
- `POST /api/v1/admin/whatsapp/calls/{id}/hangup`
- `POST /api/v1/admin/whatsapp/calls/{id}/hold`
- `POST /api/v1/admin/whatsapp/calls/{id}/resume`
- `POST /api/v1/admin/whatsapp/calls/{id}/webrtc`

Todos proxyan al motor de llamadas embebido usando `store_id = "support"`.

### WhatsApp bridge

`services/whatsapp-bridge/internal/bridge/calls_engine.go` ahora trata `SupportSessionKey` como una sesión válida para llamadas. La sesión global:

- puede originar llamadas;
- recibe `CallOffer`;
- mantiene el registro vivo de llamadas en memoria;
- expone snapshots de estado al SuperAdmin;
- prioriza `CallerPn` para identificar correctamente llamadas entrantes cuando el peer usa LID;
- no crea registros tenant ni activa grabación/transcripción por defecto.

Esta separación evita asociar una llamada de soporte central a una base/tienda concreta.

## WebRTC

`apps/web/lib/calls-webrtc.ts` acepta ahora opcionalmente una función para construir el endpoint WebRTC. El softphone de negocios conserva su endpoint original y el SuperAdmin utiliza `/admin/whatsapp/calls/{id}/webrtc`.

No se duplicó el motor WebRTC ni se añadió un servicio externo.

## Base de datos

**No hay migraciones nuevas.** Se reutilizan usuarios administrativos, conversaciones de soporte y la sesión global existente. Las llamadas globales se administran como estado vivo del bridge y no se insertan en las tablas tenant de llamadas.

## Validación realizada

- `gofmt` aplicado a los archivos Go modificados.
- Parser TypeScript ejecutado sobre 112 archivos TS/TSX: **0 errores de sintaxis**.
- Verificación de duplicidad: las llamadas frontend a `admin/whatsapp/connect` y `admin/whatsapp/disconnect` existen únicamente en Configuración.
- Verificación de chat: `/admin/whatsapp` no contiene QR ni botones de vincular/desvincular.
- Verificación de versión: `VERSION`, `package.json` y service worker actualizados a **4.3.2**.
- El `go test` integral no pudo ejecutarse en este entorno porque el Go local es 1.23.2 y el proyecto exige Go 1.26; la descarga automática del toolchain quedó bloqueada por falta de acceso DNS a `proxy.golang.org`.
- El `npm install` local tampoco pudo completarse dentro del tiempo disponible por falta de acceso efectivo al registry. Por ello la validación definitiva de `next build` debe ejecutarse en Dokploy, donde el pipeline del proyecto ya usa Node 20 y Go 1.27.x.

## Despliegue

No borres PostgreSQL ni reinicies las migraciones. Sustituye el código por V4.3.2 y reconstruye como mínimo:

- `web`
- `api`
- `whatsapp`

El contenedor `whatsapp` debe reconstruirse obligatoriamente porque allí se habilita la sesión `support` dentro del motor de llamadas. Mantén configuradas las variables de red WebRTC utilizadas por el softphone de negocios (`WAMERCIO_WEBRTC_EXTERNAL_IP` y rango UDP publicado) para que el audio del SuperAdmin utilice la misma infraestructura.
