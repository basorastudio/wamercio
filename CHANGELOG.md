# WAMERCIO 4.1.6 — Call Lifecycle & Media Recovery

- Replica el patrón de lifecycle de Hierro del Norte: una llamada que entra a `Ended` se libera localmente de inmediato, sin esperar persistencia HTTP.
- Hace asíncronos los callbacks de estado hacia el API para no bloquear los eventos de WhatsMeow ni el teardown de audio.
- Añade watchdog de setup para llamadas salientes estancadas.
- Expone snapshots de llamadas vivas desde el motor y reconcilia la base de datos contra el registry real del Bridge.
- Evita regresiones Ringing/Connecting después de Active/Held y conserva terminales como estados monotónicos.
- Si llega audio SRTP válido en una salida todavía marcada Ringing, recupera automáticamente el estado a Connecting/Active.
- Añade recuperación del relay WhatsApp/SRTP y finalización segura si el medio no vuelve.
- Detecta pérdida del WebRTC del navegador para permitir reconectar audio sin dejar una interfaz falsa.
- Reduce el polling duplicado del estado del motor.
- Mantiene una sola interfaz Softphone para entrantes y salientes.

---

# WAMERCIO 4.1.5 — Softphone unificado + llamadas salientes

- Unifica llamada entrante, llamada activa y marcador en el mismo softphone visual; elimina el modal blanco alternativo del runtime de Calls.
- Las llamadas entrantes aparecen directamente en el softphone embebido cuando PiP no puede abrirse automáticamente.
- Corrige la preparación de llamadas salientes: `requested_by` se tipa explícitamente como texto en PostgreSQL y las relaciones opcionales se adjuntan después del registro crítico.
- Amplía la ventana de preparación de llamada saliente para permitir resolución PN→LID, USync y cifrado sin cortar prematuramente el motor.
- Impide ofrecer `Conectar audio` durante una llamada entrante todavía en estado `ringing`; `Contestar` acepta la llamada y conecta el audio.
- `hangup` y `reject` son idempotentes: aunque el peer ya haya terminado o el Bridge pierda la respuesta, el estado local queda terminal y el softphone no se congela.
- Los estados terminales son monótonos: eventos tardíos `ringing/connecting` no pueden resucitar una llamada finalizada.
- Al colgar/rechazar, el softphone vuelve limpiamente al Directorio/Teclado y elimina errores de la llamada anterior.
- Cache PWA actualizado a `wamercio-store-v4.1.5`.

---

# WAMERCIO 4.1.4 — Calls runtime + UX estable

- Reubica **Abrir softphone** desde el botón flotante inferior derecho a la sidebar, inmediatamente encima de la tarjeta del usuario.
- Mueve el softphone a un único `CallsSoftphoneHost` montado en el layout raíz, evitando que se destruya/recree al navegar entre páginas.
- Evita que una llamada entrante cerrada vuelva a abrir el modal de forma repetitiva; el descarte se comparte también entre pestañas del navegador mediante `localStorage`.
- Mantiene el PiP y la llamada activos al navegar por WAMERCIO, sin overlays duplicados por pantalla.
- Separa los timeouts de Calls del timeout HTTP genérico de 12 segundos: 40 s para iniciar llamada, 30 s para acciones y 15 s para WebRTC.
- Propaga al frontend el error real del motor integrado en vez de un `502` genérico.
- Persiste inmediatamente el estado devuelto por el motor (`ringing`, `connecting`, `active`, etc.) para que la UI no quede congelada en **Timbrando** si un webhook se retrasa.
- Reconcilia automáticamente llamadas `ringing` o `connecting` obsoletas para que no bloqueen el softphone indefinidamente.
- `AcceptCall` solo cambia localmente a **Conectando** después de construir y enviar correctamente el stanza `accept` a WhatsApp; los errores de cifrado/señalización ahora vuelven a la UI.
- Amplía a 25 s el timeout interno para contestar/rechazar/colgar dentro del WhatsApp Bridge.
- Agrega guardas contra doble marcado y mejora la transición Modal ↔ Picture-in-Picture.
- Traduce estados visibles de PiP al español y muestra **Preparando llamada…** durante el establecimiento saliente.
- No agrega migraciones ni dependencias externas de Calls.

---

# WAMERCIO 4.1.3 — Hotfix de compilación Calls/Clientes

- Corrige `undefined: conversationID` en `listConversations`, error detectado por el build real de Go en Dokploy.
- Mantiene `conversation_id` únicamente en `listCustomers`, donde la variable está declarada, escaneada y devuelta correctamente.
- Conserva la clasificación correcta del softphone: Clientes → `customer`, Contactos → `contact`.
- La ficha de cliente ahora pasa también `detail.conversation_id` al softphone.
- Añade `test_4_1_3_build_scope.py` para impedir que referencias de `listCustomers` vuelvan a filtrarse a `listConversations`.
- Sin migraciones nuevas.

---

# WAMERCIO 4.1.2 — Hotfix build Clientes/Softphone

- Corrige el error de `next build` en `app/customers/page.tsx` por uso de `c.conversation_id` no declarado en el tipo `Customer`.
- Añade `conversation_id?: string` al tipo `Customer`.
- El endpoint `GET /customers` ahora devuelve la conversación WhatsApp más reciente asociada al cliente.
- Corrige el botón Llamar de Clientes para identificar el destino como `customer`, no como `contact`.
- Mantiene el softphone global, PiP, directorio y motor Calls integrado sin nuevas migraciones.

---

# WAMERCIO 4.1.1 — Softphone en Chat y Clientes

- Añade botón **Llamar** en el encabezado del chat de WhatsApp.
- Añade botón **Llamar** en la tabla de Clientes y en la tabla de Contactos.
- Añade botón **Llamar** en la ficha comercial del cliente.
- Incorpora el componente reutilizable `calls-softphone.tsx` con marcador integrado, teclado numérico, precarga del contacto activo y acceso rápido al centro de llamadas.
- Permite iniciar la llamada y administrar audio/estado desde la propia interfaz contextual, sin obligar al usuario a salir del chat o del directorio comercial.
- Mantiene el mismo patrón visual y operativo del módulo de llamadas ya integrado en WAMERCIO.

---

# WAMERCIO 4.1.0 — Motor de llamadas integrado

- Integra WACalls/WebRTC directamente en `whatsapp-bridge`; elimina la dependencia de `CALLS_ADAPTER_URL` y `CALLS_ADAPTER_SECRET`.
- Porta y adapta el motor de llamadas probado de Hierro del Norte: señalización WhatsApp, LID, cifrado de call keys, relays, SRTP y MLow.
- Añade WebRTC PCM de navegador con rango UDP e IP pública configurables dentro del mismo despliegue WAMERCIO.
- Separa correctamente el UUID interno de `whatsapp_calls` del Call ID externo de WhatsApp generado por `signaling.GenerateCallID()`.
- Implementa llamada saliente/entrante, contestar, rechazar, hangup, hold/resume y transferencia de agente.
- Implementa grabación estéreo WAV persistente y enlazada al historial de llamada.
- Conecta transcripción de llamadas al motor STT existente; activar transcripción implica grabación.
- Añade controles de audio del navegador, acceso a grabación y vista resumida de transcripción en el panel Calls.
- Añade variables `WAMERCIO_WEBRTC_EXTERNAL_IP`, `WAMERCIO_WEBRTC_UDP_PORT_MIN`, `WAMERCIO_WEBRTC_UDP_PORT_MAX` y `WAMERCIO_CALLS_MAX_PER_STORE`.
- Publica el rango UDP en Docker Compose.
- No agrega migraciones; reutiliza `000047_calls_premium`.

---

# WAMERCIO 4.0.1 — Hotfix de build del portal de cotizaciones

- Corrige el error de TypeScript/React en `app/quote/[token]/page.tsx`: `useEffect` ya no recibe una función que retorna `Promise<void>`.
- La carga pública de cotizaciones se ejecuta mediante `useEffect(() => { void load() }, [token])`.
- Añade la regresión `scripts/test_4_0_1_web_build_hotfix.py` para impedir que una función `load` que retorna una promesa vuelva a pasarse directamente como `EffectCallback`.
- Actualiza la versión web y el cache PWA a `4.0.1` para evitar reutilizar assets de la compilación fallida/anterior.
- No agrega migraciones ni altera API/WhatsApp/Domain Router; los tres ya compilaron correctamente en el build de Dokploy reportado.

---

# WAMERCIO 4.0.0 — Expansión Operativa y Comercial

## Nuevo

### 3.1 Cotizaciones Conversacionales PRO
- Modelo `quotes` independiente del pedido.
- Artículos, revisiones, eventos, enlaces seguros y follow-ups.
- Portal público responsive para aceptar/rechazar.
- PDF generado por la API sin dependencia externa.
- Conversión a pedido.
- Sincronización automática con CRM.

### 3.2 Delivery PRO
- Persistencia de payload estructurado y coordenadas WhatsApp.
- Asociación de una ubicación recibida a dirección global del cliente.
- Zonas manuales, territoriales y por radio.
- Asignaciones y estados de entrega.
- Rutas y paradas.
- Optimización local nearest-neighbour, distancia Haversine y ETA operativo.
- Modo Repartidor con `watchPosition` y eventos de ubicación.

### 3.3 CRM Operativo
- Etapas, oportunidades, tareas y actividad.
- Kanban comercial.
- Integración cotización ↔ oportunidad.
- Trigger visual `task_due` con protección contra doble disparo.

### 3.4 Flow Builder
- Flujos, nodos, conexiones, runs y steps.
- Triggers comerciales y conversacionales.
- Acciones WhatsApp, etiquetas, colas, tareas, prioridad y seguimientos persistentes.
- Condición de contenido y ramificación true/false.

### 3.5 Voz/Transcripción
- Configuración por tienda.
- Cola persistente de transcripciones.
- Proveedor STT configurable.
- Búsqueda y render de transcripciones en chat.

### Calls Premium
- Control plane de llamadas multi-tenant.
- Eventos entrantes desde adaptador WACalls/WebRTC.
- Iniciar, contestar, rechazar, colgar, hold, resume y transfer.
- Historial, grabación y transcripción como propiedades de llamada.

## Mejorado
- Sidebar y navegación para Cotizaciones, CRM, Tareas, Flow Builder, Voz y Calls.
- Registros de atención muestra la última ubicación WhatsApp exacta y permite convertirla en dirección.
- Delivery muestra distancia/ETA de rutas y acceso a Modo Repartidor.
- Mensajes de audio muestran transcripción cuando existe.
- Ubicaciones usan coordenadas estructuradas en vez de depender de texto.
- Service Worker actualizado a `wamercio-store-v4.0.0`.

## Compatibilidad
- Se conserva Centro Conversacional PRO 3.0.0.
- Se conservaron las regresiones de identidad global, clientes/contactos, POS, mesas/reservas, WhatsApp, mapas, bloqueo, pagos, cheque, evaluaciones y publicación social.
