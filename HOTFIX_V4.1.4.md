# WAMERCIO 4.1.4 — Corrección definitiva de runtime de Calls

## Problemas corregidos

Esta versión ataca los fallos observados en producción después de integrar el softphone global:

1. El launcher flotante podía tapar acciones, modales y controles. Ahora forma parte de la sidebar, justo encima de la tarjeta del usuario.
2. Cada pantalla montaba su propio ciclo de vida de Calls. Al cambiar de ruta se recreaba el softphone y una llamada todavía marcada como `ringing` podía volver a abrir el modal. El estado ahora vive en un único `CallsSoftphoneHost` en el layout raíz.
3. El API usaba el timeout HTTP genérico de 12 s para iniciar o contestar llamadas. La resolución LID, consulta de dispositivos, creación/consulta de sesiones Signal y señalización de WhatsApp pueden necesitar más tiempo. Calls usa presupuestos independientes: 40 s inicio, 30 s acciones y 15 s negociación WebRTC.
4. El flujo anterior de `AcceptCall` podía marcar localmente la llamada como conectando antes de saber si el `accept` había sido cifrado/enviado. Ahora la transición local ocurre únicamente después de un envío exitoso.
5. El API actualiza inmediatamente `whatsapp_calls.status` con el estado que devuelve el motor y conserva una reconciliación defensiva para llamadas obsoletas, evitando estados eternos de **Timbrando** o **Conectando**.

## Comportamiento esperado

- **Abrir softphone** aparece en la sidebar y no como overlay flotante.
- Una llamada entrante abre una sola interfaz global. Si se cierra, no vuelve a abrirse por la misma llamada; el descarte se comparte entre pestañas WAMERCIO abiertas.
- Navegar entre Dashboard, WhatsApp, Clientes, Configuración u otras secciones no reinicia el softphone.
- Contestar solo muestra **Conectando** cuando WhatsApp aceptó la señalización.
- Llamar desde Chat/Clientes/Contactos abre el mismo softphone global y evita dobles marcados.
- Si el motor devuelve un error, la UI muestra la causa concreta en lugar de limitarse a `Error 502`.

## Despliegue

No hay migraciones nuevas. Como cambian Web, API y WhatsApp Bridge, se recomienda reconstruir los tres servicios. Mantén la configuración WebRTC de V4.1.0:

```env
WAMERCIO_WEBRTC_EXTERNAL_IP=<IP_PUBLICA_VPS>
WAMERCIO_WEBRTC_UDP_PORT_MIN=55000
WAMERCIO_WEBRTC_UDP_PORT_MAX=55100
WAMERCIO_CALLS_MAX_PER_STORE=8
```

El rango UDP configurado debe estar permitido en el firewall del VPS/proveedor.

## Verificación incluida

`scripts/verify-4.1.4.sh` incorpora una regresión específica que verifica ubicación del launcher, host global único, prevención de reapertura, timeouts dedicados, persistencia de estado y orden correcto del `AcceptCall`.
