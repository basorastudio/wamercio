# WAMERCIO V4.3.4 — Softphone estable y consistente

## Objetivo

Corregir los fallos observados en las capturas de producción sin crear otra implementación del softphone. Negocios y SuperAdmin continúan usando el mismo componente `CallsSoftphone` y el mismo motor WhatsApp/WebRTC.

## Fallos reproducidos a partir de las capturas

1. **La identidad cambiaba durante una llamada saliente.** La llamada comenzaba mostrando el negocio correcto y después el nombre pasaba a `<nil>` y el teléfono a un número derivado de un `@lid` de WhatsApp.
2. **Una sola llamada entrante generaba varias filas `Perdida`.** En la pantalla WAMERCIO Calls aparecían múltiples registros de la misma llamada en segundos consecutivos.
3. **El audio del navegador se perdía con la llamada aún activa.** El softphone mostraba `Se perdió el audio del navegador` aunque la señalización de WhatsApp continuaba viva.
4. **La UI podía quedar visualmente inconsistente entre estados.** El problema era consecuencia de datos de identidad y callbacks duplicados, no de que faltara otro componente visual.

## Correcciones implementadas

### 1. Identidad estable PN/LID

`services/whatsapp-bridge/internal/bridge/calls_engine.go` conserva en cada `activeCall` una identidad estable:

- `remoteJID`
- `phone`
- `displayName`

Para llamadas salientes se guarda la identidad elegida por el operador antes de iniciar la señalización. Para llamadas entrantes se resuelve primero `@lid → PN` mediante el store LID de WhatsMeow. Los snapshots vivos priorizan esta identidad y nunca muestran el literal `<nil>`.

El API también protege las llamadas salientes: una actualización posterior del motor no puede reemplazar el número o nombre persistido con una identidad de transporte.

### 2. Eliminación de llamadas duplicadas

WhatsMeow podía disparar `OnIncoming` y `OnStateChange` para la misma oferta. Ambos caminos persistían la misma llamada de forma concurrente. V4.3.4 deja `OnStateChange` como único camino de persistencia.

La migración `000050_calls_identity_dedupe`:

- elimina duplicados históricos por `(store_id, external_call_id)`;
- crea el índice único parcial `uq_whatsapp_calls_store_external`;
- permite que el API use un UPSERT idempotente ante callbacks repetidos.

### 3. Audio WebRTC más resiliente

El navegador y el bridge toleran ahora hasta **15 segundos** de estado ICE `disconnected` antes de considerar perdida la pierna WebRTC. Además, el softphone intenta reconectar el audio de forma progresiva mientras la llamada de WhatsApp siga viva.

Se añadió un token de generación para evitar una carrera donde una conexión WebRTC vieja podía cerrar o limpiar el estado de una negociación nueva.

La reconexión de audio **no reinicia ni duplica la llamada de WhatsApp**; solamente reconstruye la pierna del navegador.

## Archivos principales modificados

- `apps/web/components/calls-softphone.tsx`
- `apps/web/lib/calls-webrtc.ts`
- `services/api/internal/httpapi/calls_premium.go`
- `services/whatsapp-bridge/internal/bridge/calls_engine.go`
- `services/api/migrations/000050_calls_identity_dedupe.up.sql`
- `services/api/migrations/000050_calls_identity_dedupe.down.sql`

## Despliegue

Reconstruir obligatoriamente:

- `web`
- `api`
- `whatsapp`

La API debe aplicar la migración **000050**. No borrar PostgreSQL, no reiniciar migraciones y no desvincular las sesiones de WhatsApp.

Para audio desde Internet continúan siendo necesarios:

- `WAMERCIO_WEBRTC_EXTERNAL_IP=<IP_PUBLICA_DEL_SERVIDOR>`
- UDP `55000-55100` publicado y permitido en firewall/NAT
- acceso al panel mediante HTTPS

## Resultado esperado

- Una llamada entrante = una sola fila de historial.
- El nombre, número y avatar no cambian a un LID ni a `<nil>` durante la llamada.
- El mismo softphone aparece y funciona igual en SuperAdmin y comercios.
- Las pérdidas ICE temporales intentan recuperarse automáticamente antes de pedir intervención manual.
- Finalizar una llamada limpia únicamente el estado de esa llamada y no deja una pierna WebRTC antigua afectando la siguiente.
