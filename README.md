# WAMERCIO

WAMERCIO es una plataforma SaaS multi-tenant para colmados dominicanos. El código fuente está escrito y organizado en inglés, mientras que todos los textos de la interfaz dirigidos a clientes y al personal permanecen en español.

### Dominios de la plataforma y los negocios

* `wamercio.com` sirve la página de aterrizaje del SaaS y los paneles de administración central.
* `*.ltd.do` sirve exclusivamente a los negocios registrados.
* El dominio raíz `ltd.do` redirige permanentemente a `https://wamercio.com`, para evitar que intente mostrar un tenant inexistente.

## Arquitectura

* **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, TanStack Query, Redux Toolkit y una capa PWA dinámica.
* **Backend:** Go, Chi, PostgreSQL, pgxpool, sqlc, golang-migrate y Redis.
* **Bases de datos:** una base de datos central del SaaS, una base de datos global de identidad de clientes y una base de datos PostgreSQL aislada por cada negocio.
* **Despliegue:** Docker Compose, PostgreSQL, PgBouncer, Redis y Nginx.
* **Resolución de tenants:** el dominio de la plataforma SaaS es independiente del dominio raíz comodín de los tenants; los subdominios comodín o los dominios personalizados identifican el negocio activo.

### Compatibilidad interna de esta primera fase

Esta conversión cambia la identidad pública y el despliegue, pero conserva deliberadamente identificadores internos heredados que no son visibles para el usuario —por ejemplo `colmapro_core`, `colmapro_global_customers`, el usuario PostgreSQL `colmapro`, el prefijo de bases `cp_`, claves Redis y nombres técnicos equivalentes— para no introducir migraciones de datos ni cambios de comportamiento. Se podrán renombrar en una fase técnica posterior si realmente aporta valor.

## Estructura del repositorio

```text
wamercio/
├── backend/                  API en Go, migraciones, consultas e integraciones
├── frontend/                 Aplicación Next.js y recursos estáticos de la PWA
├── deploy/                   Nginx, PostgreSQL, PgBouncer y archivos de servicios
├── scripts/                  Ajustes de capacidad y comprobaciones operativas
└── docker-compose.yml
```

## Despliegue con Dokploy

Crea en Dokploy una aplicación de tipo Docker Compose que apunte a este repositorio y configura las variables de `.env.example` en la configuración de variables de entorno de Dokploy.

Como mínimo, reemplaza todas las contraseñas y secretos de ejemplo, configura `APP_DOMAIN` y `ROOT_DOMAIN`, y conserva las siguientes direcciones internas de los servicios:

```text
CENTRAL_DATABASE_URL=postgres://colmapro:<password>@postgres:5432/colmapro_core?sslmode=disable
GLOBAL_CUSTOMERS_DATABASE_URL=postgres://colmapro:<password>@postgres:5432/colmapro_global_customers?sslmode=disable
TENANT_DATABASE_URL_TEMPLATE=postgres://colmapro:<password>@postgres:5432/{{database}}?sslmode=disable
REDIS_ADDR=redis:6379
PGBOUNCER_ADDR=pgbouncer:6432
```

Docker Compose es el único mecanismo oficial de despliegue de WAMERCIO. Dokploy construye directamente `backend`, `frontend` y `pgbouncer` desde el repositorio mediante `docker-compose.yml`; no se requieren Docker Swarm, imágenes GHCR ni un archivo `docker-stack.yml`.

Los volúmenes con nombre de PostgreSQL y Redis se conservan entre redespliegues; no los elimines durante un despliegue normal. Las migraciones se ejecutan automáticamente cuando `RUN_MIGRATIONS=true`.

Para conservar el comportamiento de producción que tenía el despliegue anterior durante operaciones administrativas largas, configura `HTTP_WRITE_TIMEOUT=10m` y `HTTP_EXTERNAL_REQUEST_TIMEOUT=10m` (son los valores incluidos en `.env.example`).

Dokploy puede desplegar automáticamente cada `push` a `main` o ejecutar un redespliegue manual. Como las imágenes se construyen desde el código fuente del commit seleccionado, no existe una dependencia de etiquetas `latest` ni de un pipeline previo de publicación de imágenes.

La importación del catálogo predeterminado solamente guarda registros en la base de datos y direcciones URL de imágenes, por lo que no requiere una política CORS de R2 ni carga objetos al bucket.

## Red de servicios de los contenedores

Los contenedores de producción deben acceder a los servicios mediante sus nombres de Docker Compose:

* `postgres:5432`
* `pgbouncer:6432`
* `redis:6379`

Dentro del contenedor del backend, `localhost` hace referencia al propio contenedor del backend.

PgBouncer genera su archivo de autenticación en tiempo de ejecución utilizando `POSTGRES_USER` y `POSTGRES_PASSWORD`.

## Desarrollo local

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

Backend:

```bash
cd backend
go mod download
go run ./cmd/api
```

También es posible iniciar un entorno completo mediante Docker Compose después de crear el archivo `.env` a partir de `.env.example` y proporcionar los secretos requeridos.

## Comandos de calidad

```bash
cd frontend
npm run typecheck
npm run lint
npm run build
```

```bash
cd backend
make verify
make race
make benchmark
make build
```

La observabilidad del backend, los presupuestos de recursos, la comparación de rendimiento y la recopilación de PGO están documentados en `backend/OPTIMIZATION_REPORT.md` y `backend/PERFORMANCE_BASELINE.md`.

La integración global de WhatsApp utiliza WAXUM mediante el SDK tipado incluido en `backend/third_party/waxum-go`. La configuración, las rutas internas y el flujo de sesiones están documentados en [`docs/WAXUM_INTEGRATION.md`](./docs/WAXUM_INTEGRATION.md).

## Reglas de idioma

* Los archivos de código fuente, módulos, tipos, funciones, variables, rutas y documentación interna utilizan inglés.
* Los botones, menús, formularios, alertas, mensajes de validación y demás textos visibles de la interfaz utilizan español profesional.
* Las claves de los payloads de la API utilizan nombres técnicos en inglés, normalmente en formato `snake_case` en los límites HTTP y de base de datos, y en formato `camelCase` dentro del frontend.

## Puntos principales de acceso

* Página de aterrizaje del SaaS: dominio de la plataforma configurado en `APP_DOMAIN`.
* Superadministrador: dominio de la plataforma + `/#/superadmin`.
* Administración del negocio: dominio de la plataforma + `/#/admin`; el tenant seleccionado se envía explícitamente y se valida utilizando el token del administrador.
* Panel de caja: `/#/cashier`.
* Panel de repartidores: `/#/delivery`.
* Catálogo del cliente: raíz del dominio del tenant.

Consulta `backend/API_ENDPOINTS.md` para conocer la superficie de la API y `PROJECT_REVIEW.md` para consultar el resumen de limpieza del código fuente.

## Escáner de códigos de barras

La integración reutilizable de Barcode Detection API, los flujos de catálogo, inventario y sugerencias, así como las migraciones relacionadas, están documentados en [`BARCODE_SCANNER_IMPLEMENTATION.md`](./BARCODE_SCANNER_IMPLEMENTATION.md).

## Operaciones de entrega

La aplicación del tenant incluye:

* Asignación individual de repartidores.
* Validación estricta de la cobertura de entrega.
* Estado de traspaso `ready_for_delivery`.
* Aceptación de la entrega por parte del repartidor.
* Ubicación en vivo.
* Visualización de rutas por carretera.
* Centro administrativo de operaciones de entrega.
* Acciones de contacto con el cliente.
* PIN de entrega o comprobación manual.
* Responsabilidad y trazabilidad histórica de las entregas.

Consulta `DELIVERY_IMPLEMENTATION.md` para conocer el flujo técnico y los endpoints.

Las credenciales de acceso usan políticas independientes: el PIN administrativo (propietarios, usuarios SaaS, administradores, cajeros y repartidores) es configurable entre 4 y 8 dígitos y parte de 6; el PIN de clientes también es configurable entre 4 y 8 dígitos y parte de 4. El PIN de confirmación específico para la entrega de un pedido se mantiene separado en cuatro dígitos.

La introducción del PIN en dispositivos móviles utiliza un único campo numérico real ubicado detrás de las celdas visuales, lo que garantiza un comportamiento confiable en Android e iOS.

Consulta `PIN_SECURITY_IMPLEMENTATION.md`.

## Preparación de los negocios para producción

Las operaciones de los negocios utilizan exclusivamente métodos de pago manuales o fuera de línea:

* Efectivo.
* Transferencia bancaria verificada por el negocio.
* Tarjeta procesada mediante una terminal externa.
* Crédito del negocio o fiado.

WAMERCIO no captura información de tarjetas ni autoriza pagos electrónicos de los negocios.

Consulta [`docs/OFFLINE_PAYMENTS.md`](./docs/OFFLINE_PAYMENTS.md).

Completa [`docs/PRODUCTION_CHECKLIST.md`](./docs/PRODUCTION_CHECKLIST.md) antes de iniciar el piloto y antes de cada lanzamiento.

Los procedimientos de copia de seguridad y restauración están documentados en [`docs/BACKUP_AND_RESTORE.md`](./docs/BACKUP_AND_RESTORE.md), la seguridad de acceso en [`docs/SECURITY_AND_ACCESS.md`](./docs/SECURITY_AND_ACCESS.md) y los escenarios de carga en [`docs/LOAD_TESTING.md`](./docs/LOAD_TESTING.md).

Las copias de seguridad están disponibles como scripts dentro de `scripts/backup/`. Configúralas mediante los trabajos programados de Dokploy o mediante un sistema externo de copias de seguridad.

## Integraciones técnicas

- [Identidad API](docs/IDENTIDAD_API.md): verificación servidor a servidor de cédulas y RNC.

## División Territorial — GEO RD MAP

La división territorial de República Dominicana se consume centralmente desde `https://geo.ltd.do` mediante el backend Go. WAMERCIO conserva sus rutas internas para compatibilidad, pero ya no distribuye los JSON locales de provincias, ciudades y barrios. La API Key de GEO RD MAP es exclusivamente servidor a servidor. Consulta `docs/GEO_RD_MAP_INTEGRATION.md` para la configuración y el contrato utilizado.
