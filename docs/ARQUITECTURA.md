# Arquitectura WAMERCIO

## Principio

La aplicación conserva el flujo comercial y el patrón visual de gestión observado en Foody Friend, pero no reutiliza su backend Laravel, Twilio ni su colección de pasarelas de pago.

## Servicios

### web
Next.js/React. Panel administrativo, catálogo público, carrito, checkout y PWA.

### api
Go/Chi. Autenticación, tenants lógicos, catálogo, pedidos, planes, archivos y coordinación de WhatsApp.

### whatsapp
Go/whatsmeow. Sesiones por tienda, QR, reconexión, mensajes de texto y eventos entrantes.

### postgres
Fuente de verdad para usuarios, tiendas, catálogo, pedidos, conversaciones y credenciales del store SQL de whatsmeow.

### redis
Preparado para cache, rate limiting, colas y eventos en siguientes iteraciones.

## Multitenancy

La versión entregada usa una única instancia PostgreSQL con aislamiento lógico por `user_id` y `store_id`, equivalente al enfoque SaaS práctico de Foody Friend pero con controles explícitos en la API.

Si WAMERCIO crece, la capa Go permite evolucionar a esquemas por tenant o bases de datos separadas sin rehacer el frontend.

## WhatsApp

```text
WhatsApp
  ⇅
whatsmeow bridge
  ⇅
WAMERCIO API
  ⇅
PostgreSQL
  ⇅
Centro de Conversaciones
```

Twilio no participa en el flujo.

## Pagos

La primera versión acepta únicamente métodos manuales:

- pago al recibir
- efectivo
- transferencia bancaria

No existe dependencia de Stripe, PayPal u otras pasarelas.
