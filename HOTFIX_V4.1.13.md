# WAMERCIO 4.1.13 — Upgrade de voz a video desde el Softphone

## Objetivo

Añadir llamadas de video sin alterar el flujo principal de WAMERCIO Calls. Todas las llamadas continúan iniciando y entrando como **voz**. Una vez que la llamada está **Activa**, únicamente el agente de WAMERCIO puede solicitar el cambio a video desde el softphone.

## Experiencia de usuario

- Las llamadas salientes se originan siempre en voz.
- Las llamadas entrantes se presentan siempre en voz.
- El botón **Video** aparece únicamente en el softphone cuando la llamada está activa y el audio del navegador está conectado.
- Al pulsar **Video**, WAMERCIO solicita permiso para la cámara y envía la negociación de upgrade a WhatsApp.
- Mientras el contacto decide, el softphone muestra **Esperando que el contacto acepte el video…**.
- Si el contacto acepta, el softphone muestra el video remoto y una vista previa local de la cámara.
- **Volver a voz** apaga el video sin terminar la llamada.
- Si la solicitud aún está pendiente, **Cancelar video** cancela el upgrade sin colgar.
- El contacto no puede iniciar unilateralmente el cambio voz → video: esas solicitudes se rechazan automáticamente en el Bridge.
- El contacto sí conserva el consentimiento de aceptar o rechazar la solicitud de video enviada por WAMERCIO.

## Arquitectura

La implementación no agrega un sistema externo:

```text
Navegador
  ├─ DataChannel pcm   → audio PCM 16 kHz
  └─ DataChannel h264  → H.264 Annex-B
              │
              ▼
WAMERCIO WhatsApp Bridge
  ├─ WebRTC/Pion
  ├─ MLow/SRTP (voz)
  ├─ H.264/SRTP (video)
  └─ señalización <call><video .../></call>
              │
              ▼
           WhatsApp
```

El mismo `RTCPeerConnection` del softphone transporta voz y video hacia el Bridge. No se agregan puertos distintos de los ya configurados para WebRTC.

## Señalización de video

Se implementan los estados de transición utilizados durante una llamada 1:1:

- `11` — solicitud de upgrade a video.
- `4` — aceptación del upgrade.
- `5` — rechazo del upgrade.
- `1` — video habilitado.
- `6` — video detenido / volver a voz.
- `8` — cancelar una solicitud pendiente.

Los stanzas de video reciben además el ACK tipado `class="call" type="video"` requerido para la negociación.

## Media

- Cámara del navegador mediante `getUserMedia()`.
- Codificación H.264 en tiempo real mediante WebCodecs `VideoEncoder`.
- Formato H.264 Annex-B.
- 640×480 ideal, 15 fps, aproximadamente 500 kbps.
- Video remoto decodificado mediante WebCodecs `VideoDecoder` y dibujado en un `<canvas>` del softphone.
- Vista previa local mediante `<video muted playsInline>`.
- Reutiliza el relay/SRTP y los SSRC de video que ya existían en el motor WACalls portado a WAMERCIO.
- Al activar/desactivar video se vuelven a anunciar las suscripciones de SSRC al relay para que el cambio funcione durante una llamada ya establecida.

## Política plataforma-only

El Bridge intercepta los eventos `<video>` de WhatsApp. Si el contacto envía por su cuenta una solicitud de upgrade (`state=3` o `state=11`), WAMERCIO responde con `state=5` y conserva la llamada de voz.

Esta política no intenta saltarse el consentimiento del contacto. Un upgrade iniciado por WAMERCIO solo entra en video cuando el cliente WhatsApp responde aceptándolo.

## Persistencia

No requiere migración. Los campos operativos se guardan en `whatsapp_calls.metadata`:

- `video_active`
- `video_pending`
- `video_local`
- `video_remote`

El API reconcilia esos valores con los snapshots del motor embebido.

## Navegadores

La llamada de voz sigue funcionando aunque el navegador no soporte WebCodecs H.264. En ese caso el botón **Video** no se presenta después de conectar el audio. Para video se requiere HTTPS, permiso de cámara y un navegador Chromium moderno con WebCodecs H.264 disponible.

## Despliegue

No hay migraciones nuevas. Esta versión modifica:

- Web
- API
- WhatsApp Bridge

Por tanto, desde V4.1.12 se recomienda rebuild/redeploy de esos tres servicios.
