# WAMERCIO 4.3.1 — Hotfix de consola, sesión pública y PWA

## Problemas revisados

1. `GET /api/v1/customer/me 401 (Unauthorized)` al abrir un storefront sin haber iniciado sesión.
2. Advertencia del navegador: `apple-mobile-web-app-capable` está deprecado sin `mobile-web-app-capable`.
3. `static.cloudflareinsights.com/beacon.min.js ... ERR_BLOCKED_BY_CLIENT`.
4. `index.js:62 Target website not loaded`.

## Correcciones realizadas

### Sesión pública sin 401 esperado

El storefront estaba usando `/customer/me` para averiguar si el visitante tenía una sesión. Ese endpoint está correctamente protegido por `requireCustomerAuth`, por lo que un visitante anónimo producía un 401 visible en DevTools aunque la UI lo atrapara.

Se agregó `GET /api/v1/customer/session` fuera del middleware de autenticación. Para un invitado responde `200 { authenticated: false }`. Si existe una cookie válida de cliente, inyecta los claims y devuelve el mismo perfil utilizado por `/customer/me`.

El storefront ahora usa `/customer/session`. `/customer/me` sigue protegido para el portal de cliente y para operaciones donde realmente se requiere sesión.

### PWA / meta tags

Se añadió `other: { 'mobile-web-app-capable': 'yes' }` al metadata de plataforma, tenant genérico y tenant resuelto. Se conserva `appleWebApp` porque sigue siendo útil para dispositivos Apple.

### Mensajes externos

No existe ninguna referencia a `static.cloudflareinsights.com`, `beacon.min.js` ni al texto `Target website not loaded` dentro del repositorio WAMERCIO.

- `ERR_BLOCKED_BY_CLIENT` sobre Cloudflare Insights ocurre normalmente cuando el navegador/extensión bloquea el beacon inyectado por Cloudflare. No rompe WAMERCIO. Si se desea eliminarlo por completo, hay que desactivar Web Analytics/Browser Insights en Cloudflare o permitir ese dominio en el bloqueador.
- `Target website not loaded` tampoco proviene del bundle de WAMERCIO; corresponde a código inyectado por una extensión/herramienta del navegador.

## Despliegue

No hay migraciones nuevas. Sustituir el código por 4.3.1 y reconstruir `api` + `web`. El Service Worker cambia a `wamercio-store-v4.3.1` y los query strings de manifest/icono pasan a `v=4.3.1`, por lo que los clientes dejarán de reutilizar assets/PWA metadata de 4.3.0.
