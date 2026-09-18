# WAMERCIO 4.1.5 — Softphone unificado y corrección de llamadas

## Problemas corregidos

1. Las llamadas entrantes abrían una interfaz blanca distinta al softphone.
2. El botón `Conectar audio` aparecía antes de contestar una llamada entrante y podía provocar 502.
3. Las llamadas salientes podían fallar antes de llegar a WACalls por la preparación SQL del registro.
4. Un evento tardío `ringing/connecting` podía volver a mostrar una llamada ya colgada.
5. `hangup/reject` podían dejar la UI congelada si el motor ya había eliminado la llamada.
6. Al finalizar una llamada, el PiP/softphone podía conservar errores o controles de la llamada anterior.

## Solución

- `CallsSoftphone` es ahora la única superficie visual del runtime de llamadas. En navegador normal aparece como panel oscuro WAMERCIO sin overlay; en Document PiP usa la misma interfaz.
- La llamada entrante solo muestra **Contestar** y **Rechazar** mientras está timbrando. Al contestar se negocia el audio automáticamente.
- El INSERT inicial de `whatsapp_calls` usa parámetros PostgreSQL explícitamente tipados y no depende de relaciones opcionales; conversación/agente se enlazan después.
- La preparación saliente dispone de una ventana mayor para PN→LID/USync/Signal.
- `hangup/reject` son idempotentes tanto en API como en Bridge.
- Los estados terminales no pueden volver a estados no terminales por callbacks tardíos.
- Al terminar la llamada el softphone vuelve al directorio y conserva el contacto para remarcar.

## Sin migraciones

V4.1.5 no añade migraciones de base de datos. Requiere reconstruir **Web + API + WhatsApp Bridge**.
