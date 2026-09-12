# WAMERCIO 1.9 — Hoja de ruta aplicada

Esta versión deja de tratar WAMERCIO como una colección de módulos independientes y lo organiza alrededor del ciclo comercial real:

`WhatsApp → cliente → catálogo → pedido → cobro → preparación → entrega → historial`

## Simplificaciones aplicadas

- El menú principal del comerciante se reduce a Inicio, Pedidos, WhatsApp, Clientes, Catálogo, Ajustes, Mis tiendas y Mi cuenta.
- Productos y Categorías se agrupan visualmente bajo Catálogo.
- Zonas de entrega y Conexión pasan a formar parte de Ajustes.
- Soporte por tickets y Movimientos dejan de ocupar navegación diaria.
- WhatsApp pasa a ser una capacidad base de todos los planes.
- Una tienda ya no se elimina destructivamente: se archiva.
- El límite mensual de pedidos deja de bloquear ventas.

## Flujo conversacional

Desde una conversación de WhatsApp se puede:

1. identificar o crear el cliente;
2. buscar productos del catálogo;
3. elegir variantes y extras;
4. armar el pedido;
5. definir recogida o delivery;
6. seleccionar método de pago;
7. crear el pedido;
8. enviar al cliente un resumen y enlace de seguimiento.

## Checkout

- Respeta la pausa manual de pedidos.
- Respeta el horario comercial.
- Permite comprobante de transferencia.
- Genera un enlace público de seguimiento sin requerir cuenta de cliente.

## Operación

Estados del pedido:

- Pendiente
- Confirmado
- Preparando
- Listo
- En camino
- Entregado / Recogido
- Cancelado

Estados de pago manual:

- Pendiente
- Pagado
- Reembolsado

## Tiempo real y confiabilidad

- SSE para cambios de WhatsApp y operación en tiempo real.
- Redis para eventos y rate limiting.
- Outbox persistente con reintentos para mensajes automáticos.
- CORS restringido mediante `CORS_ALLOWED_ORIGINS`.
- Rate limiting del acceso por PIN y del SuperAdmin.

## Siguiente fase recomendada

Una vez estabilizada 1.9, las siguientes mejoras deben priorizarse en este orden:

1. Cloudflare R2 para media y backups.
2. Importación masiva de catálogo CSV.
3. Alertas de inventario bajo y reportes por período.
4. Equipo/empleados y permisos.
5. Promociones y facturación electrónica.

No se recomienda agregar IA, marketplace o canales adicionales antes de estabilizar completamente el flujo comercial principal.
