# WAMERCIO 1.2.0

## Paneles separados

- Separación real entre **Panel de Tienda** y **SuperAdmin SaaS**.
- Nuevo `StoreShell` para la operación comercial.
- Nuevo `SuperAdminShell` exclusivo para administración SaaS.
- El SuperAdmin ya no ve módulos operativos de tienda dentro de su navegación.
- Un comerciante no puede reutilizar su sesión para entrar a `/admin/*`.

## Nuevo acceso de comerciantes

- `/login` ahora utiliza **WhatsApp + PIN de 4 dígitos**.
- Flujo progresivo: primero WhatsApp, luego PIN.
- Auto-login al completar los 4 dígitos.
- Nueva cookie independiente `wamercio_store_token` con sesión prolongada.
- Registro comercial adaptado a nombre + negocio + WhatsApp + PIN; correo opcional.
- Cambio de PIN desde **Mi cuenta**.
- El SuperAdmin puede configurar WhatsApp/PIN de comerciantes existentes.

## Acceso SuperAdmin

- Nuevo `/admin/login` con correo/usuario administrativo + contraseña.
- Cookie separada `wamercio_admin_token`.
- Sesión administrativa independiente y de menor duración.
- `/admin/me` independiente de `/me`.

## Mobile-first / SPA / PWA

- Navegación inferior móvil: Inicio, Pedidos, Chat, Productos y Más.
- Hoja móvil “Más” para módulos secundarios.
- Sidebar simplificado en escritorio siguiendo el patrón operativo de Foody Friend.
- Dashboard adaptado a tarjetas compactas y pedidos en formato móvil.
- Selector de tienda recuerda la última tienda utilizada.
- Navegación interna convertida a `next/link` para conservar comportamiento SPA.
- Service worker 1.2 con caché de app shell y assets estáticos.
- Manifest PWA actualizado con shortcuts y safe-area.

## Base de datos

- Nueva migración `000005_split_auth_panels`.
- `users.email` pasa a ser opcional para comerciantes.
- Nuevos campos `pin_hash`, `pin_changed_at` y `last_login_at`.
- Normalización de teléfonos existentes al formato numérico con prefijo país cuando corresponde.

## Compatibilidad

- Se conserva el routing de Dokploy/Traefik que ya funciona en `wamercio.com`.
- Se mantienen PostgreSQL, Redis, WhatsApp bridge, volúmenes y datos comerciales existentes.
