# WAMERCIO Backend

The backend is a Go API built with Chi, pgxpool, sqlc, golang-migrate and Redis. It runs exclusively in multi-tenant SaaS mode.

## Database responsibilities

- `wamercio_core`: businesses, domains, owners, plans, subscriptions, platform settings, audit logs and tenant database assignments.
- `wamercio_global_customers`: global customer identity and authentication shared across businesses.
- Tenant databases: products, inventory, orders, sales, store credit, cash history, delivery zones, staff and business configuration.

## Source layout

```text
cmd/api/                         Application entry point
internal/config/                 Environment configuration
internal/httpapi/                HTTP routes, handlers and middleware
internal/platform/tenancy/       Tenant provisioning and connection pools
internal/platform/database/      PostgreSQL pools, migrations and global sync
internal/platform/cache/         Redis connection infrastructure
internal/integrations/           External service clients
third_party/waxum-go/             Typed WAXUM Go SDK used by WhatsApp workflows
db/core_migrations/              Central SaaS migrations
db/global_customer_migrations/   Global customer migrations
db/tenant_migrations/            Per-business migrations
db/queries/                      sqlc query definitions
```

## Run locally

```bash
cp .env.example .env
go mod download
go run ./cmd/api
```

The database URLs, migration paths and platform secrets must be configured before startup.

## WAXUM

The WhatsApp integration uses the bundled typed WAXUM SDK through a local Go module replacement. Configure the public WAXUM URL and superadministrator token from the SaaS settings panel, and set `WAXUM_HTTP_TIMEOUT` for the shared backend HTTP client. See `../docs/WAXUM_INTEGRATION.md` for the settings schema and platform routes.

## Static quality checks

```bash
make verify
make race
make benchmark
make build
```

The Docker build uses Go 1.26, verifies locked modules, compiles a static PGO-ready binary with build metadata and copies all migration sets and territory data into a non-root runtime image.

## Operations

- Public probes: `GET /health/live` and `GET /health/ready`.
- Private observability: `127.0.0.1:6060/metrics` and `127.0.0.1:6060/debug/pprof/`.
- Customer order retries may send `Idempotency-Key`; the same key and payload return the original order.
- Business provisioning retries use the same header and resume the persisted workflow stages.
- See `OPTIMIZATION_REPORT.md` for the guide mapping and `PERFORMANCE_BASELINE.md` for staging measurements and PGO collection.
