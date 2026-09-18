# WAMERCIO 4.0.0

WAMERCIO 4.0.0 integra simultáneamente las fases posteriores al **Centro Conversacional PRO 3.0.0**, conservando el mismo patrón visual, arquitectura multi-tenant y modelo WhatsApp-first.

## Módulos incluidos

### Cotizaciones Conversacionales PRO
- Cotizaciones independientes de pedidos.
- Artículos, revisiones, eventos y seguimiento.
- Enlace público seguro con aceptar/rechazar.
- Envío por WhatsApp.
- PDF descargable desde panel y portal público.
- Seguimientos automáticos cancelables cuando la cotización cambia de estado.
- Conversión cotización → pedido.
- Sincronización automática con CRM.

### Delivery PRO
- Ubicación WhatsApp estructurada con latitud/longitud reales.
- Acción **Asociar a dirección** desde Registros de atención.
- Dirección global del cliente y actualización del contacto local.
- Creación opcional de zona territorial a partir de la ubicación.
- Entregas y asignación de repartidores.
- Rutas con secuencia de paradas.
- Optimización local por proximidad + distancia/ETA aproximados.
- Modo Repartidor con estados y geolocalización del dispositivo.
- Modelo preparado para reemplazar la heurística por GEO RD MAP/routing sin cambiar contratos.

### CRM Operativo
- Embudo configurable por tienda.
- Oportunidades relacionadas con cliente, conversación y cotización.
- Kanban comercial.
- Tareas, responsables, prioridad y vencimiento.
- Actividad operativa.
- Sincronización de cotización: Cotizado → Negociación → Ganado/Perdido.

### Flow Builder
- Constructor visual basado en nodos y conexiones.
- Triggers: manual, mensaje recibido, keyword, cotización enviada/aprobada, pedido creado/cambio de estado y tarea vencida.
- Acciones: enviar WhatsApp, etiqueta, cola, tarea, seguimiento programado, prioridad y condiciones.
- Historial de ejecuciones y pasos para auditoría.

### Voz y transcripción
- Transcripción automática de notas de voz.
- Proveedor STT desacoplado mediante endpoint multipart compatible.
- Procesamiento persistente y estados pending/processing/done/failed/skipped.
- Búsqueda de transcripciones.
- Transcripción visible dentro de la burbuja de audio.

### WAMERCIO Calls Premium
- Configuración por negocio.
- Registro de llamadas entrantes/salientes.
- Contestar, rechazar, colgar, espera, reanudar y transferir.
- Routing configurable.
- Campos para grabación y transcripción.
- Webhook de eventos y control plane multi-tenant.
- Transporte de audio desacoplado mediante `CALLS_ADAPTER_URL` para WACalls/WebRTC.

## Migraciones nuevas

- `000042_quotes_pro`
- `000043_delivery_pro`
- `000044_crm_operations`
- `000045_flow_builder`
- `000046_voice_transcription`
- `000047_calls_premium`

Todas tienen archivo `up` y `down`.

## Variables opcionales nuevas

```env
STT_API_URL=
STT_API_KEY=
STT_MODEL=whisper-1

CALLS_ADAPTER_URL=
CALLS_ADAPTER_SECRET=
```

Sin `STT_API_URL`, WAMERCIO sigue funcionando y las transcripciones quedan marcadas como proveedor no configurado. Sin `CALLS_ADAPTER_URL`, el módulo Calls conserva configuración e historial pero no intenta establecer audio real.

## Verificación

```bash
sh scripts/verify-4.0.0.sh
```

La verificación comprueba versión, migraciones, rutas HTTP, sintaxis TypeScript/Go, `gofmt`, scripts shell y el contrato funcional de las seis fases.

## Despliegue

Consulta `DEPLOY_DOKPLOY.md`. El orden recomendado es **API → WhatsApp Bridge → Web** para que las migraciones estén aplicadas antes de que la interfaz consulte las nuevas entidades.
