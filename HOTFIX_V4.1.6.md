# WAMERCIO 4.1.6 — Call Lifecycle & Media Recovery

## Problemas corregidos

1. Una llamada finalizada en WhatsApp podía permanecer como **Timbrando/Saliente** en WAMERCIO y bloquear nuevas salidas.
2. Los callbacks del Bridge hacia el API eran síncronos y podían retrasar la liberación real de la llamada.
3. La base persistida podía quedar desincronizada del registry vivo del motor.
4. Si el evento `CallAccept` se perdía o llegaba tarde, podía existir audio real mientras la UI seguía en **Timbrando**.
5. Si el relay WhatsApp/SRTP se desconectaba, la interfaz podía seguir mostrando una llamada conectada aunque ya no existiera audio.
6. Si el WebRTC del navegador se perdía, el softphone seguía mostrando el audio como conectado.

## Patrón tomado de Hierro del Norte

Hierro del Norte libera el registro de llamada desde el cambio de estado a `Ended`, dispone de un watchdog para llamadas salientes que no completan setup y auto-repara una llamada obsoleta antes de permitir otro marcado. V4.1.6 porta esas garantías al modelo multi-tenant de WAMERCIO y añade reconciliación entre PostgreSQL y el registry del Bridge.

## Cambios de runtime

- `OnStateChange(Ended)` ejecuta teardown local inmediato.
- `OnEnded` queda como segunda ruta idempotente de finalización.
- Persistencia de estado al API se realiza fuera del hilo de señalización.
- `/calls/status` expone `active_call_snapshots`.
- `GET /calls` compara PostgreSQL con el motor vivo y elimina estados fantasma.
- Setup saliente tiene watchdog de acuerdo con `ring_seconds` con mínimo de 35 s.
- Estados no terminales son monotónicos: Active/Held no retroceden a Ringing/Connecting.
- Primer audio SRTP válido puede recuperar una salida Ringing a Active.
- Relay SCTP intenta recuperación y finaliza la llamada si no retorna el medio.
- WebRTC del navegador detecta cierre/fallo y habilita reconexión.

No agrega migraciones nuevas.
