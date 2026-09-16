# WAMERCIO 2.6.0 — Fase 1 de crecimiento comercial

## Objetivo

Implementar sobre WAMERCIO V2.5.8 la primera fase aprobada del informe comparativo: vigencia de cupones, promociones automáticas, analítica, agenda administrativa de reservaciones, QR por mesa y KDS, sin duplicar pedidos, mesas, catálogo ni checkout.

## Principios

- Mantener el patrón visual mobile-first existente (`StoreShell`, `card`, `table`, `Modal`, `btn-*`, `field`).
- Mantener WhatsApp, catálogo, pedidos y clientes como núcleo horizontal.
- Exponer Reservaciones y KDS solamente cuando la tienda tenga `dine_in_enabled`.
- Reutilizar el ciclo actual de estados de pedidos; KDS no crea un modelo paralelo.
- Cupón y promoción son conceptos distintos: el cupón requiere código; la promoción se aplica automáticamente.
- Las promociones deben ser auditables en el pedido sin romper la columna `discount` existente.
- No añadir dependencias externas ni nuevas variables de entorno.

## Promociones

Nueva entidad `promotions` con nombre, tipo de descuento, valor, alcance (`all`, `products`, `categories`), vigencia, límite de usos y estado. Los objetivos específicos se almacenan en tablas relacionales. Durante checkout se buscan promociones activas y vigentes, se calcula el descuento automático sobre líneas elegibles y se escoge la promoción que produzca el mayor descuento. El cupón se evalúa después; para evitar apilamiento opaco se conserva el descuento mayor entre promoción automática y cupón.

El pedido guarda `promotion_id` y `promotion_name` para trazabilidad.

## Analítica

Nuevo endpoint por tienda y rango (`7d`, `30d`, `90d`) con ventas, pedidos, ticket promedio, clientes, distribución por modalidad, métodos de pago, top productos y serie diaria. Se excluyen cotizaciones y pedidos cancelados de ingresos.

## Reservaciones

Se reutiliza `table_reservations`. Se agregan endpoints administrativos para listar, crear manualmente y actualizar estado. La creación manual puede vincularse a un cliente global por teléfono si existe, pero no exige crear un pedido ficticio. Estados soportados: `reserved`, `confirmed`, `seated`, `completed`, `canceled`, `no_show`.

## QR por mesa

Cada mesa expone un QR con URL pública `...?table=<uuid>`. El storefront detecta ese parámetro, cambia a modalidad `dine_in`, preselecciona la mesa y conserva la fecha/hora predeterminada actual. El usuario todavía puede ajustar personas y horario antes de confirmar.

## KDS

Vista separada `/kds` para negocios dine-in. Endpoint dedicado devuelve pedidos activos (`pending`, `confirmed`, `processing`, `preparing`, `ready`) con productos y notas. La interfaz los distribuye en Nuevos, Preparando y Listos y usa el endpoint de estado existente para avanzar el pedido.

## Navegación

- Horizontal para todas las tiendas: `Promociones`, `Analítica`.
- Solo dine-in: `Reservaciones`, `KDS`, además de `Gestión de mesas` existente.

## Compatibilidad

No se eliminan endpoints ni campos existentes. Cupones sin fechas continúan funcionando. Pedidos históricos sin promoción siguen válidos. Las migraciones son reversibles.
