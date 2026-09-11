# WAMERCIO 1.3.0

Plataforma SaaS de comercio conversacional para República Dominicana. El flujo y la simplicidad visual del **panel comercial** toman como referencia Foody Friend, pero WAMERCIO utiliza código, arquitectura, branding y autenticación propios.

## Landing pública + acceso unificado (1.3.0)

La raíz `https://wamercio.com/` ahora es una landing comercial mobile-first inspirada en la estructura de Foody Friend/WhatsMenu, pero con identidad WAMERCIO (amarillo ámbar + azul noche). Incluye hero, funciones, proceso, planes dinámicos, experiencia PWA y CTAs.

El acceso y registro de comerciantes se fusionaron en un único modal progresivo:

1. El usuario introduce su WhatsApp.
2. `POST /api/v1/auth/store/lookup` determina si ya existe.
3. Si existe, se solicita únicamente el PIN de 4 dígitos.
4. Si no existe, el mismo modal abre el formulario corto de registro, conservando el WhatsApp introducido.
5. `/login` y `/register` se mantienen por compatibilidad, pero redirigen a `/?access=1`.

El SuperAdmin conserva su acceso separado en `/admin/login`.


## Routing estable en Dokploy (1.2.1)

La publicación del dominio ya no apunta Traefik directamente al contenedor Next.js. Se añadió un gateway Nginx estable:

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000
```

El servicio `traefik-config` espera a que el gateway esté `healthy` antes de reemplazar atómicamente `/etc/dokploy/traefik/dynamic/wamercio.yml`. Esto evita el 502 que podía aparecer durante la recreación de `web`. Next.js también fija `HOSTNAME=0.0.0.0`.

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
