# WAMERCIO 4.1.1 — Softphone en Chat y Clientes

## Objetivo

Completar la integración visual de Calls dentro de WAMERCIO para que el agente pueda llamar sin abandonar el flujo de trabajo del chat y del directorio comercial, siguiendo el mismo patrón de estilo, diseño y funcionalidad que en Hierro del Norte.

## Incluye

- Botón **Llamar** en el encabezado del chat de WhatsApp.
- Botón **Llamar** en la tabla de **Clientes**.
- Botón **Llamar** en la tabla de **Contactos**.
- Botón **Llamar** en la ficha/modal de detalle del cliente.
- Nuevo componente reutilizable **Softphone** para WAMERCIO.
- Marcador numérico con teclado integrado.
- Precarga del contacto seleccionado desde chat, clientes o contactos.
- Vista compacta de llamada activa con:
  - contestar/rechazar,
  - conectar audio,
  - espera/reanudar,
  - transferir,
  - colgar.
- Acceso rápido al centro completo de llamadas (`/calls`).
- Lista resumida de llamadas recientes dentro del mismo softphone.

## Archivos principales

- `apps/web/components/calls-softphone.tsx`
- `apps/web/app/conversations/page.tsx`
- `apps/web/app/customers/page.tsx`

## Notas

- No requiere nuevas migraciones.
- Reutiliza el motor WACalls/WebRTC ya integrado en `4.1.0`.
- Mantiene el idioma visual en español.
