# Changelog

## 1.1.0

### Añadido
- CRM de clientes por tienda.
- Configuración comercial completa por tienda.
- Banner, branding, horarios, pedido mínimo y mensajes de checkout.
- Delivery/recogida configurables.
- Métodos de pago manuales y datos bancarios.
- Productos destacados, etiquetas y orden visual.
- Control de inventario integrado al checkout/cancelación.
- Estado de pago independiente del estado operativo.
- Movimientos de pago/reembolso.
- Perfil editable y cambio de contraseña.
- Plan actual, consumo y solicitudes de cambio.
- SuperAdmin: usuarios, tiendas, planes, solicitudes, movimientos y tickets.
- Centro de soporte propietario/SuperAdmin.
- QR público de tienda.
- Rutas de conversaciones que faltaban en el MVP.

### Corregido
- Campos JSON `snake_case` de formularios Go que podían decodificarse como valores cero.
- Checkout ahora valida precios, variantes, extras, stock, cupón, delivery y métodos de pago en servidor.
- Cliente bloqueado no puede realizar checkout.

### Infraestructura
- Se conserva sin cambios el routing de Dokploy/Traefik File Provider de 1.0.5.
