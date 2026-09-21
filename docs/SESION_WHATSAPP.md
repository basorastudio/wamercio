# Sesión WhatsApp en WAMERCIO

Las nuevas vinculaciones se presentan en WhatsApp como **WAMERCIO**.

WAMERCIO mantiene la conexión mediante el canal persistente del dispositivo, reconexión automática, supervisión de keep-alive y actualización periódica de actividad. La presencia periódica se publica como no disponible para no mantener la cuenta visible permanentemente en línea.

## Sesiones vinculadas antes de 1.6.0

El nombre del dispositivo se define durante el emparejamiento. Si un teléfono todavía muestra un nombre técnico anterior, desvincula esa sesión una vez desde WAMERCIO y vuelve a escanear el QR. Las nuevas vinculaciones se registrarán como WAMERCIO.

## Aviso de inactividad de WhatsApp

WhatsApp puede mostrar avisos de cierre para dispositivos que considera inactivos. WAMERCIO reduce esa posibilidad manteniendo el servicio conectado y supervisando su actividad. La decisión final de conservar o cerrar un dispositivo vinculado pertenece a WhatsApp, por lo que ningún cliente no oficial puede garantizar la eliminación de un aviso impuesto por la aplicación.

## Vinculado no significa socket activo

WAMERCIO diferencia el estado persistente del dispositivo de la conexión instantánea del socket. Si WhatsApp mantiene el dispositivo vinculado pero el canal se corta temporalmente, la interfaz muestra **Vinculado · Reconectando** y conserva la sesión. No se solicita un QR nuevo salvo que exista una desvinculación real (`LoggedOut`) o el usuario pulse **Desvincular**.

Cada flujo QR queda asociado a su propia instancia de sesión. Los eventos tardíos de un QR anterior no pueden cambiar el estado de una vinculación posterior.
