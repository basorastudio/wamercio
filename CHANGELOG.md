# WAMERCIO 4.3.0 — Panel de negocios y storefront inspirados en WACatelog

- Rediseña el shell completo del panel de comerciantes con sidebar verde oscuro, superficies cálidas, bordes suaves y densidad operativa similar a WACatelog.
- Reorganiza la navegación en Principal, Ventas, Catálogo, Tienda online, Interacción, Relación con clientes, Informes y Ajustes, conservando las rutas y funciones existentes.
- Reemplaza el dashboard de inicio por una vista por negocio con selector real de 7/30/90 días y datos de `/analytics` + `/orders`.
- Añade KPI reales de pedidos, ingresos, pedidos por completar y clientes, gráfico de ingresos, distribución por origen, pedidos recientes y productos principales.
- Enriquece `top_products` del backend con `product_id` e `image_url` sin cambiar el contrato base de analytics.
- Rediseña el storefront público con hero verde/patrón conversacional, identidad del negocio, metadatos operativos, categorías tipo chip, búsqueda, grilla responsive densa, footer y CTA de WhatsApp.
- Mantiene funcionales el modal de producto, variantes, extras, productos por peso, carrito, checkout, acceso de cliente y seguimiento; las nuevas tarjetas invocan la lógica existente.
- Aplica los estilos del panel únicamente dentro de `.merchant-ui` para no contaminar SuperAdmin ni superficies de clientes.
- Invalida la caché PWA mediante `wamercio-store-v4.3.0`.
- No agrega migraciones de base de datos.

---

# WAMERCIO 4.2.2 — Hotfix de compilación SuperAdmin

- Corrige el error de TypeScript en `apps/web/app/admin/landing/page.tsx`: `lucide-react` no exporta un componente llamado `Storefront`.
- Sustituye `Storefront` por `Store`, que sí es un icono válido y ya se usa en otras pantallas del proyecto.
- No modifica contratos de API, endpoints, migraciones ni lógica del backend.
- Mantiene intacto el rediseño funcional del SuperAdmin introducido en 4.2.1.
- Invalida la caché PWA mediante `wamercio-store-v4.2.2`.
- No requiere migraciones de base de datos.

---

# WAMERCIO 4.2.1 — SuperAdmin WACatelog-style funcional

- Cambia el SuperAdmin a un lenguaje visual operativo inspirado en WACatelog: sidebar verde oscuro, navegación agrupada, superficies cálidas, tarjetas de borde ligero, tipografía de títulos y acento comercial.
- Convierte la topbar en una superficie interactiva: búsqueda administrativa real, menú de idioma informativo, menú de cuenta, acceso a configuración y cierre de sesión.
- Añade selector real de 3/6/12 meses al dashboard; `/admin/dashboard` acepta `?months=` y devuelve tendencias del periodo seleccionado.
- Los KPI del dashboard navegan a sus módulos reales y los gráficos usan datos del backend, con tooltip en ventas y actualización manual.
- Reestructura Página comercial siguiendo el patrón de Storefront settings: estado Publicada/Mantenimiento, dirección pública con copiar, tarjetas de configuración, vista previa, indicador de cambios pendientes y barra de acciones fija.
- Añade `PATCH /admin/stores/{id}/status` para activar/desactivar negocios sin sobrescribir el resto de su configuración.
- Negocios incorpora búsqueda, selector de estado, contadores, refresh y switch persistente conectado al backend.
- Planes incorpora búsqueda, selector de estado, KPI, refresh y switch persistente conectado al endpoint real de actualización.
- Los estilos se aplican únicamente dentro de `.admin-ui` para no alterar paneles de comerciantes, clientes ni storefronts.
- Invalida la caché PWA mediante `wamercio-store-v4.2.1`.
- No agrega migraciones de base de datos.

---

# WAMERCIO 4.2.0 — Landing y SuperAdmin inspirados en WACatelog

- Reemplaza completamente la landing pública por una experiencia WhatsApp-first inspirada en la composición, jerarquía, superficies cálidas y patrones visuales de WACatelog, manteniendo marca y contenido propios de WAMERCIO.
- Añade hero centrado con mockup de panel comercial, prueba social, fondo de patrón conversacional, recorrido del pedido, chat demostrativo, centro de control, comparación checkout tradicional vs conversación, reseñas, planes, demo QR, contenido educativo y footer comercial.
- Cambia la paleta global de administración hacia verdes profundos, neutros limpios y superficies de baja elevación, acercando el sistema visual al panel de referencia.
- Rediseña SuperAdmin con sidebar blanca agrupada, estado activo verde, colapso persistente, topbar, búsqueda global Ctrl/Cmd+K, accesos rápidos y comportamiento responsive.
- Reemplaza el dashboard SuperAdmin con KPI cards, gráfico real de ventas, salud de pedidos, crecimiento de comerciantes, crecimiento de pedidos, actividad reciente y centro operativo.
- Amplía `/admin/dashboard` con tendencias de los últimos seis meses, salud de pedidos, tickets prioritarios y actividad de auditoría.
- Añade migración `000048_wacatalog_inspired_platform_ui` para actualizar el copy comercial visible sin perder configuración de mantenimiento u otras claves de plataforma.
- Invalida la caché PWA del storefront mediante `wamercio-store-v4.2.0`.

---

# WAMERCIO 4.1.13 — Botón mágico, notas de voz y acciones de ticket

- Convierte el botón principal del composer en un control dinámico: micrófono con campo vacío y enviar al escribir.
- Añade grabación, cancelación, contador y envío de notas de voz desde el navegador.
- Normaliza notas de voz a OGG/Opus con FFmpeg y las marca como PTT en WhatsApp.
- Sustituye el botón duplicado Datos del contacto por un menú de acciones del ticket.
- Implementa Reabrir, Devolver a la cola, Resolver, Transferir, Buscar y Programar mensaje usando APIs existentes.
- Añade búsqueda interna con resaltado y navegación entre coincidencias.
- Añade modales responsive para transferencia de agente y programación de mensajes.
- No agrega migraciones.

---

# WAMERCIO 4.1.12 — WhatsApp interno, bloqueo de contactos y PIN progresivo

- Añade **Abrir chat de WhatsApp** directamente en la tabla **Clientes**.
- Cambia el botón WhatsApp de **Contactos** para abrir `/conversations` dentro de WAMERCIO en vez de `wa.me`/WhatsApp Web externo.
- Añade **Bloquear/Desbloquear contacto** en la tabla Contactos, con motivo de bloqueo, estado visual y auditoría en `conversation_events`.
- Conserva compatibilidad con el bloqueo desde el menú del chat usando un motivo automático cuando el flujo antiguo no envía uno.
- Sustituye el PIN monolítico de **Agregar usuario** por el mismo `PinInput` progresivo de WAMERCIO: un dígito por casilla, autoavance, retroceso inteligente y pegado completo.
- El número de casillas sigue la longitud de PIN configurada por la plataforma (4 por defecto).
- No agrega migraciones nuevas.

---

# WAMERCIO 4.1.11 — Perfil desde sidebar + International Telephone Input global

- Elimina el enlace independiente **Mi cuenta** del grupo Cuenta de la sidebar.
- La tarjeta inferior del usuario (foto, nombre y WhatsApp) abre ahora `/settings/profile`; el botón de cerrar sesión permanece independiente.
- Estandariza los campos de WhatsApp/teléfono con el componente `PhoneInput` basado en `@intl-tel-input/react` + `intl-tel-input`.
- Añade International Telephone Input a Calls, softphone/marcador, Cotizaciones, POS, Reservaciones y WhatsApp de soporte global.
- Mantiene país inicial automático con fallback República Dominicana, selector de bandera, código separado, búsqueda de país, formato internacional y validación.
- El Document Picture-in-Picture del softphone clona las hojas de estilo de WAMERCIO para que el selector internacional funcione también dentro de la ventana PiP.
- Añade variante oscura de `PhoneInput` compatible con el diseño del softphone.

---

# WAMERCIO 4.1.10 — Incoming Call UX + WhatsApp Avatar

- Corrige la foto del perfil de WhatsApp en llamadas salientes: Chat, Clientes y Contactos pasan `avatar_url` al softphone y el API la persiste en `whatsapp_calls.metadata`.
- El API resuelve la identidad local antes de marcar y, si aún no existe una foto, consulta el perfil de WhatsApp mediante el Bridge y actualiza llamada/conversación en segundo plano.
- Las consultas de perfil del Bridge usan la foto completa (`Preview: false`), siguiendo el patrón de Hierro del Norte.
- Corrige la llamada entrante cuando Chrome bloquea crear un nuevo Document-PiP sin activación de usuario: WAMERCIO muestra automáticamente la MISMA superficie canónica del softphone dentro de la aplicación, sin esperar un clic arbitrario.
- Al pulsar **Contestar**, ese gesto abre/mueve la superficie al Document Picture-in-Picture y continúa la misma llamada, siguiendo el patrón operativo de Hierro del Norte.
- Se elimina el comportamiento de “cualquier clic abre el PiP” que hacía parecer que la llamada no entraba hasta tocar la pantalla.

---

# WAMERCIO 4.1.9 — Direct Canonical PiP

- El launcher de sidebar vuelve a ser siempre `Abrir softphone`; se elimina el punto rojo/estado alternativo `Llamada entrante`.
- Las llamadas entrantes intentan abrir o focalizar directamente el único Document-PiP oficial.
- Se reutiliza `documentPictureInPicture.window` cuando el PiP ya existe.
- Si Chromium bloquea crear PiP sin activación transitoria, la próxima interacción real abre el mismo PiP; no se renderiza ningún clon.
- Se conserva la identidad entrante Cliente/Contacto de WAMERCIO de V4.1.8.

---

# WAMERCIO 4.1.8 — Single PiP Softphone + Caller Identity

- Elimina el softphone embebido/fallback duplicado.
- Mantiene una sola superficie oficial: el Document Picture-in-Picture de WAMERCIO.
- Una llamada entrante intenta abrir ese mismo PiP; si el navegador bloquea la apertura automática, la sidebar muestra una alerta compacta y al pulsarla abre el PiP oficial.
- Resuelve llamadas entrantes contra Conversaciones, Clientes e Identidad Global antes de usar el nombre de WhatsApp.
- Persiste `conversation_id`, teléfono y nombre resuelto en `whatsapp_calls`.
- Propaga el avatar conocido del cliente en metadata para mostrarlo dentro del softphone.
- No agrega migraciones.

---

# WAMERCIO 4.1.7 — Softphone UI State Sync

- Unifica la vista manual, automática y Picture-in-Picture sobre el mismo componente visual del softphone.
- Las llamadas entrantes intentan reutilizar Document Picture-in-Picture; si el navegador lo impide por falta de interacción del usuario, el fallback embebido usa exactamente la misma superficie y dimensiones.
- Corrige los controles por fase: entrante timbrando = Contestar/Rechazar; saliente timbrando = Cancelar llamada; conectando = estado + Colgar; activa/en espera = Silenciar, Espera/Reanudar, Transferir y Colgar.
- Elimina botones incoherentes como Silenciar/Conectar audio durante el timbrado.
- El contador ya no usa `started_at` durante timbrado. Sigue el patrón de Hierro del Norte: comienza al contestar (`answered_at`) y se muestra en `MM:SS`/`HH:MM:SS`.
- Al contestar una entrante y conectar WebRTC, la UI se promueve inmediatamente a `Activa` para evitar que siga mostrando Contestar/Rechazar aunque el audio ya esté conectado.

---

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
