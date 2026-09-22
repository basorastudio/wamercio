# WAMERCIO 4.3.3 — Softphone unificado y llamadas funcionales

## Objetivo

Corregir dos problemas observados en producción:

1. El softphone de los negocios podía verse listo, pero el botón **Llamar** no iniciaba la llamada cuando `store_call_settings.is_active` seguía en `false` (valor histórico por defecto).
2. El SuperAdmin usaba una implementación visual y lógica separada; además, su directorio se basaba principalmente en el teléfono del propietario y no en el WhatsApp público de cada negocio.

V4.3.3 deja **un único softphone canónico** en toda la plataforma y corrige el flujo de llamada negocio ↔ cliente y SuperAdmin ↔ negocio.

## 1. Un solo componente de softphone

`apps/web/components/calls-softphone.tsx` es ahora la superficie única para:

- panel del negocio;
- Document Picture-in-Picture;
- fallback flotante para llamada entrante;
- softphone del SuperAdmin.

El componente acepta `scope="merchant" | "superadmin"` y cambia únicamente los endpoints/datos necesarios. El diseño, directorio, teclado, pantalla de timbrado, controles de llamada, mute, espera, reconexión de audio y hangup son compartidos.

`superadmin-support-softphone.tsx` queda reducido a un host del componente común. Se eliminó la segunda implementación `sap-*`.

## 2. Corrección del botón Llamar en negocios

La causa funcional era que `store_call_settings.is_active` se creó originalmente con `DEFAULT false`. En ese estado:

- el softphone deshabilitaba `Llamar`;
- `POST /api/v1/calls` rechazaba la salida con 409;
- las llamadas entrantes eran rechazadas por el bridge.

V4.3.3 agrega:

- migración `000049_unified_softphone_calls`;
- `is_active DEFAULT true`;
- activación de filas existentes que quedaron en `false` por el valor histórico;
- autoactivación segura al realizar una llamada saliente explícita;
- default `Enabled: true` en el bridge cuando un negocio nuevo aún no tiene fila de configuración.

El switch sigue existiendo: después del despliegue puede volver a desactivarse manualmente si se desea.

## 3. Llamadas SuperAdmin → negocio correcto

Se agregó:

`GET /api/v1/admin/whatsapp/call-directory`

El directorio se construye desde `stores`, no solamente desde `users` propietarios. Utiliza:

- nombre comercial/nombre del negocio;
- `stores.whatsapp` como destino prioritario;
- logo del negocio;
- propietario como contexto secundario;
- `remote_jid` conocido cuando existe; de lo contrario usa `<whatsapp>@s.whatsapp.net`.

Esto permite que una llamada iniciada desde la sesión global `support` llegue al WhatsApp conectado del negocio y, por tanto, aparezca como llamada entrante en su softphone.

## 4. Identidad de la llamada del SuperAdmin

Los snapshots de llamadas del soporte ahora también intentan resolver la identidad contra `stores.whatsapp`. Así, cuando el interlocutor es un negocio, el softphone puede mostrar nombre comercial y logo en lugar de tratarlo solamente como propietario/contacto.

## 5. Audio WebRTC

La llamada WhatsApp y el audio del navegador son capas distintas. Una llamada puede estar timbrando correctamente aunque la negociación WebRTC local falle.

El softphone ahora diferencia mejor esta condición. Si falta configuración de red, muestra una indicación específica para:

- `WAMERCIO_WEBRTC_EXTERNAL_IP`;
- rango UDP WebRTC.

En producción deben mantenerse:

```env
WAMERCIO_WEBRTC_EXTERNAL_IP=IP_PUBLICA_DEL_VPS
WAMERCIO_WEBRTC_UDP_PORT_MIN=55000
WAMERCIO_WEBRTC_UDP_PORT_MAX=55100
```

Y el firewall debe permitir el mismo rango UDP publicado por Docker.

## 6. Sección WAMERCIO Calls

El botón superior **Llamar** ya no queda bloqueado únicamente porque el flag histórico esté apagado. Si el motor/sesión WhatsApp están listos, una llamada explícita puede activar Calls y continuar el flujo.

## 7. Archivos principales modificados

- `apps/web/components/calls-softphone.tsx`
- `apps/web/components/superadmin-support-softphone.tsx`
- `apps/web/app/calls/page.tsx`
- `services/api/internal/httpapi/calls_premium.go`
- `services/api/internal/httpapi/server.go`
- `services/api/internal/httpapi/superadmin_profile_calls.go`
- `services/whatsapp-bridge/internal/bridge/calls_engine.go`
- `services/api/migrations/000049_unified_softphone_calls.up.sql`
- `services/api/migrations/000049_unified_softphone_calls.down.sql`

## 8. Validación realizada

- 111 archivos TS/TSX parseados con TypeScript: **0 errores de sintaxis**.
- `gofmt` aplicado a los Go modificados: **sin diferencias pendientes**.
- `scripts/test_4_3_3_unified_softphone.py`: **PASS**.
- `npm install` no pudo completarse en el entorno de trabajo por timeout de red.
- `go test` no pudo descargar el toolchain Go 1.26 porque el entorno no tiene acceso a `proxy.golang.org`; Dokploy ya utiliza un toolchain compatible.

## 9. Despliegue

Esta versión sí agrega una migración.

1. Actualiza el código.
2. Ejecuta migraciones hasta `000049`.
3. Reconstruye **api**, **whatsapp** y **web**.
4. Mantén el rango UDP publicado.
5. Verifica `WAMERCIO_WEBRTC_EXTERNAL_IP` en `.env`.
6. Prueba negocio → cliente y SuperAdmin → negocio.

No borres PostgreSQL ni recrees los volúmenes.
