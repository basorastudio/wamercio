# WAMERCIO 2.1.3 — Convergencia funcional con referencias ColmaPro

## Objetivo
Conservar WAMERCIO 2.1.3 como base oficial y trasladar únicamente patrones funcionales maduros del proyecto ColmaPro anterior, sin copiar su arquitectura de bases ni su apariencia visual.

## Superadmin
- Resumen SaaS central.
- Página comercial editable, con vista previa, mantenimiento y reemplazo de `{domain}`.
- Propietarios y negocios en una sección unificada.
- Planes y suscripciones en una gestión comercial central.
- Clientes globales consolidados por WhatsApp entre negocios.
- Usuarios SaaS separados de propietarios.
- Centro SaaS para ajustes globales, estructura, comunicaciones y cumplimiento.

## Negocios
- Mantener Inicio, Pedidos, WhatsApp, Clientes y Catálogo.
- Añadir Punto de Venta para venta local/asistida.
- Añadir Usuarios internos del negocio.
- Evolucionar Entregas como Centro de operaciones.
- Separar Métodos de pago de la configuración general.
- Mantener Configuración como gestión de negocios del propietario.

## Restricciones
- Mantener el patrón visual actual de WAMERCIO 2.1.3.
- No reemplazar conversaciones/WhatsApp por patrones del proyecto anterior.
- Reutilizar las tablas actuales siempre que sea razonable.
- Añadir migraciones compatibles e idempotentes.
- No introducir dependencias frontend nuevas.
