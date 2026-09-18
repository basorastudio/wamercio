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
