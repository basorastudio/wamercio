# WAMERCIO V4.0.0 — Informe de implementación

## Objetivo

Integrar simultáneamente las fases restantes definidas después de V3.0.0, reutilizando conceptos maduros de Hierro del Norte sin fusionar ambos productos ni romper el modelo SaaS de WAMERCIO.

La regla arquitectónica aplicada fue:

```text
Identidad global del cliente
          +
relación comercial por store_id
          +
conversación WhatsApp
          ↓
Cotización / CRM / Tarea / Delivery / Automatización / Llamada
```

Ninguno de los módulos nuevos crea una identidad paralela del cliente.

## 1. Cotizaciones PRO

### Datos
- `quotes`
- `quote_items`
- `quote_revisions`
- `quote_share_links`
- `quote_events`
- `quote_followups`
- `store_quote_settings`

### Flujo

```text
Borrador → Enviada → Vista → Aprobada/Rechazada → Convertida a pedido
```

El portal utiliza tokens aleatorios cuyo hash es el único dato persistido. La cotización mantiene sus propias revisiones y solo crea una venta cuando se ejecuta la conversión.

### CRM
- Enviar → etapa `cotizado`.
- Aprobar → `negociacion`.
- Rechazar → `perdido`.
- Convertir → `ganado`.

## 2. Delivery PRO

Los mensajes de ubicación del bridge incluyen `structured_payload`, `latitude` y `longitude`. El panel puede guardar esas coordenadas en `customer_addresses` y actualizar el contacto de la tienda.

Las rutas calculan una secuencia nearest-neighbour con Haversine como fallback local. Esto no pretende reemplazar un motor de calles; el modelo deja `delivery_routes`/`delivery_route_stops` estables para que GEO RD MAP pueda proporcionar posteriormente routing real manteniendo la API actual.

## 3. CRM Operativo

El CRM no duplica clientes. Las oportunidades contienen relaciones opcionales a cliente, conversación, cotización y agente. Las tareas pueden relacionarse también con pedido.

Las tareas vencidas tienen `automation_due_notified_at`, evitando disparos repetidos del mismo evento. Si se reprograma la tarea, el marcador se limpia y puede dispararse nuevamente.

## 4. Flow Builder

Cada ejecución genera:
- `automation_flow_runs`
- `automation_flow_steps`

Esto permite auditar qué nodo se ejecutó y con qué resultado.

Acciones implementadas:
- Enviar WhatsApp.
- Aplicar etiqueta.
- Mover a cola.
- Crear tarea.
- Programar seguimiento que se cancela si el cliente responde.
- Cambiar prioridad.
- Condición por contenido.
- Terminar flujo.

## 5. Voz

El API espera un endpoint STT multipart configurable. Campos enviados:
- `file`
- `model`
- `language` cuando no es `auto`.

El resultado acepta JSON con `text` y opcionalmente `language`/`model`.

## 6. Calls Premium

Se implementó la capa SaaS/control plane dentro de WAMERCIO y el transporte multimedia quedó deliberadamente aislado.

### WAMERCIO controla
- tenant/store,
- conversación/contacto,
- agente,
- routing,
- estado,
- eventos,
- historial,
- grabación URL,
- transcripción,
- controles de llamada.

### Adaptador controla
- conexión WACalls/WhatsApp,
- WebRTC/RTP/media,
- señalización,
- audio del navegador.

Contrato: `CALLS_ADAPTER_URL`. Los callbacks entran por `/api/v1/internal/calls/events` autenticados con `X-Calls-Secret`.

Este desacoplamiento evita que réplicas HTTP normales compitan por sesiones de tiempo real y permite asignar afinidad/ownership de llamadas en el servicio correcto.

## 7. Migraciones

V4.0.0 agrega `000042`–`000047`, todas reversibles. La migración 3.0.0 `000041_conversation_center_pro` se conserva sin modificación destructiva.

## 8. Validaciones ejecutadas

- Contrato funcional V4.0.0: PASS.
- Centro Conversacional V3.0.0: PASS.
- 47/47 pares de migraciones.
- 340 handlers HTTP registrados, 0 faltantes.
- 107 archivos TypeScript: 0 errores de sintaxis.
- 49 archivos Go: 0 errores de parseo.
- Go package-scope guard: 0 problemas en API, bridge y domain-router.
- `gofmt`: limpio.
- Shell: sintaxis válida.
- Regresiones 2.5.x–2.9.x y 3.0 funcionales ejecutadas: PASS.

### Limitación del entorno de validación

El repositorio declara Go 1.26. El entorno de trabajo disponible contiene Go 1.23.2 y no tiene acceso a red/caché completa para descargar el toolchain y módulos, por lo que no fue posible ejecutar aquí el build binario final de Go 1.26. No se modificó `go.mod` para ocultar esa diferencia. La verificación estructural, de parser, scope y formato sí fue ejecutada sobre el código final.
