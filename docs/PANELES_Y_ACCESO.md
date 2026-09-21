# WAMERCIO 1.2 · Paneles y acceso

## Separación de aplicaciones

WAMERCIO tiene dos contextos completamente separados:

### Panel de tienda

Rutas principales: `/login`, `/dashboard`, `/orders`, `/conversations`, `/catalog/*`, etc.

Acceso:

```text
WhatsApp del comerciante
        ↓
PIN de 4 dígitos
        ↓
wamercio_store_token
        ↓
Panel operativo de tienda/s
```

La sesión dura hasta 30 días y no da acceso al panel SaaS.

En escritorio usa sidebar inspirado en la sencillez operativa de Foody Friend. En móvil usa cabecera compacta + navegación inferior fija y hoja “Más”. El selector de tienda recuerda la última tienda usada en `localStorage`.

### SuperAdmin SaaS

Rutas: `/admin/login` y `/admin/*`.

Acceso:

```text
ADMIN_EMAIL + ADMIN_PASSWORD
        ↓
wamercio_admin_token
        ↓
Panel SaaS
```

La sesión administrativa dura hasta 12 horas y no sirve para entrar al panel comercial.

El SuperAdmin administra comerciantes, tiendas globales, planes, solicitudes, movimientos y soporte. Desde **Comerciantes** puede definir/cambiar el WhatsApp de acceso y el PIN de 4 dígitos de una cuenta existente.

## Migración de usuarios existentes

Los comerciantes creados antes de 1.2 no tienen `pin_hash`. Después del primer Rebuild:

1. entra en `/admin/login` con `ADMIN_EMAIL` y `ADMIN_PASSWORD`;
2. abre `/admin/users`;
3. pulsa el botón de llave del comerciante;
4. confirma su WhatsApp;
5. asigna un PIN de 4 dígitos;
6. el comerciante ya puede entrar desde `/login`.

Los datos comerciales existentes no se eliminan.

## PWA / SPA

- App Router de Next.js y `next/link` para navegación interna sin recarga completa.
- PWA instalable con `manifest.webmanifest` y service worker.
- `start_url` del PWA: `/dashboard`.
- accesos rápidos PWA: Pedidos, Conversaciones y Productos.
- interfaz con safe-area para iPhone y barra inferior móvil.
- llamadas `/api/*` permanecen network-only; assets estáticos usan caché del service worker.
