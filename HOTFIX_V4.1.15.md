# WAMERCIO V4.1.15 — Video bidireccional en vivo

## Problema observado

La señalización de upgrade voz→video llegaba al teléfono y ambos lados cambiaban a interfaz de videollamada, pero no se intercambiaban frames visibles. El audio continuaba funcionando. Esto confirma que la falla estaba en la ruta H.264/RTP/SRTP y no en la creación de la llamada.

## Correcciones

1. **RTP de video compatible con WhatsApp moderno.** Los paquetes PT-97 ahora incluyen la extensión `0xDEBE` con `MediaFrameInfo`, número de frame y `transport sequence`.
2. **Transición de señalización corregida.** Después de que el contacto acepta el upgrade, WAMERCIO anuncia `state=1` sin un `dec` redundante.
3. **Compatibilidad AVCC/Annex-B.** El navegador normaliza cualquier salida H.264 AVCC a Annex-B antes de enviarla al Bridge.
4. **SPS/PPS garantizados.** Si el encoder entrega un IDR sin SPS/PPS en banda, WAMERCIO extrae los parameter sets del `AVCDecoderConfigurationRecord` y los antepone al keyframe.
5. **Decoder remoto dinámico.** El softphone obtiene el perfil AVC desde el SPS recibido y configura WebCodecs con ese perfil.
6. **DataChannel de video listo antes de capturar.** La cámara no empieza a producir frames hasta que `h264` está realmente abierto.
7. **Diagnóstico de direcciones.** El Bridge registra `video outbound access unit` y `video inbound access unit` para saber inmediatamente si falla navegador→WhatsApp o WhatsApp→navegador.

## Flujo

```text
Voz activa
   ↓
Agente pulsa Video
   ↓
WhatsApp acepta upgrade
   ↓
PT-97 + SRTP + extensión 0xDEBE
   ↕
Relay WhatsApp
   ↕
Contacto móvil

Navegador WebCodecs H.264
   ↕ h264 DataChannel
WhatsApp Bridge
```

## Despliegue

No hay migraciones. Si vienes de V4.1.14, reconstruye **Web + WhatsApp Bridge**. El API puede permanecer igual. Mantén HTTPS, permisos de cámara y la configuración WebRTC/UDP existente.

## Validación disponible en este paquete

- regresión V4.1.15 de media bidireccional;
- regresiones acumuladas V4.1.14 → V3.0.0;
- 47/47 pares de migraciones;
- 341 handlers registrados;
- parser TypeScript: 110 archivos, 0 errores;
- chequeo semántico independiente de `calls-webrtc.ts`;
- Go scope guards: 0 incidencias;
- `gofmt`, shell y Docker Compose correctos.

La prueba definitiva del transporte de video sigue siendo una llamada real contra WhatsApp, porque este entorno no dispone de una sesión WhatsApp enlazada ni del relay de Meta.
