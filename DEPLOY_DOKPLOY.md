# WAMERCIO 4.1.12 — despliegue en Dokploy

Si ya estás en **V4.1.11**, esta actualización no agrega migraciones ni variables nuevas.

Reconstruye:

1. **API** — bloqueo/auditoría de Contactos y datos de bloqueo en `/contacts`.
2. **Web** — botones de chat interno, bloqueo de Contactos y PIN progresivo de Usuarios.

No es necesario reconstruir WhatsApp Bridge por los cambios de V4.1.12.

## Pruebas rápidas

1. En **Clientes**, pulsa el icono de chat: debe abrir `/conversations` dentro de WAMERCIO y seleccionar ese cliente.
2. En **Contactos**, pulsa chat: no debe abrir `wa.me` ni una pestaña de WhatsApp Web.
3. Bloquea un Contacto indicando motivo. La fila debe mostrar **Bloqueado** y el icono debe convertirse en **Desbloquear**.
4. Desbloquea el Contacto y confirma que vuelve a estado **Contacto**.
5. En **Usuarios → Agregar usuario**, el PIN debe mostrarse en casillas individuales y avanzar automáticamente al escribir.

---

# WAMERCIO 4.1.10

Esta versión modifica **Web + API + WhatsApp Bridge**. No agrega migraciones. Haz rebuild/redeploy de los tres servicios.

# WAMERCIO 4.1.9 — Direct Canonical PiP

## Despliegue desde V4.1.8

No hay migraciones nuevas ni cambios de API/Bridge. Reconstruye **Web**. Después limpia/actualiza el Service Worker de la PWA si el navegador conserva assets anteriores.

## Prueba visual V4.1.9

1. La sidebar debe mostrar siempre **Abrir softphone / Llamadas WhatsApp**, incluso mientras timbra una entrante.
2. Con el PiP ya abierto, una entrante debe aparecer inmediatamente dentro de esa misma ventana.
3. Con el PiP cerrado, WAMERCIO intenta abrirlo automáticamente. Si Chromium bloquea `requestWindow()` por política de activación, la siguiente interacción del usuario debe abrir el mismo PiP; no debe aparecer punto rojo, modal ni softphone alternativo.
4. El PiP debe conservar Directorio, Teclado, búsqueda, filtros y controles de llamada del softphone original.

---

# WAMERCIO 4.1.8 — Single PiP Softphone + Caller Identity

Esta versión mantiene el ciclo de llamadas de V4.1.6/V4.1.7, elimina el softphone embebido duplicado y hace que las llamadas entrantes utilicen la identidad Cliente/Contacto de WAMERCIO. **No agrega migraciones ni variables obligatorias nuevas.**

## Validación visual obligatoria V4.1.8

1. Pulsa **Abrir softphone**: debe abrirse el PiP oficial con Directorio/Teclado; no debe existir un segundo panel flotante dentro de la página.
2. Recibe una llamada con el PiP ya abierto: la misma ventana PiP debe cambiar a la llamada entrante.
3. Recibe una llamada con el PiP cerrado: WAMERCIO intenta abrir el PiP; si Chromium lo bloquea por seguridad, la sidebar debe mostrar **Llamada entrante** con el nombre/número. Al pulsarla debe abrir exactamente el mismo PiP oficial.
4. Si el número corresponde a un cliente existente, la llamada entrante debe mostrar su nombre de WAMERCIO y avatar disponible, no solo el push-name de WhatsApp.
5. Confirma que no aparece ningún elemento `embeddedContent`/softphone duplicado en la esquina de la página.


## Servicios que deben reconstruirse

Haz un **Redeploy completo** para reconstruir, como mínimo:

1. **API** — reconcilia llamadas persistidas contra el motor real y libera registros fantasma antes de marcar.
2. **WhatsApp Bridge** — finaliza llamadas localmente antes de persistir, vigila setup, recupera relay SRTP/SCTP y promueve estado a Activa al detectar media real.
3. **Web** — usa un único Document-PiP, muestra alerta compacta en sidebar cuando el navegador bloquea apertura automática y conserva los controles/cronómetro de V4.1.7.

## Variables existentes de WebRTC

Conserva las ya configuradas:

```env
WAMERCIO_WEBRTC_EXTERNAL_IP=TU_IP_PUBLICA
WAMERCIO_WEBRTC_UDP_PORT_MIN=55000
WAMERCIO_WEBRTC_UDP_PORT_MAX=55100
WAMERCIO_CALLS_MAX_PER_STORE=8
```

El firewall del VPS/proveedor debe permitir el mismo rango UDP publicado por Docker.

## Prueba obligatoria después del despliegue

1. Realiza una llamada **saliente**, contesta en el teléfono y confirma audio en ambos sentidos.
2. Cuelga **desde el teléfono**. En pocos segundos el softphone debe salir de la llamada y volver a Directorio/Teclado.
3. Sin refrescar la página, inicia una **segunda llamada saliente**. Debe permitirse inmediatamente.
4. Realiza una llamada entrante, contesta desde WAMERCIO y vuelve a colgar desde el teléfono.
5. Mantén una llamada activa al menos 1–2 minutos y confirma que el audio no queda silencioso. Si el relay se pierde, WAMERCIO intentará recuperarlo; si no puede, finalizará la llamada en vez de dejarla falsa como Activa/Timbrando.
6. Prueba cerrar/reabrir la ventana flotante y **Conectar audio**. La llamada WhatsApp no debe quedar bloqueada por la pestaña del navegador.
7. Abre `/calls` y confirma que las llamadas terminadas aparecen como Finalizada/Perdida/Rechazada/Fallida, no como Timbrando.

## Diagnóstico rápido

Si una llamada no tiene audio, revisa primero HTTPS, permiso de micrófono, IP pública ICE y rango UDP. Si el teléfono ya colgó pero la UI siguiera mostrando una llamada no terminal, revisa los logs del servicio `whatsapp`: V4.1.6+ publica snapshots del motor y el API reconcilia automáticamente la fila persistida contra ese estado.

---

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

## V4.1.11 — perfil en sidebar + International Telephone Input

Si vienes de V4.1.10, esta actualización solo modifica `apps/web` y documentación/pruebas. No agrega migraciones ni cambia API o WhatsApp Bridge.

En Dokploy basta con reconstruir/redeploy **Web**.

Después del despliegue verifica:

1. La sidebar ya no contiene un elemento independiente **Mi cuenta**.
2. Al pulsar foto/nombre/WhatsApp de la tarjeta inferior se abre `/settings/profile`.
3. El icono de cerrar sesión sigue cerrando la sesión sin abrir el perfil.
4. Los campos de teléfono/WhatsApp muestran bandera, código internacional y selector de país en Calls, Cotizaciones, POS, Reservaciones y Configuración global.
5. El teclado del softphone muestra también el selector internacional dentro de Document PiP.
## V4.1.13 — Video en WAMERCIO Calls

V4.1.13 no agrega servicios ni puertos. El video utiliza el mismo `whatsapp-bridge` y el mismo rango UDP de WebRTC configurado para Calls.

Requisitos adicionales del navegador:

- HTTPS válido.
- Permiso de cámara.
- Navegador Chromium moderno con WebCodecs H.264.

Si vienes de V4.1.12, reconstruye **API + WhatsApp Bridge + Web**. No hay migraciones PostgreSQL nuevas. Mantén `WAMERCIO_WEBRTC_EXTERNAL_IP`, `WAMERCIO_WEBRTC_UDP_PORT_MIN` y `WAMERCIO_WEBRTC_UDP_PORT_MAX` como estaban.

Prueba recomendada después del deploy:

1. Inicia una llamada de voz desde el softphone.
2. Espera que quede **Activa** y confirma audio bidireccional.
3. Pulsa **Video**.
4. Acepta el cambio desde el teléfono WhatsApp.
5. Confirma cámara local + video remoto.
6. Pulsa **Volver a voz** y confirma que la llamada de audio continúa.
7. Desde el teléfono intenta activar video por iniciativa del contacto y confirma que WAMERCIO conserva voz sin aceptar ese upgrade.

