# WAMERCIO

Reconstrucción moderna, con código propio, del concepto funcional de Foody Friend orientada a comercio conversacional para República Dominicana.

## Stack

- **Frontend:** Next.js 14 + React 18 + TypeScript + Tailwind CSS + PWA
- **API:** Go + Chi + pgx + PostgreSQL + JWT HttpOnly
- **Cache/infra:** Redis + Docker Compose
- **WhatsApp:** servicio Go separado con `whatsmeow` y sesiones multi-tienda almacenadas en PostgreSQL
- **Despliegue:** Docker Compose, preparado para Dokploy/Traefik

## Módulos incluidos

- Registro e inicio de sesión SaaS
- Planes y límites de tiendas/productos/pedidos
- Dashboard
- Múltiples tiendas
- Categorías
- Productos
- Variantes
- Adicionales/extras
- Carga de imágenes
- Cupones
- Zonas de delivery
- Catálogo público responsive
- Carrito persistente
- Checkout
- Pagos manuales: efectivo, transferencia y pago al recibir
- Pedidos y estados
- Notificaciones de pedido por WhatsApp cuando existe una sesión conectada
- Conexión WhatsApp por QR sin Twilio
- Centro de conversaciones WhatsApp (texto)
- PWA básica
- PostgreSQL migrations
- Docker healthchecks

## No incluido intencionalmente

- Twilio
- Stripe, PayPal, Razorpay, Mollie y demás pasarelas de Foody Friend
- Telegram/Messenger
- Facturación fiscal
- GEO RD MAP/Identidad Dominicana (preparados como integraciones futuras)
- Llamadas de WhatsApp
- Automatizaciones/IA avanzadas

## Inicio rápido local

```bash
cp .env.example .env
# Cambia contraseñas y secretos en .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Abre `http://localhost:3000` si publicas temporalmente el puerto del servicio web, o usa un reverse proxy. Para producción usa Dokploy según `DEPLOY_DOKPLOY.md`.

## Usuario administrador inicial

El API crea el superadministrador al primer arranque usando:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

El superadministrador recibe el plan `Pro` si es una instalación nueva.

## Estructura

```text
WAMERCIO/
├─ apps/
│  └─ web/                    Next.js
├─ services/
│  ├─ api/                    API comercial Go
│  └─ whatsapp-bridge/        whatsmeow multi-sesión
├─ docs/
├─ docker-compose.yml
├─ .env.example
└─ DEPLOY_DOKPLOY.md
```

## Flujo

```text
Cliente
  ↓
Catálogo Next.js
  ↓
Carrito / Checkout
  ↓
API Go
  ↓
PostgreSQL
  ↓
Pedido
  ├─ Panel WAMERCIO
  └─ WhatsApp Bridge → WhatsApp
```

## Seguridad antes de producción

1. Genera contraseñas largas para PostgreSQL y el administrador.
2. Genera `JWT_SECRET` e `INTERNAL_WEBHOOK_SECRET` aleatorios.
3. No subas un `.env` real al repositorio.
4. Expón públicamente solo el servicio `web`.
5. Mantén PostgreSQL, Redis, API y WhatsApp únicamente en la red interna de Docker.
6. Activa HTTPS en Dokploy.
7. Configura backups de `postgres_data` y `uploads_data`.

## Compatibilidad Go / whatsmeow

Desde WAMERCIO 1.0.1-mvp los servicios Go se construyen con `golang:1.27.1-alpine`.
El módulo declara Go 1.26 como mínimo porque la versión fijada de `go.mau.fi/whatsmeow`
requiere Go 1.26 o superior. Esto evita el error de Dokploy `requires go >= 1.26.0`.
