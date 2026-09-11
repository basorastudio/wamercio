# Arquitectura WAMERCIO 1.1

## Principio

WAMERCIO conserva de Foody Friend el patrón SaaS de propietario → tiendas → catálogo → checkout → pedidos, pero sustituye Laravel/Twilio/pasarelas internacionales por servicios propios Go/Next.js y un motor WhatsApp basado en whatsmeow.

```text
                         WAMERCIO SaaS
                              │
              ┌───────────────┼────────────────┐
              │               │                │
          Next.js Web       Go API       WhatsApp Bridge
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
Sesiones WhatsApp, conversaciones, mensajes, confirmaciones de pedido y respuestas desde el panel.

### Soporte
Tickets, mensajes y operación del SuperAdmin.

### Auditoría comercial
Movimientos creados al marcar pagos/reembolsos de pedidos.

## Multitenancy

La versión 1.1 mantiene aislamiento lógico por `user_id` y `store_id` sobre una misma instancia PostgreSQL. Toda consulta sensible valida propietario o rol SuperAdmin desde la API.

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
9. notifica por WhatsApp si existe sesión conectada.

## WhatsApp

```text
WhatsApp
   ⇅
whatsmeow
   ⇅
whatsapp-bridge
   ⇅
Go API
   ⇅
conversations / messages / orders
```

Twilio no participa.

## Dokploy / Traefik

El routing estable de producción usa el File Provider de Traefik además de la red `dokploy-network`. El alias externo del frontend es `wamercio-web` y se conserva entre versiones.
