# Arquitectura WAMERCIO 1.6

## Principio

WAMERCIO conserva el patrón SaaS propietario → tiendas → catálogo → checkout → pedidos, utilizando servicios propios Go/Next.js y un servicio de mensajería WAMERCIO integrado directamente con WhatsApp.

```text
                         WAMERCIO SaaS
                              │
              ┌───────────────┼────────────────┐
              │               │                │
          Next.js Web       Go API       Servicio WhatsApp
              │               │                │
              └───────────────┼────────────────┘
                              │
                         PostgreSQL
                              │
                         Redis / cache
```

## Dominios lógicos

### SaaS
Usuarios, roles, planes, suscripciones, solicitudes de cambio y SuperAdmin.

### Comercio por tienda
Configuración, branding, horarios, categorías, productos, variantes, extras, cupones, delivery, clientes y pedidos.

### Conversacional
Sesiones WhatsApp, conversaciones, mensajes, contacto/CRM, registros internos de atención y respuestas desde el panel.

### Soporte
Tickets, mensajes y operación del SuperAdmin.

### Auditoría comercial
Movimientos creados al marcar pagos/reembolsos de pedidos.

## Multitenancy

El aislamiento operativo se realiza por propietario y `store_id` sobre PostgreSQL. Toda consulta sensible valida propietario o rol SuperAdmin desde la API.

## Checkout seguro

El navegador nunca decide el total final. La API:

1. carga producto y configuración de tienda;
2. valida stock, variantes y extras;
3. calcula precios del lado servidor;
4. valida cupón y pedido mínimo;
5. valida delivery/recogida y método de pago;
6. crea/actualiza el CRM del cliente;
7. crea pedido e items en transacción;
8. descuenta inventario;
9. notifica por WhatsApp si existe una sesión conectada.

## WhatsApp y Centro de Conversaciones

```text
WhatsApp
   ⇅
Servicio WhatsApp WAMERCIO
   ⇅
Go API
   ⇅
conversations ─ messages
      │
      ├─ customers
      ├─ orders
      └─ conversation_notes
```

Las nuevas vinculaciones anuncian el dispositivo como **WAMERCIO**. El servicio usa conexión persistente, reconexión automática, supervisión de keep-alive y actividad periódica.

La UI del chat usa un patrón de tres zonas en escritorio: conversaciones, chat y panel contextual. El panel de contacto/registros es inline y reduce el ancho del chat, sin overlay ni blur. En móvil se adapta a vistas navegables.

## Dokploy / Traefik

El routing estable de producción es:

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000
```

El gateway permanece en `dokploy-network`; la configuración dinámica de Traefik se conserva entre versiones.

## Separación de identidades

```text
Browser / PWA
   ├─ acceso comercial → WhatsApp + PIN → wamercio_store_token → Owner API
   └─ /admin/login → Admin Auth → wamercio_admin_token → SuperAdmin API
```

Los contextos usan cookies distintas, roles distintos y middlewares diferentes, permitiendo sesiones simultáneas sin mezclar permisos.
