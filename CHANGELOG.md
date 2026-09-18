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
