# WAMERCIO V4.5.0 — WA UI Chat unificado

## Objetivo

V4.5.0 reemplaza el lenguaje visual propio del área de conversaciones por un port interno compatible con el stack actual de WAMERCIO, inspirado/adaptado de WA UI (MIT). El cambio se aplica tanto al chat de los negocios (`/conversations`) como al chat de soporte del SuperAdmin (`/admin/whatsapp`) sin sustituir el backend, WhatsMeow, los endpoints existentes ni las funciones comerciales de WAMERCIO.

La prioridad fue conservar el comportamiento actual y cambiar la capa de presentación para que el usuario reconozca inmediatamente una experiencia similar a WhatsApp Web.

## Estrategia adoptada

No se instaló WA UI como dependencia y no se actualizó WAMERCIO a Next 16 / React 19 / Tailwind 4. En su lugar se creó un port interno para:

- Next.js 14.2.35
- React 18.3.1
- Tailwind CSS 3.4.17
- lucide-react existente

Por tanto no se añadieron dependencias NPM nuevas ni se modificó el contrato de la API.

## Núcleo visual compartido

Nuevo archivo:

`apps/web/components/whatsapp-ui/wa-ui.tsx`

Incluye componentes compartidos para negocio y SuperAdmin:

- `WaAvatar`
- `WaMessageStatusIcon`
- `WaChatListItem`
- `WaChatHeader`
- `WaHeaderAction`
- `WaDateSeparator`
- `WaMessageBubble`
- `WaConversationTimeline`
- `WaComposerShell`
- `WaComposerInput`
- `WaComposerAction`
- `WaSendButton`
- `WaSidebarSearch`
- `WaFilterChip`
- `WaEmptyChat`

El timeline agrupa visualmente los mensajes, añade separadores `HOY` / `AYER` / fecha, mantiene referencias para la búsqueda dentro de la conversación y utiliza checks simples/dobles con color azul para lectura.

## Tema aislado

Los estilos se añadieron a `apps/web/app/globals.css` pero todos quedan encapsulados bajo:

`.wamercio-wa-ui`

Esto evita contaminar Dashboard, TPV, Caja, SuperAdmin, landing, storefront u otras pantallas.

El tema incorpora superficies, tipografía, sidebar, búsquedas, filtros, avatares, encabezado, burbujas, estados, compositor, audio, documentos, interactivos y responsive móvil.

## Wallpaper propio

Se añadió:

`apps/web/public/wamercio-chat-pattern.svg`

Es un patrón gráfico propio de WAMERCIO para el fondo de la conversación. No se incrustan logotipos ni assets oficiales de WhatsApp.

## Chat de negocios

`apps/web/app/conversations/page.tsx`

Ahora utiliza el núcleo compartido para:

- bandeja de conversaciones;
- buscador;
- filtros;
- avatar y preview;
- contador de no leídos;
- encabezado del contacto;
- status del ticket;
- timeline;
- burbujas;
- checks;
- separadores de fecha;
- compositor;
- empty state.

Se conservaron las funciones propias de WAMERCIO:

- Todos / No leídos / Sin asignar / Urgentes / SLA / Clientes / Contactos;
- colas y agentes;
- prioridad y SLA;
- reabrir/resolver/devolver/transferir ticket;
- búsqueda dentro del chat;
- programar mensaje;
- vaciar/exportar/cerrar/bloquear/eliminar conversación;
- respuestas rápidas;
- encuestas;
- adjuntos;
- notas de voz;
- llamadas/softphone;
- panel del contacto;
- CRM;
- pedidos/carrito;
- registros de atención;
- ubicación y delivery.

## WhatsApp de soporte del SuperAdmin

`apps/web/app/admin/whatsapp/page.tsx`

Se migró al mismo sistema visual que el chat de los negocios:

- misma lista de chats;
- mismo header;
- mismo timeline;
- mismas burbujas;
- mismo compositor;
- mismos estados de mensajes;
- mismo patrón de búsqueda y filtros;
- mismo empty state.

Continúan funcionando las particularidades del SuperAdmin:

- filtros Activos/Inactivos;
- sesión global de soporte;
- llamadas con softphone global;
- información del comerciante;
- cuenta SaaS / plan / negocio principal;
- búsqueda interna;
- marcar no leído;
- exportar;
- vaciar historial local;
- eliminar conversación;
- encuestas, adjuntos, respuestas rápidas y voz.

## Renderizador de mensajes

Se rediseñó:

`apps/web/components/whatsapp-message-content.tsx`

El renderizador conserva el tipo de mensaje recibido del backend y ofrece representación visual consistente para:

- texto y enlaces;
- imágenes;
- video;
- video circular/PTV;
- stickers;
- documentos y archivos;
- notas de voz/audio con play/pause, waveform, progreso y duración;
- transcripción de audio;
- ubicación;
- ubicación en vivo;
- contactos;
- encuestas;
- reacciones;
- producto/pedido/catálogo;
- botones;
- listas;
- mensajes interactivos;
- plantillas;
- fallback para tipos todavía no previsualizables.

Las opciones/botones incluidos en `structured_payload` se muestran cuando el backend los proporciona. No se inventan datos ausentes.

## Compatibilidad y arquitectura

No se cambiaron:

- esquema PostgreSQL;
- migraciones;
- Redis;
- contratos de endpoints;
- WhatsMeow / bridge;
- multi-tenancy;
- autenticación;
- llamadas WebRTC;
- lógica de CRM, pedidos, caja o delivery.

La versión sigue utilizando todo el backend de V4.4.0 y sus migraciones hasta `000051_business_operations`.

## Licencia y atribución

WA UI está distribuido bajo MIT. Se preserva el aviso de licencia en:

`apps/web/components/whatsapp-ui/WA-UI-LICENSE.txt`

También se añadió:

`THIRD_PARTY_NOTICES.md`

WAMERCIO conserva su propia marca y utiliza un port de componentes dentro del repositorio, sin dependencia de `ui.meta-cloud-api.site` en runtime.

## Versión / PWA

- `VERSION` → `4.5.0`
- `apps/web/package.json` → `4.5.0`
- Service worker → `wamercio-store-v4.5.0`

Esto fuerza la renovación de la caché de la PWA tras desplegar.

## Validaciones ejecutadas

Se ejecutó `scripts/test_4_5_0_wa_ui_chat.py` y todos sus chequeos resultaron OK:

- versión;
- scope de Merchant;
- scope de SuperAdmin;
- uso de componentes compartidos;
- timeline compartido;
- tipos de mensajes;
- tokens visuales;
- wallpaper;
- atribución MIT;
- PWA.

También se analizaron sintácticamente todos los archivos `.ts` y `.tsx` del frontend mediante el parser de TypeScript 5 instalado en el entorno:

- Archivos analizados: 116
- Errores de parseo: 0

Se intentó instalar las dependencias NPM para ejecutar `next build`, pero `npm install --no-audit --no-fund` agotó el tiempo disponible del entorno y no creó `node_modules`. Por esa razón no se presenta un `next build` completo como validado aquí. El pipeline de Dokploy debe ejecutar la validación definitiva con Node 20 y las dependencias del proyecto.

## Despliegue

No hay migraciones nuevas.

Para actualizar desde V4.4.0:

1. Reemplazar el código por V4.5.0.
2. Reconstruir `web`.
3. `api` y `whatsapp` pueden mantenerse si ya están en V4.4.0, aunque un redeploy completo es válido.
4. Limpiar/recargar la PWA si el navegador mantiene una pestaña antigua; el nuevo cache key debería hacerlo automáticamente.

No borrar PostgreSQL, Redis ni volúmenes.
