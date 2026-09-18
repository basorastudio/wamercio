# WAMERCIO 4.1.11 — Perfil desde sidebar + International Telephone Input global

## 1. Mi cuenta

Se elimina el elemento independiente **Mi cuenta** del menú lateral. La tarjeta del usuario ubicada debajo de **Abrir softphone** es ahora el acceso único a `/settings/profile`. El botón de cerrar sesión sigue siendo una acción independiente para evitar cierres accidentales.

## 2. International Telephone Input

WAMERCIO ya incluía `@intl-tel-input/react` e `intl-tel-input`, pero todavía quedaban formularios con `<input>` convencional. V4.1.11 los unifica mediante `components/phone-input.tsx`.

Áreas cubiertas:

- Acceso y registro (ya existente)
- Mi cuenta (ya existente)
- Mi negocio / tiendas (ya existente)
- Usuarios (ya existente)
- Propietarios y negocios del superadmin (ya existente)
- WAMERCIO Calls
- Softphone / teclado de marcado
- Cotizaciones
- POS / cliente de mostrador
- Reservaciones
- Configuración global / WhatsApp de soporte

El componente usa formato internacional, búsqueda de país, bandera, código de país separado, validación y detección inicial de país con fallback `do`.

## 3. Softphone PiP

El marcador oscuro usa la misma integración internacional. Al crear Document Picture-in-Picture se clonan las hojas de estilo del documento principal antes de agregar el tema del softphone, permitiendo que `intl-tel-input` conserve su CSS dentro de PiP.

## 4. Base de datos

No requiere migraciones nuevas.
