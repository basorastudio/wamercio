# Checklist de pruebas WAMERCIO 1.1

## Infraestructura
- [ ] PostgreSQL healthy
- [ ] Redis healthy
- [ ] API healthy
- [ ] WhatsApp bridge healthy
- [ ] Web healthy
- [ ] `https://wamercio.com` abre sin 404 de Traefik

## Cuenta / SaaS
- [ ] Login/logout
- [ ] Editar perfil
- [ ] Cambiar contraseña
- [ ] Ver plan y consumo
- [ ] Crear solicitud de cambio de plan
- [ ] Aprobar/rechazar desde SuperAdmin
- [ ] Límite de tiendas/productos/pedidos aplicado

## Tiendas
- [ ] Crear/editar/eliminar tienda
- [ ] QR abre `/store/{slug}`
- [ ] Configurar logo/banner/color
- [ ] Configurar pedido mínimo
- [ ] Activar/desactivar delivery/recogida
- [ ] Configurar pagos manuales y cuenta bancaria
- [ ] Configurar horarios

## Catálogo
- [ ] Crear categoría
- [ ] Crear producto con imagen
- [ ] SKU y stock
- [ ] Variantes
- [ ] Extras
- [ ] Etiqueta/destacado/orden
- [ ] Producto agotado bloquea compra si controla stock

## Checkout
- [ ] Carrito persiste en navegador
- [ ] Delivery exige zona y dirección
- [ ] Recogida no cobra delivery
- [ ] Pedido mínimo se valida en servidor
- [ ] Cupón válido/inválido
- [ ] Método de pago se valida contra ajustes de tienda
- [ ] Total se recalcula del lado servidor
- [ ] Stock se descuenta al crear pedido

## Pedidos
- [ ] Ver detalle
- [ ] Cambiar estado
- [ ] Cancelar restaura stock
- [ ] Marcar pago como pagado
- [ ] Marcar reembolso
- [ ] Movimiento aparece en `/transactions`

## Clientes CRM
- [ ] Checkout crea/actualiza cliente
- [ ] Contadores y gasto total actualizan
- [ ] Editar notas/dirección
- [ ] Bloquear cliente impide nuevos pedidos

## WhatsApp
- [ ] Generar QR
- [ ] Vincular dispositivo
- [ ] Restaurar sesión tras reinicio
- [ ] Recibir mensaje
- [ ] Conversación aparece en WAMERCIO
- [ ] Responder desde WAMERCIO
- [ ] Pedido genera confirmación
- [ ] Cambio de estado genera notificación

## Soporte
- [ ] Propietario crea ticket
- [ ] Propietario responde
- [ ] SuperAdmin ve ticket
- [ ] SuperAdmin responde
- [ ] Ticket cambia a Respondido
- [ ] Cerrar ticket

## SuperAdmin
- [ ] Dashboard global
- [ ] Activar/bloquear usuario
- [ ] Asignar plan
- [ ] Ver tiendas SaaS
- [ ] Crear/editar plan
- [ ] Revisar solicitudes
- [ ] Ver movimientos globales
- [ ] Gestionar tickets
