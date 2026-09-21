# WAMERCIO 2.4.0 — Identidad global, acceso y panel de clientes

## Objetivo
Implementar registro y acceso global de clientes mediante WhatsApp + PIN, verificación de WhatsApp con la sesión SaaS `support` de whatsmeow, verificación/autocompletado de Cédula con Identidad Dominicana, dirección estructurada con GEO RD MAP, sesión global reutilizable entre negocios, checkout autenticado y panel del cliente.

## Principios
- El cliente se registra una sola vez en WAMERCIO.
- `global_customers` es la identidad global; `customers` sigue siendo la relación comercial por negocio.
- Los propietarios, usuarios SaaS y clientes no comparten tabla de identidad.
- WhatsApp y Cédula son únicos globalmente para clientes.
- El PIN del cliente es independiente del PIN de propietario/personal y se configura en Centro SaaS → Acceso.
- El backend revalida WhatsApp y Cédula al registrar, no confía solo en el navegador.
- La sesión de cliente es global mediante cookie HTTP-only `wamercio_customer_token`.
- Navegar y armar carrito es público; confirmar un pedido exige sesión de cliente.
- Los pedidos históricos permanecen válidos.

## Modelo de datos
Ampliar `global_customers` con nombre, apellido, Cédula, fecha de nacimiento, género, PIN hasheado, estado y timestamps de verificación/login. Crear `customer_addresses` para múltiples direcciones y una dirección principal. Añadir `orders.global_customer_id` para asociación directa y poblarla a partir de `customers.global_customer_id`.

## API pública de autenticación de cliente
- `POST /api/v1/auth/customer/lookup`
- `POST /api/v1/auth/customer/validate-whatsapp`
- `POST /api/v1/auth/customer/verify-identity`
- `POST /api/v1/auth/customer/register`
- `POST /api/v1/auth/customer/login`
- `POST /api/v1/auth/customer/logout`

## API autenticada de cliente
- `GET /api/v1/customer/me`
- `PUT /api/v1/customer/me`
- CRUD `/api/v1/customer/addresses`
- `GET /api/v1/customer/orders`
- `GET /api/v1/customer/orders/{id}`

## UX de acceso/registro
1. WhatsApp.
2. Si existe: PIN y acceso.
3. Si no existe: validar WhatsApp con whatsmeow.
4. Registro: WhatsApp + Cédula en paralelo, autocompletar nombre/apellido/fecha/género, dirección territorial y PIN de cliente.
5. Tras registrarse, sesión iniciada automáticamente.

## Checkout
Al pulsar “Completar pedido”, si no existe sesión de cliente se abre el modal de acceso/registro. Al autenticar, el checkout se completa con identidad y dirección principal. El backend obtiene identidad desde la sesión y no acepta suplantación por campos `customer_name`/`customer_phone` del navegador.

## Panel del cliente
Rutas `/cliente/pedidos` y `/cliente/perfil`. Incluyen historial global de pedidos, perfil verificado, direcciones guardadas, edición de dirección y cierre de sesión. El encabezado de la tienda muestra Pedidos y avatar/nombre cuando la sesión está activa.

## Compatibilidad
Migración enlaza pedidos existentes con `global_customers` mediante `customers.global_customer_id`. No se eliminan tablas ni pedidos existentes. El checkout histórico continúa almacenando snapshots de nombre/teléfono/dirección en `orders`.
