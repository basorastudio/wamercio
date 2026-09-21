# WAMERCIO 4.3.0

> **V4.3.0 — PANEL DE NEGOCIO + STOREFRONT WACatelog-style:** rediseña el área operativa de los comercios y el frontend público con el patrón visual de WACatelog, manteniendo la lógica propia de WAMERCIO. Incluye sidebar verde agrupada, dashboard por negocio con métricas/gráficos reales desde `/analytics` y `/orders`, navegación reorganizada sin eliminar módulos, catálogo público con hero verde/patrón conversacional, categorías tipo chip, búsqueda, grilla densa de productos y acciones conectadas al carrito/modal/checkout existente. El backend amplía `top_products` con `product_id` e `image_url` para alimentar el dashboard. Consulta `IMPLEMENTACION_V4.3.0_MERCHANT_STOREFRONT.md`.

# WAMERCIO 4.2.2

> **V4.2.2 HOTFIX:** corrige el fallo de compilación de producción de la página comercial del SuperAdmin causado por un icono inexistente de `lucide-react` (`Storefront`). Se reemplaza por el icono soportado `Store`, manteniendo intacta la funcionalidad y el backend de V4.2.1. Consulta `HOTFIX_V4.2.2.md`.

> **V4.2.1:** refina el SuperAdmin con el patrón visual operativo de WACatelog y convierte los controles principales en funciones reales conectadas al backend: sidebar verde, topbar interactiva, búsqueda, menú de cuenta, selector de periodo del dashboard, gráficos alimentados por `/admin/dashboard`, activación/desactivación de negocios y planes, y editor de la página comercial con estado de publicación, copia de URL, vista previa y guardado persistente. Consulta `IMPLEMENTACION_V4.2.1_ADMIN_FUNCIONAL.md`.

> **V4.2.0:** rediseño visual integral de la landing pública y SuperAdmin inspirado en WACatelog, adaptado a la identidad y arquitectura de WAMERCIO. Incluye hero WhatsApp-first, recorrido conversacional, comparación de checkout, planes renovados, sidebar/topbar SaaS, búsqueda administrativa y dashboard con tendencias reales. Consulta `IMPLEMENTACION_V4.2.0_WACATALOG_UI.md`.

> **V4.1.12:** Clientes y Contactos abren el chat interno de WAMERCIO; Contactos incorpora bloqueo/desbloqueo con motivo y auditoría; Usuarios utiliza PIN progresivo por dígitos. Consulta `HOTFIX_V4.1.12.md`.

> **V4.1.9:** conserva una sola superficie canónica Document-PiP y elimina también el estado alternativo de llamada entrante de la sidebar. Las entrantes intentan abrir/focalizar directamente el PiP oficial; si Chromium bloquea crear una nueva ventana sin activación del usuario, WAMERCIO mantiene la llamada pendiente y usa la siguiente interacción para abrir ese mismo PiP, sin clones. Consulta `HOTFIX_V4.1.9.md`.
> **V4.1.7:** Unificación de controles por estado y cronómetro desde `answered_at`, siguiendo el patrón operativo del softphone de Hierro del Norte. Consulta `HOTFIX_V4.1.7.md`.
> **V4.1.6:** Ciclo de llamadas endurecido según el patrón de Hierro del Norte: liberación inmediata al terminar, reconciliación con el motor vivo, watchdog de salida, recuperación de relay/audio y promoción a Activa por media real. Consulta `HOTFIX_V4.1.6.md`.
>
> **V4.1.5:** Calls usa una sola interfaz de softphone para entrantes/salientes, corrige el bloqueo de llamadas salientes en PostgreSQL y evita que estados atrasados vuelvan a mostrar una llamada ya finalizada. Consulta `HOTFIX_V4.1.5.md`.


Esta entrega añade el **softphone global tipo Hierro del Norte**: launcher integrado en la sidebar, Picture-in-Picture canónico, directorio interno de Contactos/Clientes/Usuarios y llamada directa desde Chat/Clientes/Contactos. El motor de llamadas continúa integrado dentro de WAMERCIO.

Ver `IMPLEMENTACION_V4.1.1.md` y `DEPLOY_DOKPLOY.md`.

---

# WAMERCIO 4.1.0

WAMERCIO 4.1.0 integra **WAMERCIO Calls** directamente dentro del stack de la plataforma. Ya no requiere un servicio WACalls/WebRTC externo ni las variables `CALLS_ADAPTER_URL` / `CALLS_ADAPTER_SECRET`.

Conserva todos los módulos de 4.0.1: Centro Conversacional PRO, Cotizaciones, Delivery, CRM, Tareas, Flow Builder, Voz/Transcripción, POS, identidad global, WhatsApp y publicación social.

## WAMERCIO Calls integrado

El motor reside dentro de `services/whatsapp-bridge`, el mismo proceso que posee la sesión WhatsMeow de cada negocio. Incluye:

- Señalización de llamadas 1:1 de WhatsApp: offer, preaccept, accept, transport, reject y terminate.
- Resolución PN → LID y cifrado de call keys por dispositivo.
- Transporte relay/SRTP y códec MLow de 16 kHz.
- Puente WebRTC del navegador mediante DataChannel PCM.
- Llamadas entrantes y salientes desde la interfaz de WAMERCIO.
- Contestar, rechazar, colgar, poner en espera, reanudar y transferir entre agentes.
- Registro e historial multi-tenant por `store_id`.
- Grabación estéreo WAV: agente a la izquierda y cliente a la derecha.
- Transcripción de llamadas usando el mismo proveedor STT configurable de Voz.
- Límite de llamadas simultáneas por negocio configurable.

La fila SQL de la llamada y el Call ID de WhatsApp son entidades separadas: WAMERCIO conserva su UUID interno y el bridge genera un `external_call_id` criptográficamente aleatorio compatible con la señalización de WhatsApp.

## Red WebRTC

No hay un servicio externo de llamadas, pero el navegador necesita alcanzar el servidor WAMERCIO por UDP. Configura la IP pública del VPS y abre/mapea el rango elegido:

```env
WAMERCIO_WEBRTC_EXTERNAL_IP=203.0.113.10
WAMERCIO_WEBRTC_UDP_PORT_MIN=55000
WAMERCIO_WEBRTC_UDP_PORT_MAX=55100
WAMERCIO_CALLS_MAX_PER_STORE=8
```

`docker-compose.yml` publica ese mismo rango UDP desde el contenedor `whatsapp`. El micrófono del navegador requiere HTTPS.

## Transcripción

```env
STT_API_URL=
STT_API_KEY=
STT_MODEL=whisper-1
```

La transcripción es opcional. Si se activa **Transcribir llamadas**, WAMERCIO activa también la grabación porque el archivo de audio es la fuente del STT.

## Migraciones

No hay una migración nueva en 4.1.0. Se conservan `000042`–`000047`; la integración del motor ocurre en Bridge/API/Web y reutiliza `store_call_settings`, `whatsapp_calls` y `call_events`.

## Verificación

```bash
sh scripts/verify-4.1.0.sh
```

## Despliegue

Consulta `DEPLOY_DOKPLOY.md`. Para esta versión recompila al menos **WhatsApp Bridge, API y Web**.


## WAMERCIO 4.1.3

Hotfix de compilación del softphone global: corrige el scope de `conversationID` en el API y mantiene la asociación Cliente/Conversación para llamadas contextuales. Ver `HOTFIX_V4.1.3.md`.
