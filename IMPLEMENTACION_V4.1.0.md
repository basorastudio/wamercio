# WAMERCIO 4.1.0 — Implementación del motor de llamadas

## Decisión arquitectónica

El motor de audio se integró en `services/whatsapp-bridge`. Esta ubicación evita duplicar sesiones y credenciales: el mismo `whatsmeow.Client` que mantiene la conexión de cada `store_id` ejecuta la señalización de llamadas.

```text
Navegador WAMERCIO
      │ WebRTC DataChannel PCM 16 kHz
      ▼
whatsapp-bridge
      │
      ├─ WACalls / CallManager
      ├─ MLow codec
      ├─ RTP / SRTP
      ├─ Relay transport
      └─ WhatsMeow session del negocio
                 │
                 ▼
              WhatsApp
```

El API continúa siendo el control plane SaaS: permisos, `store_id`, historial, agentes, settings, eventos, grabación URL y transcripción.

## Código incorporado

Se portaron las capas de `internal/voip` de Hierro del Norte a `services/whatsapp-bridge/internal/voip`, preservando la implementación de señalización, transporte y MLow. Se añadió `internal/wacall/socket.go` como adaptador entre `CallManager` y el `whatsmeow.Client` que ya existe en WAMERCIO.

## Compatibilidad WhatsMeow

El socket usa las firmas de la versión fijada por WAMERCIO (`33cfac511629`): `GetOwnID`, `GetOwnLID`, `SendNode(ctx, ...)`, `WaitResponse`, `CancelResponse`, `DecryptDM(ctx,...,serverTS)` y `EncryptMessageForDevices(ctx, devices, id, plaintext, dsm, attrs)`.

## IDs

El UUID de la base de datos nunca se reutiliza como Call ID de WhatsApp. Para una saliente:

```text
whatsapp_calls.id = UUID interno WAMERCIO
external_call_id   = signaling.GenerateCallID()
```

Los eventos entrantes se correlacionan por `external_call_id`.

## Audio navegador

- AudioContext solicitado a 16 kHz.
- AudioWorklet para captura y reproducción.
- PCM signed 16-bit little-endian por DataChannel `pcm`.
- Pion WebRTC dentro del bridge.
- ICE host candidate con IP pública configurada.
- Rango UDP configurable.

## Grabación

La grabación se realiza dentro del bridge sin capturar desde el navegador por HTTP:

- canal izquierdo: agente/navegador;
- canal derecho: cliente/WhatsApp;
- PCM16 16 kHz estéreo;
- salida WAV persistente en el volumen compartido `uploads_data`;
- gaps significativos se conservan como silencio para mantener alineación temporal;
- al finalizar, el bridge notifica `recording_url` al API.

## Transcripción

Cuando `transcribe_calls=true`, la API toma el WAV terminado y reutiliza `callTranscriptionAPI` de Voz. La transcripción y metadatos de idioma/motor se guardan en `whatsapp_calls`.

## Seguridad y tenancy

- `/calls*` del bridge permanece detrás de `X-Internal-Secret`.
- El navegador nunca accede directamente al bridge HTTP.
- API valida propiedad del negocio antes de iniciar/controlar/enlazar WebRTC.
- Un registro de llamadas pertenece siempre a `store_id`.
- Las sesiones activas se mantienen separadas por negocio.

## Red

La integración elimina el segundo sistema de llamadas, pero WebRTC sigue siendo un protocolo de red: Dokploy/VPS debe exponer el rango UDP del propio contenedor WAMERCIO y anunciar la IP pública correcta.

## Validación de release

Se ejecutó `scripts/verify-4.1.0.sh` después de la integración y de la revisión manual final:

- 47/47 pares de migraciones `up/down`.
- 341 handlers HTTP registrados, 0 faltantes.
- JSON válido.
- 108 archivos TypeScript parseados, 0 errores sintácticos.
- 108 archivos Go parseados, 0 errores sintácticos.
- `docker-compose.yml` válido.
- `gofmt` limpio.
- scripts shell válidos.
- regresión de Centro Conversacional PRO 3.0.0 conservada.
- regresión específica de Calls 4.1.0 aprobada.
- revisión manual de imports/firmas de los archivos nuevos del motor; se corrigió el import de `time` del grabador antes del empaquetado.

También se contrastaron las llamadas internas utilizadas contra el commit exacto de WhatsMeow fijado por WAMERCIO (`33cfac511629`) y contra Pion WebRTC v4.2.15.

### Límite del entorno de validación

Este entorno local tiene Go 1.23.2 y no dispone de salida de red para descargar el toolchain Go 1.26 ni las dependencias npm ausentes, por lo que aquí no es posible ejecutar el `go build`/`next build` binario completo de producción. La validación final de compilación binaria debe ocurrir en Dokploy, cuyo builder ya utiliza Go 1.27.1 y Node 20. Esto no se oculta mediante cambios artificiales de `go.mod`.
