# WAMERCIO backend optimization report

This report maps the implementation to the ordered phases and acceptance criteria in the backend optimization guide. Existing business routes, response shapes, business rules and Spanish UI copy remain compatible. The frontend transport changes are invisible `Idempotency-Key` headers for customer orders and business provisioning; new liveness/readiness and private observability endpoints are additive.

## Measurement policy

The source-review environment intentionally did not install dependencies, start services or execute the application. Runtime latency, throughput, CPU and heap values are therefore not fabricated. `PERFORMANCE_BASELINE.md` contains the exact collection procedure to run on a representative staging deployment before rollout and again after rollout.

The following source-level measurements are deterministic and reproducible from the original and optimized trees:

| Area | Original | Optimized |
|---|---:|---:|
| Declared Go branch | 1.22 | 1.26 |
| SQL statements in customer-order canonicalization and inventory update for `N` unique products | `3N` | `3` |
| Global-customer startup synchronization for `N` customers | `N` individual upserts | one streaming `COPY` plus one set-based upsert |
| Tenant pool defaults | 35 pools × 3 connections | 20 pools × 2 connections |
| Permanent central/global pool defaults | 10 + 10 connections | 8 + 8 connections |
| SSE client queue | 16, silent event loss | 32, explicit slow-client disconnect |
| SSE replay | none | 128 events per tenant, globally bounded to 1,000 tenants |
| SSE cross-replica delivery | local process only | Redis Pub/Sub plus local broker |
| Catalog image upload buffering | up to the complete 15 MiB file in Go heap | 512 KiB multipart memory threshold, 512-byte sniff, streamed hashing/upload |
| Reusable R2 HTTP transport | no | yes |
| Reusable WAXUM HTTP transport | no | yes |
| Public health checks | one dependency check | separate liveness and readiness |
| Private profiling and metrics | none | loopback-only `:6060` |

## Phase 1 — observability

- JSON structured startup, request, slow-query and shutdown logs include request/trace/tenant/route/status/duration identifiers without request bodies, tokens, PINs or credentials.
- The private `/metrics` endpoint exports bounded HTTP histograms and approximate p50/p95/p99, response codes, active requests, rejected bodies, rate limits, runtime metrics, PostgreSQL pool waits, Redis pool statistics, tenant pool totals and SSE counters.
- PostgreSQL tracing records operation, duration and a short query fingerprint; it never logs query arguments.
- Explicit private pprof handlers expose CPU, heap, goroutine, mutex, block and trace profiles only on `INTERNAL_ADDR`, which defaults to `127.0.0.1:6060`; startup rejects non-loopback bindings.
- Build metadata, effective Go version, `GOMAXPROCS`, CPU count, `GOMEMLIMIT` and `GOGC` are logged at startup.

## Phase 2 — limits and lifecycle

- Explicit public/internal `http.Server` values cover header, read, idle, header-size and shutdown limits. REST requests receive context and per-response write deadlines. SSE uses per-write deadlines, so the shared server disables its absolute `WriteTimeout` only while realtime streaming is enabled.
- Nginx permits the documented ten-minute provisioning window while backend route deadlines remain authoritative for every API request.
- JSON bodies default to 2 MiB. Catalog image uploads remain compatible at 15 MiB but are streamed through disk-backed multipart handling instead of copied into the heap.
- Redis, PostgreSQL, migrations, R2 and WAXUM clients have bounded connect/read/write/operation timeouts and reusable transports.
- Docker assigns 2 CPUs, 1,536 MiB, `GOMEMLIMIT=1380MiB`, `GOGC=100`, a PID limit, read-only root filesystem, non-root UID and a bounded temporary filesystem.
- `GOMAXPROCS` is no longer set by application code; Go derives it from the container CPU limit.
- Signal handling marks readiness unavailable, cancels managed background work, closes SSE, drains HTTP, then closes Redis and PostgreSQL pools.
- Every permanent goroutine has a root context, cancellation path and wait point.

## Phase 3 — PostgreSQL

- Customer-order product reads are batched with one query per validation pass; inventory decrements use a single `unnest`-based update. Existing row locking and stock validation remain inside the short transaction.
- Order transactions have a dedicated timeout and publish Redis/SSE events only after commit.
- Optional idempotency records are stored in each tenant database. The frontend reuses a key across an in-flight retry, duplicate payloads return the original order, conflicting payloads return HTTP 409, and records expire through bounded seven-day cleanup.
- Business provisioning uses centrally persisted idempotency keys, request hashes, bounded leases and an append-only stage history covering database creation, migrations, tenant/domain registration, store/admin configuration and activation. A failed store/admin configuration resumes against the same registered tenant instead of allocating another database.
- Global-customer startup synchronization streams rows into a temporary table with PostgreSQL `COPY` and applies a single set-based upsert instead of issuing one command per customer.
- Composite indexes follow actual filters and sort order for products, sales, customer orders, store credit, tenants, subscriptions and audit logs.
- Central/global pools remain permanent. Tenant pools are lazy, deduplicated with `singleflight`, TTL-cleaned, globally capped and closed during shutdown. Capacity pressure rejects a new pool after expiry cleanup instead of closing a pool in the gap between tenant resolution and its first query.
- Session-level statement, lock and idle-transaction timeouts apply to direct PostgreSQL pools. PgBouncer transaction-mode URLs continue using simple protocol and avoid incompatible startup parameters.
- The initial budget uses at most 56 application-side connections: 8 central + 8 global + (20 active tenant pools × 2), leaving capacity below PostgreSQL's default budget for migrations and administration.

## Phase 4 — realtime and Redis

- SSE has one writer per connection, bounded queues, global/tenant/client connection caps, event IDs, `Last-Event-ID` replay, heartbeat, write deadline and deterministic slow-client disconnection. SSE tenant resolution does not open a PostgreSQL pool because the stream executes no tenant SQL.
- Redis distributes minimal tenant events among replicas; origin IDs prevent echo duplication. Redis failure degrades to local delivery rather than failing the business write.
- Cache, rate-limit and realtime keys use a `wamercio:` namespace. Bootstrap cache values have TTL and explicit invalidation.
- Concurrent misses for the same tenant/store bootstrap are coalesced with `singleflight` to avoid cache stampedes.
- Rate limits use an atomic Redis script across replicas and fall back to a strictly bounded local map if Redis is unavailable.

## Phase 5 — memory and CPU

- The measured `3N` order query pattern was replaced with three set-based statements; no cache hides the SQL issue.
- Product maps/slices are preallocated from known input sizes.
- Catalog images are hashed and uploaded as streams. WAXUM response reads are capped at 8 MiB.
- External retry waits now observe request cancellation.
- Local rate-limit and SSE replay maps have hard bounds.

## Phase 6 — PGO

Production builds use `-pgo=auto`. No synthetic `default.pgo` is included because the guide requires representative production traffic. Follow `PERFORMANCE_BASELINE.md` to capture multiple catalog, order, authentication, administration and SSE profiles, combine them into `cmd/api/default.pgo`, compare, and retain the previous binary for rollback.

## Phase 7 — horizontal scaling

- The backend container has no fixed container name and can be replicated.
- Order/cart/business state stays in PostgreSQL; rate limits and SSE fan-out use Redis.
- Pools and external service budgets remain explicit when CPU/RAM grows. The tuning helper no longer multiplies database, Redis or tenant-pool limits from host resources.
- Scale only after checking p95 latency, active requests, SSE connections, pool waits and PostgreSQL/Redis saturation.

## Verification gates

`make verify`, `make race`, `make benchmark` and `make build` define the local gates. The workflow in `.github/workflows/backend-quality.yml` checks known vulnerabilities, module integrity/tidiness, formatting, migration pairs, coverage, vet, tests, race detection, critical-path benchmarks and a production build with Go 1.26.

The source-only review could run shell/YAML/archive/static consistency checks, but it could not execute Go formatting, compilation, tests, race detection or benchmarks because the supplied environment has no Go toolchain and the project rules prohibit installation. These gates must pass in CI before deployment.
