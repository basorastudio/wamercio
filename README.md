# WAMERCIO 1.2.0

Plataforma SaaS de comercio conversacional para República Dominicana. El flujo y la simplicidad visual del **panel comercial** toman como referencia Foody Friend, pero WAMERCIO utiliza código, arquitectura, branding y autenticación propios.

## Arquitectura de producto

```text
                    WAMERCIO
                       │
        ┌──────────────┴──────────────┐
        │                             │
  PANEL DE TIENDA               SUPERADMIN SaaS
  WhatsApp + PIN                email + contraseña
        │                             │
 StoreShell / PWA              SuperAdminShell
        │                             │
 tiendas, catálogo,             comerciantes, planes,
 pedidos, clientes,             suscripciones, soporte,
 delivery, WhatsApp             tiendas globales, métricas
```

Las sesiones son independientes:

- tienda: `wamercio_store_token`
- SaaS: `wamercio_admin_token`

## Experiencia de tienda

Patrón funcional equivalente al panel de usuario de Foody Friend:

- Dashboard
- Mis tiendas
- Categorías
- Productos, variantes y extras
- Delivery
- Cupones
- Pedidos
- Clientes
- Conversaciones
- WhatsApp
- Movimientos
- Plan y suscripción
- Soporte
- Perfil / PIN

La interfaz es **mobile-first**. En móvil utiliza navegación inferior fija y menú “Más”; en escritorio utiliza sidebar claro y compacto. El selector de tienda recuerda la última tienda administrada.

## SuperAdmin SaaS

Acceso independiente en:

```text
https://wamercio.com/admin/login
```

Usa las variables actuales:

```dotenv
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

Administra comerciantes, WhatsApp/PIN de acceso, estados, planes, tiendas globales, solicitudes, movimientos y tickets.

## Acceso de tiendas

```text
https://wamercio.com/login
```

El comerciante escribe su número de WhatsApp y después su PIN de 4 dígitos. El sistema inicia sesión automáticamente cuando se completa el PIN.

Comerciantes creados antes de 1.2 deben recibir un PIN desde **SuperAdmin → Comerciantes → llave** una sola vez.

## Registro

`/register` crea una cuenta comercial con:

- responsable;
- nombre del negocio;
- WhatsApp;
- PIN de 4 dígitos;
- correo opcional.

También crea la primera tienda y asigna el plan gratuito `Emprende` cuando está disponible.

## SPA + PWA

- Next.js App Router + React.
- navegación interna con `next/link`.
- manifest instalable.
- service worker con caché de assets y app shell.
- `start_url=/dashboard`.
- shortcuts PWA para Pedidos, Chat y Productos.
- safe-area para dispositivos móviles.

## Stack

- Next.js 14.2.35 + React 18 + TypeScript + Tailwind CSS
- Go + Chi + pgx
- PostgreSQL 16
- Redis 7
- whatsmeow como servicio independiente
- Docker Compose + Dokploy + Traefik

## Actualización desde 1.1.1

1. reemplaza el código del repositorio por esta versión;
2. conserva el `.env` actual;
3. **no uses Fresh Volumes**;
4. haz Rebuild en Dokploy;
5. entra primero en `/admin/login`;
6. abre `/admin/users` y asigna WhatsApp/PIN a cualquier comerciante anterior que todavía no tenga PIN;
7. prueba `/login` con ese WhatsApp + PIN.

La migración `000005_split_auth_panels` se aplica automáticamente al iniciar el API.

## Routing Dokploy

Se conserva sin cambios el workaround funcional de `wamercio.com` basado en `dokploy-network`, alias `wamercio-web`, `traefik-config` y File Provider. No lo elimines al actualizar.

## Documentación

- `DEPLOY_DOKPLOY.md`
- `docs/PANELES_Y_ACCESO.md`
- `docs/ARQUITECTURA.md`
- `docs/PRUEBAS.md`
- `docs/FOODY_FRIEND_MAPPING.md`
