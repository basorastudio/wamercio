# wamercio

**wamercio** es la reconstrucción moderna, multi-tenant y completamente en español del SaaS de catálogo/comercio original, adaptada a República Dominicana y preparada para desplegarse en Dokploy.

## Stack

- Backend: Go + Chi + pgxpool.
- Base de datos: PostgreSQL.
- Cache/rate limiting: Redis.
- Frontend: Next.js + React + TypeScript + Tailwind CSS.
- Infraestructura: Docker Compose + Dokploy/Traefik.
- Multi-tenant: una sola instalación con subdominios wildcard.
- WhatsApp: Waxum.
- Identidad: Identidad Dominicana (`id.ltd.do`).
- Geografía/delivery: GEO RD MAP (`geo.ltd.do`).
- Zona horaria: `America/Santo_Domingo`.
- Moneda: DOP / RD$.

## Nombre e identidad técnica

La plataforma fue renombrada integralmente a `wamercio`:

- Marca visible: `wamercio`.
- Módulo Go: `wamercio/api`.
- Binario backend: `wamercio-api`.
- Paquete web: `wamercio-web`.
- Cookie administrativa: `wamercio_session`.
- Prefijos Redis: `wamercio:*`.
- Sesiones Waxum: `wamercio-<tenant>`.
- Client ID de Identidad: `wamercio`.
- Base PostgreSQL por defecto: `wamercio`.

## Inicio rápido local

El repositorio incluye un `.env` listo para desarrollo. Las claves externas de Waxum, Identidad y GEO RD MAP se dejan vacías deliberadamente porque deben ser credenciales reales.

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Abrir:

- Web: `http://localhost:3000`
- API: `http://localhost:8080/healthz`
- Tienda demo: `http://colmado-demo.localhost:3000`

Credenciales locales incluidas en `.env`:

- SuperAdmin: `admin@wamercio.local`
- Contraseña: `WamercioDev_Admin_2026!`
- Negocio demo: `demo@wamercio.local`
- Contraseña: `WamercioDev_Demo_2026!`

Estas credenciales son solo para desarrollo y nunca deben utilizarse en producción.

## Archivos de entorno

- `.env`: desarrollo/pruebas locales.
- `.env.example`: plantilla genérica.
- `.env.dokploy.example`: plantilla completa para producción/Dokploy.

## Servicios Docker

| Servicio | Puerto interno | Público en producción |
|---|---:|---|
| `web` | 3000 | Sí, mediante Traefik/Dokploy |
| `api` | 8080 | No |
| `postgres` | 5432 | No |
| `redis` | 6379 | No |

Next.js actúa como fachada hacia el API interno, por lo que PostgreSQL, Redis y Go no necesitan exposición pública.

## Subdominios

El frontend resuelve el hostname y convierte subdominios no reservados en tenants:

- `wamercio.com` → landing.
- `app.wamercio.com/panel` → panel del negocio.
- `admin.wamercio.com/admin` → SuperAdmin.
- `colmadojuan.wamercio.com` → comercio `colmadojuan`.
- `bonao.wamercio.com` → marketplace local si existe ese slug.

Subdominios reservados: `www`, `app`, `admin`, `api`.

## Integraciones

### Waxum

Variables:

```env
WAXUM_BASE_URL=https://waxum.ltd.do
WAXUM_SUPERADMIN_TOKEN=
WAXUM_WEBHOOK_BASE_URL=https://wamercio.com/api/backend/api/v1/public/webhooks/waxum
```

Cada negocio obtiene su propia sesión Waxum; el bearer global permanece en el backend.

### Identidad Dominicana

```env
IDENTITY_BASE_URL=https://id.ltd.do
IDENTITY_API_KEY=
IDENTITY_CLIENT_ID=wamercio
IDENTITY_APPLICATION_DOMAIN=wamercio.com
IDENTITY_HASH_SECRET=
```

La cédula/RNC se verifica server-to-server y nunca se expone la API key al navegador.

### GEO RD MAP

```env
GEO_RD_MAP_BASE_URL=https://geo.ltd.do
GEO_RD_MAP_API_KEY=
GEO_RD_MAP_PUBLIC_RATE_LIMIT=60
```

Se utiliza para Provincia → Ciudad → Barrio, autocomplete, reverse geocoding, geocercas, routing, distancia y ETA.

## Migraciones

El backend ejecuta automáticamente las migraciones embebidas al iniciar. La migración `007_wamercio_brand.sql` actualiza el nombre de plataforma en instalaciones que ya hubieran aplicado versiones anteriores.

## Correcciones de despliegue recientes

- Build Go reproducible en Dokploy aunque el repositorio aún no incluya `go.sum`.
- Corregida la migración `007_wamercio_brand.sql`: ahora utiliza `system_settings` (la tabla real) y no `platform_settings`.
- Logs de arranque del API mejorados para PostgreSQL, migraciones y Redis.
- Healthcheck interno con timeout explícito.

Ver `docs/CORRECCION_DOKPLOY_API_UNHEALTHY.md`.

## Despliegue

Consulta [`docs/DOKPLOY.md`](docs/DOKPLOY.md) para el procedimiento completo paso a paso.

## Documentación adicional

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- [`docs/MAPA_MODULOS.md`](docs/MAPA_MODULOS.md)
- [`docs/WAXUM.md`](docs/WAXUM.md)
- [`docs/IDENTIDAD.md`](docs/IDENTIDAD.md)
- [`docs/GEO_RD_MAP.md`](docs/GEO_RD_MAP.md)
- [`docs/RENOMBRADO_WAMERCIO.md`](docs/RENOMBRADO_WAMERCIO.md)

## Nota de build en Dokploy

El Dockerfile del API resuelve el grafo de módulos después de copiar el código (`go mod tidy`) y compila con `-mod=mod`. Esto evita el error `missing go.sum entry` en exportaciones del repositorio que todavía no contienen un `go.sum` completo. Para máxima reproducibilidad se recomienda ejecutar `go mod tidy` en desarrollo y versionar el `go.sum` resultante.
