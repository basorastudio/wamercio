# Nota WAMERCIO 4.1.1 — Softphone global / PiP

V4.1.1 no agrega migraciones ni variables de entorno. Mantiene el motor de llamadas de V4.1.0 y añade el launcher global, Picture-in-Picture y directorio interno.

Después del redeploy valida:

1. **Abrir softphone** desde cualquier pantalla.
2. Directorio con filtros Contactos / Clientes / Usuarios.
3. Llamar desde el encabezado del chat.
4. Llamar desde Clientes y Contactos.
5. En Chrome/Brave/Edge compatible, validar la ventana Document Picture-in-Picture.
6. Cerrar PiP durante una llamada y confirmar que la llamada no se corta.
7. Contestar una llamada entrante desde otra pantalla del panel.

---

# WAMERCIO 4.1.0 — Despliegue en Dokploy

## Qué cambia

WAMERCIO Calls deja de depender de un adaptador externo. WACalls/WebRTC, señalización WhatsApp, SRTP, MLow y el puente de audio del navegador se compilan dentro de `services/whatsapp-bridge`.

No uses ni configures:

```text
CALLS_ADAPTER_URL
CALLS_ADAPTER_SECRET
```

## Variables de Calls

```env
# IP pública del VPS donde corre Dokploy/WAMERCIO.
WAMERCIO_WEBRTC_EXTERNAL_IP=TU_IP_PUBLICA

# Rango UDP reservado al ICE/WebRTC del motor integrado.
WAMERCIO_WEBRTC_UDP_PORT_MIN=55000
WAMERCIO_WEBRTC_UDP_PORT_MAX=55100

# Límite simultáneo por sesión/negocio.
WAMERCIO_CALLS_MAX_PER_STORE=8
```

### Firewall

Permite UDP `55000-55100` —o el rango que elijas— en el firewall del VPS/proveedor. `docker-compose.yml` publica el mismo rango hacia el contenedor `whatsapp`.

No necesitas instalar Asterisk, FreeSWITCH, coturn ni un segundo backend para el flujo base. El navegador se comunica por WebRTC directamente con el bridge integrado y el bridge mantiene la llamada WhatsApp.

> Si tu infraestructura está detrás de NAT adicional, `WAMERCIO_WEBRTC_EXTERNAL_IP` debe ser la IP realmente alcanzable desde Internet y el router/firewall debe reenviar el rango UDP al servidor Dokploy.

## Voz y transcripción

```env
STT_API_URL=
STT_API_KEY=
STT_MODEL=whisper-1
```

El STT sigue siendo opcional. No forma parte del transporte de la llamada; solo procesa grabaciones cuando se activa la transcripción.

## Antes de desplegar

1. Realiza backup de PostgreSQL.
2. Conserva `postgres_data`, `redis_data` y `uploads_data`.
3. Sustituye el código por WAMERCIO 4.1.0.
4. Configura la IP pública y rango UDP.
5. Ejecuta:

```bash
sh scripts/verify-4.1.0.sh
```

## Orden recomendado

1. **API** — conserva migraciones 000042–000047 y expone el control plane de Calls.
2. **WhatsApp Bridge** — contiene ahora el motor WACalls/WebRTC real.
3. **Web** — contiene la captura/reproducción PCM y el panel Calls.

En un Compose administrado como una sola aplicación, un `Redeploy` completo es suficiente.

## Prueba de llamada saliente

1. Conecta la sesión WhatsApp del negocio.
2. Abre **WAMERCIO Calls**.
3. Activa Calls y guarda.
4. Pulsa **Llamar**, introduce un WhatsApp válido y acepta permiso de micrófono.
5. Confirma que el teléfono destino timbre.
6. Contesta desde el teléfono.
7. Verifica audio en ambos sentidos.
8. Prueba Espera → Reanudar → Colgar.

## Prueba de llamada entrante

1. Llama desde un teléfono al WhatsApp conectado del negocio.
2. La llamada debe aparecer como **Entrante / ringing**.
3. Pulsa **Contestar**.
4. WAMERCIO abrirá el micrófono y enlazará el navegador por WebRTC.
5. Verifica audio en ambos sentidos y finalización.

## Grabación y transcripción

- **Grabar llamadas** crea WAV estéreo persistente bajo `uploads_data/calls/<store>/`.
- La API lo expone por `/media/calls/...`.
- **Transcribir llamadas** fuerza grabación y, al finalizar, envía el WAV al endpoint STT configurado.
- La grabación y la transcripción aparecen en el historial de Calls.

## Diagnóstico

Si la llamada timbra pero no hay audio:

1. confirma HTTPS en el navegador;
2. confirma permiso de micrófono;
3. confirma `WAMERCIO_WEBRTC_EXTERNAL_IP`;
4. confirma que UDP 55000-55100 está permitido en firewall/proveedor;
5. confirma que el mismo rango está publicado por Docker;
6. revisa logs del servicio `whatsapp`.

Si ni siquiera timbra, revisa primero la sesión WhatsApp y los logs de señalización WAMERCIO Calls.

## Rollback

4.1.0 no agrega tablas. Para volver a 4.0.1 basta restaurar el código/imagen anterior. No reviertas `000047` mientras uses cualquier versión 4.x que exponga Calls.

## V4.1.4 — actualización de Calls

No agrega migraciones. Reconstruye **api**, **whatsapp** y **web** porque la corrección toca las tres capas. El launcher del softphone ahora vive en la sidebar; no debe existir un botón flotante inferior derecho. Conserva `WAMERCIO_WEBRTC_EXTERNAL_IP`, el rango UDP y `WAMERCIO_CALLS_MAX_PER_STORE` de V4.1.0.


## V4.1.5 — Softphone unificado y salientes

Esta actualización no agrega migraciones. Reconstruye **web**, **api** y **whatsapp** porque los tres contienen correcciones de Calls.

Cambios operativos relevantes:

- las entrantes se muestran en la misma interfaz oscura del softphone; ya no usan el modal blanco alternativo;
- durante `ringing` entrante no se ofrece `Conectar audio`: primero se pulsa **Contestar** y el audio se negocia automáticamente;
- la preparación SQL de llamadas salientes fue corregida y los metadatos usan parámetros PostgreSQL explícitamente tipados;
- la resolución PN→LID/señalización saliente dispone de hasta 55 s en el Bridge y 65 s desde el API;
- `hangup/reject` son idempotentes y los estados terminales no pueden volver a `ringing/connecting` por callbacks retrasados.

Después del despliegue prueba en este orden:

1. Abre el softphone desde la sidebar y realiza una llamada saliente a un contacto conocido.
2. Verifica que el teléfono remoto timbre y que WAMERCIO pase de **Preparando** → **Timbrando**.
3. Realiza una llamada entrante: debe aparecer directamente dentro del softphone, con **Contestar** y **Rechazar**, sin el modal blanco.
4. Pulsa **Contestar**. El audio debe conectarse automáticamente; si hace falta reconectar, el botón aparece después de la aceptación.
5. Pulsa **Colgar**. El softphone debe volver al directorio y no reabrir la llamada finalizada.
