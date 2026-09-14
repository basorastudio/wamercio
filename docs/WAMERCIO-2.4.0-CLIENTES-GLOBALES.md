# WAMERCIO 2.4.0 — Clientes globales

## Objetivo

Una persona se registra una sola vez en WAMERCIO y utiliza la misma identidad para comprar en cualquier negocio. El perfil global conserva identidad, acceso y direcciones; la tabla `customers` conserva la relación comercial aislada de cada negocio.

## Registro

1. WhatsApp validado con la sesión SaaS `support` de whatsmeow.
2. Cédula dominicana de 11 dígitos validada con Identidad Dominicana.
3. Autocompletado de nombre, apellido, fecha de nacimiento y género.
4. Dirección principal: Provincia, Municipio/Distrito, Barrio, Calle y Número; GEO RD MAP se usa cuando está habilitado.
5. PIN de cliente según `Centro SaaS → Acceso → PIN clientes`.

## Acceso posterior

El cliente introduce solamente WhatsApp y PIN. La sesión se almacena en la cookie segura `wamercio_customer_token` y es global para todos los negocios de la plataforma.

## Checkout

Navegar y agregar productos sigue siendo público. Al intentar confirmar el pedido, WAMERCIO exige una sesión de cliente. El backend obtiene nombre y WhatsApp de `global_customers` y la dirección de `customer_addresses`; el navegador no puede sustituir estos datos enviando campos libres.

## Panel del cliente

- `/cliente/pedidos`: pedidos del cliente en todos los negocios.
- `/cliente/perfil`: identidad y direcciones guardadas.
- Direcciones: crear, editar, marcar principal y eliminar.

## Compatibilidad

La migración `000018_customer_global_auth` amplía `global_customers`, crea `customer_addresses`, enlaza `orders.global_customer_id` y backfillea pedidos cuando la relación local ya tenía `global_customer_id`. Los clientes históricos sin PIN se consideran perfiles preexistentes que deben completar el registro antes de usar el acceso global.

## Despliegue

No se agregan variables de entorno nuevas. En Dokploy realiza **Rebuild + Redeploy** sin eliminar los volúmenes de PostgreSQL, Redis o uploads.
