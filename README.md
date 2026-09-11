# WAMERCIO 1.1.0

Plataforma SaaS de comercio conversacional para República Dominicana, reconstruida con código propio tomando a Foody Friend como referencia de flujo comercial, organización del panel y experiencia de gestión.

## Stack

- **Frontend:** Next.js 14.2.35 + React 18 + TypeScript + Tailwind CSS + PWA
- **API:** Go + Chi + pgx + PostgreSQL + JWT HttpOnly
- **Cache/infra:** Redis + Docker Compose
- **WhatsApp:** servicio Go separado con `whatsmeow`, QR y sesiones multi-tienda
- **Despliegue:** Dokploy + Traefik, incluyendo el File Provider fallback que ya está funcionando en `wamercio.com`

## Funcionalidad incluida

### SaaS / cuenta
- Registro, login/logout y perfil
- Cambio de contraseña
- Planes, límites y consumo
- Solicitudes de cambio de plan sin pasarelas externas
- SuperAdmin para usuarios, tiendas, planes y solicitudes
- Centro de soporte con tickets y respuestas
- Libro de movimientos comerciales

### Comercio
- Múltiples tiendas por propietario
- Ajustes comerciales por tienda
- Logo, banner, color principal y textos del checkout
- Horarios comerciales
- Categorías
- Productos, SKU, stock y control de inventario
- Variantes y extras
- Etiquetas, productos destacados y orden de visualización
- Cupones
- Delivery y recogida
- Pedido mínimo
- QR público por tienda
- Catálogo público responsive
- Carrito persistente
- Checkout con validación de precios en servidor
- Efectivo, transferencia y pago al recibir
- Datos bancarios por tienda
- Pedidos, detalle, estado operativo y estado de pago
- Restauración de inventario al cancelar
- Registro de cobros/reembolsos en movimientos

### CRM / WhatsApp
- Clientes derivados del historial de compras
- Perfil del cliente, notas, dirección, gasto total y bloqueo
- Conversaciones WhatsApp por tienda
- Recepción y envío de texto desde WAMERCIO
- Sesión QR mediante whatsmeow, sin Twilio
- Confirmaciones de pedido y cambios de estado por WhatsApp

### SuperAdmin
- Dashboard SaaS
- Gestión de propietarios
- Activar/bloquear usuarios
- Asignar plan manualmente
- Ver todas las tiendas
- Crear/editar planes y límites
- Aprobar/rechazar solicitudes de plan
- Ver movimientos globales
- Centro de tickets de soporte

## No incluido intencionalmente

- Twilio
- Stripe, PayPal, Razorpay, Mollie y las demás pasarelas de Foody Friend
- Telegram/Messenger
- Facturación fiscal
- GEO RD MAP e Identidad Dominicana (se integrarán como servicios propios en siguientes fases)
- IA/automatizaciones avanzadas
- Llamadas de WhatsApp

## Estructura

```text
WAMERCIO/
├─ apps/web/                    Next.js / panel + tienda pública
├─ services/api/                Go / API comercial
│  └─ migrations/               PostgreSQL migrations
├─ services/whatsapp-bridge/    Go + whatsmeow
├─ infra/traefik/               routing estable de Dokploy
├─ scripts/                     diagnóstico Dokploy
├─ docs/
├─ docker-compose.yml
├─ .env.example
└─ DEPLOY_DOKPLOY.md
```

## Actualizar una instalación existente 1.0.5

No borres volúmenes. Sube esta versión al mismo repositorio y ejecuta **Rebuild** en Dokploy. El API ejecuta automáticamente las migraciones pendientes al arrancar:

- `000003_commerce_features`
- `000004_support_transactions`

Los volúmenes actuales de PostgreSQL, Redis y uploads se conservan.

## Routing de Dokploy

Esta versión **mantiene intacto** el workaround que ya resolvió el `404 page not found` de `wamercio.com`:

- `web` usa el alias `wamercio-web` en `dokploy-network`
- `traefik-config` instala `infra/traefik/wamercio.yml`
- el archivo dinámico se copia a `/etc/dokploy/traefik/dynamic/wamercio.yml`

No elimines esa configuración al actualizar.

## Seguridad

Antes de producción definitiva:

1. Mantén `.env` fuera del repositorio.
2. Rota secretos que hayan sido compartidos durante pruebas.
3. Expón solo el frontend; API, PostgreSQL, Redis y WhatsApp permanecen internos.
4. Configura backup de `postgres_data` y `uploads_data` en Dokploy.
5. Conserva HTTPS y Cloudflare según tu despliegue actual.

## Validación de esta entrega

- `gofmt` aplicado al API Go.
- 34 archivos TypeScript/TSX verificados con el parser de TypeScript sin errores sintácticos.
- Migraciones versionadas e idempotentes para actualización sobre 1.0.5.
- El entorno de creación no dispone de Docker ni acceso de red suficiente para ejecutar un build completo; la prueba final de integración debe hacerse mediante Rebuild en Dokploy, igual que en las versiones anteriores.
