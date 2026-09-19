# WAMERCIO V4.1.15 — Bidirectional Video Media Fix

## Problema observado

El upgrade de voz a video llegaba al teléfono y ambas interfaces entraban visualmente en modo video, pero no fluían frames H.264 válidos en ambos sentidos. En WAMERCIO se mantenía el avatar/estado de espera y en WhatsApp el contacto tampoco recibía la cámara del agente.

## Correcciones

1. **ACK de negociación antes del handler genérico:** se instala un hook de `call` antes de `Connect()` para interceptar `<call><video/></call>`, enviar el ACK tipado `type="video"` y evitar que el ACK genérico de WhatsMeow invalide el upgrade. `UnknownCallEvent` queda solo como fallback.
2. **Wire RTP de video:** PT-97 incorpora la extensión `0xdebe` usada por clientes recientes de WhatsApp (media-frame-info, frame number, initial bandwidth, short offset y transport sequence).
3. **Keyframe/Access Unit:** el Bridge no comienza a transmitir hasta disponer de IDR y packetiza el access unit Annex-B completo para que SPS/PPS/IDR lleguen de forma coherente al teléfono.
4. **Relay:** al activar video se reenvían las suscripciones y SSRC del stream de video sobre el relay ya abierto para voz.
5. **Browser ↔ Bridge:** el canal `h264` local pasa a ser ordenado y fiable; la pérdida controlada sigue ocurriendo, si corresponde, en RTP/relay, no antes de que el Bridge reciba el access unit.
6. **Decodificación remota:** WebCodecs obtiene el perfil AVC desde el SPS entrante y reconfigura `VideoDecoder` cuando sea necesario.
7. **UI basada en media real:** el primer frame remoto decodificado marca video remoto visible inmediatamente y evita que el overlay del avatar tape el canvas por una metadata atrasada.

## Flujo esperado

La llamada continúa iniciando como voz. Con la llamada activa el agente pulsa **Video**, el contacto acepta en WhatsApp, y a partir de la aceptación ambos extremos intercambian H.264 en vivo. **Volver a voz** detiene únicamente el video. Las solicitudes de upgrade iniciadas por el contacto continúan rechazándose por la política de WAMERCIO.

## Despliegue

Si vienes de V4.1.14, reconstruye **Web + WhatsApp Bridge**. API y base de datos no requieren cambios. No hay migraciones nuevas.

## Validación

La release incluye regresiones estructurales para el ACK tipado, RTP `0xdebe`, keyframe gate, H.264 DataChannel ordenado, perfil AVC por SPS y confirmación de frame remoto. La validación definitiva de interoperabilidad de video requiere una llamada real después del despliegue, porque el relay y el cliente WhatsApp no están disponibles dentro de este entorno de empaquetado.
