# WAMERCIO 4.1.7 — Softphone UI State Sync

## Problemas corregidos

1. El softphone abierto manualmente y el abierto por una llamada entrante podían verse distintos.
2. Los controles se mostraban por presencia de llamada y no por capacidad real del estado; por eso aparecían botones extra durante `ringing`.
3. El cronómetro utilizaba `answered_at || started_at`, haciendo que una llamada todavía timbrando pudiera comenzar con 139, 142 o más segundos.
4. Una llamada entrante podía estar conectada por WebRTC mientras la UI seguía mostrando `Timbrando`, manteniendo botones de Contestar/Rechazar.
5. En salientes, el audio remoto podía comenzar antes de que el estado persistido dejara `ringing`; ahora la primera media remota válida confirma localmente `Activa` y sincroniza los controles/timer.

## Patrón aplicado desde Hierro del Norte

- El tiempo de conversación empieza cuando existe `answeredAt`; timbrado y conexión no se consideran duración de conversación.
- Los controles dependen del estado/capacidades.
- El mismo softphone se reutiliza para directorio, llamada y PiP.

## Matriz de controles

| Estado | Controles |
|---|---|
| Entrante · Timbrando | Contestar, Rechazar |
| Saliente · Timbrando | Cancelar llamada |
| Conectando | Indicador de conexión, Colgar |
| Activa | Silenciar, Espera, Transferir, Colgar |
| En espera | Silenciar, Reanudar, Transferir, Colgar |
| Audio perdido durante activa/en espera | Reconectar audio + controles válidos |
| Transferida | Mensaje informativo, sin controles de media del agente anterior |

## Picture-in-Picture

WAMERCIO intenta abrir el mismo Document Picture-in-Picture para una llamada entrante. Los navegadores normalmente exigen una activación explícita del usuario para crear una nueva ventana PiP. Cuando esa política bloquea la apertura automática, WAMERCIO presenta un fallback dentro de la app que usa el mismo componente, estilos, controles y tamaño del softphone PiP; no existe una segunda interfaz de llamadas.

## Migraciones

No agrega migraciones.
