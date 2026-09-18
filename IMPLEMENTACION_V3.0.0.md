# WAMERCIO V3.0.0 — Implementación Centro Conversacional PRO

Esta versión incorpora a WAMERCIO las funciones operativas de Hierro del Norte que encajan directamente con el comercio conversacional, manteniendo la arquitectura, identidad visual, modelos de cliente y aislamiento multi-tenant propios de WAMERCIO.

## Implementado

### Colas y multiagente
- Colas por negocio.
- Estrategias `manual`, `round_robin`, `least_load` y `random`.
- Selección opcional de agentes por cola.
- Los repartidores quedan fuera de la asignación conversacional automática.
- Asignación manual y transferencia de conversación mediante cambio de agente.
- Autoasignación de conversaciones entrantes cuando la cola utiliza una estrategia automática.
- Cola `General` creada automáticamente para negocios existentes y futuros.

### Prioridad y SLA
- Prioridad Baja, Normal, Alta o Urgente.
- SLA configurable en minutos por cola.
- Filtro de conversaciones con SLA vencido.
- El SLA solo corre cuando el último mensaje del cliente es posterior a la última respuesta del negocio; una conversación ya respondida no se marca falsamente como vencida.

### Etiquetas
- Etiquetas independientes por tienda.
- Etiquetas iniciales Venta, Seguimiento e Importante.
- Alta y aplicación desde Registros de atención.
- Auditoría de altas/bajas de etiquetas en el historial operativo.

### Seguimientos programados
- Mensajes programados desde la conversación.
- Atajos 30 min, 1 h, 2 h y Mañana, más fecha/hora personalizada.
- Opción `Cancelar si el cliente responde`.
- Cancelación automática ante una respuesta entrante posterior a la creación del seguimiento.
- Recuperación de trabajos que hayan quedado en `processing` tras una interrupción.
- Estados Programado, Procesando, Enviado, Cancelado y Falló.

### Respuestas rápidas
- Se mantiene el panel actual.
- Se agrega invocación mediante `/comando` directamente en el cuadro de mensaje.

### Encuestas nativas de WhatsApp
- Botón de encuesta integrado al compositor.
- Entre 2 y 12 opciones.
- Usa el endpoint nativo de polls del `whatsapp-bridge` y WhatsMeow, no una simulación HTML.
- La encuesta enviada queda registrada como mensaje `poll` en la conversación.

### Historial operativo
`Registros de atención` mezcla notas internas con eventos del sistema:
- atención actualizada;
- autoasignación;
- etiquetas;
- seguimientos programados/cancelados/enviados;
- encuestas enviadas.

## Persistencia

Migración nueva:

- `services/api/migrations/000041_conversation_center_pro.up.sql`
- `services/api/migrations/000041_conversation_center_pro.down.sql`

Crea/añade:
- `conversation_queues`
- `conversation_queue_members`
- `conversation_tags`
- `conversation_tag_links`
- `conversation_events`
- `scheduled_conversation_messages`
- `conversations.queue_id`
- `conversations.assigned_staff_id`
- `conversations.priority`
- `conversations.first_response_at`
- `conversations.resolved_at`
- `conversations.last_inbound_at`
- `conversations.last_outbound_at`
- `conversations.assignment_updated_at`

## Archivos principales modificados

- `services/api/internal/httpapi/conversation_pro.go`
- `services/api/internal/httpapi/server.go`
- `apps/web/app/conversations/page.tsx`
- `apps/web/components/conversation-pro-controls.tsx`
- `apps/web/public/sw.js`
- `README.md`
- `CHANGELOG.md`
- `DEPLOY_DOKPLOY.md`
- `VERSION`
- `apps/web/package.json`

## Pruebas

Nueva regresión:

- `scripts/test_3_0_0_conversation_center_pro.py`
- `scripts/test_3_0_0_release_integration.py`
- `scripts/verify-3.0.0.sh`

Resultados obtenidos en el entorno de preparación:
- 41/41 pares de migraciones presentes.
- 99 archivos TypeScript parseados: 0 errores de sintaxis.
- 42 archivos Go parseados: 0 errores de sintaxis.
- Scope guard Go: 0 problemas en API, bridge y router.
- `gofmt`: limpio.
- Sintaxis shell: correcta.
- Regresiones 2.5.x–2.9.x ejecutadas en la batería V3.0.0: aprobadas hasta completar las comprobaciones estructurales indicadas.

El entorno de preparación no contiene la toolchain Go 1.26 requerida por `go.mod` ni acceso de red para descargarla, por lo que el build binario real debe ejecutarse en CI/Dokploy con la toolchain indicada por el proyecto. Esto no se sustituyó reduciendo artificialmente la versión de Go.

## Despliegue

1. Respalda PostgreSQL y uploads.
2. Ejecuta `sh scripts/verify-3.0.0.sh` en el entorno de CI/Dokploy.
3. Despliega primero API para aplicar `000041`.
4. Despliega Web.
5. Mantén `whatsapp-bridge` actualizado con esta misma versión para conservar envío de polls.
6. Prueba una conversación real: cola, agente, prioridad, SLA, etiqueta, seguimiento cancelable y encuesta.

## Compatibilidad

No se reemplazó el motor de WhatsApp ni se importó la base de datos de Hierro del Norte. Las funciones nuevas se adaptaron a:
- `store_id` como aislamiento tenant;
- identidad global WAMERCIO;
- relación comercial local del cliente;
- WhatsMeow actual de WAMERCIO;
- estilos visuales actuales de Conversaciones;
- pedidos, pagos, POS, catálogo, bloqueo y evaluaciones existentes.
