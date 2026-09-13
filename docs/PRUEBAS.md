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
- [ ] QR abre `/{slug}`
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

## WAMERCIO 1.2 · autenticación y separación de paneles

1. Abrir `/admin/login` e iniciar sesión con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Confirmar que `/admin` carga y que la navegación solo contiene módulos SaaS.
3. Abrir `/dashboard` en la misma sesión administrativa: debe pedir el login de tienda si no existe una sesión comercial separada.
4. En `/admin/users`, configurar WhatsApp + PIN de un comerciante.
5. En una ventana privada, abrir `/login`.
6. Introducir primero el WhatsApp y luego un PIN de cuatro dígitos.
7. Confirmar entrada automática a `/dashboard` al completar el cuarto dígito.
8. Confirmar que el panel móvil muestra navegación inferior: Inicio, Pedidos, Chat, Productos, Más.
9. Abrir `/admin` desde la sesión de tienda: debe redirigir a `/admin/login`.
10. Cambiar el PIN desde `/settings/profile` y volver a iniciar sesión con el PIN nuevo.
11. Instalar la PWA y comprobar accesos rápidos a Pedidos, Chat y Productos.
