# Performance baseline and comparison runbook

Run this procedure on a staging deployment with production-like data. Use the same CPU, memory, environment, replica count and load generator for `before` and `after` samples.

## Environment record

Record:

- image digest, commit and Go version;
- backend replicas, CPU/memory limit, `GOMAXPROCS`, `GOGC` and `GOMEMLIMIT`;
- PostgreSQL `max_connections`, PgBouncer mode and every application pool limit;
- Redis pool/memory limits;
- active tenants and tenant databases;
- active SSE connections.

The application startup log and private `/metrics` endpoint provide the runtime values. Keep `127.0.0.1:6060` inaccessible from public ingress; collect through an authenticated tunnel or from inside the container network.

## Independent scenarios

Measure each scenario separately before mixing traffic:

1. Open catalog.
2. Search products and load categories.
3. Customer login and registration.
4. Pull/update the cart.
5. Create an order with 1, 10, 50 and 150 unique products.
6. Retry the same order with the same idempotency key.
7. Change order status.
8. Deliver SSE updates to fast and deliberately slow clients.
9. Load the SaaS administration overview.
10. Provision one business and run migrations.
11. Import products and load brand analytics.
12. Repeat catalog/order traffic across multiple tenant databases.

For each scenario capture requests/second, errors, p50/p95/p99, CPU, RSS, heap, allocations, GC cycles/pause, goroutines, active SSE, PostgreSQL query duration, pool waits and Redis latency/errors.

## Profiles and benchmarks

```bash
go test -run='^$' -bench=. -benchmem -count=10 ./... > before.txt
go test -run='^$' -bench=. -benchmem -count=10 ./... > after.txt
go test -race ./...
```

Capture representative 30-second CPU profiles and heap/goroutine/mutex/block profiles:

```bash
go tool pprof 'http://127.0.0.1:6060/debug/pprof/profile?seconds=30'
go tool pprof http://127.0.0.1:6060/debug/pprof/heap
go tool pprof http://127.0.0.1:6060/debug/pprof/goroutine
go tool pprof http://127.0.0.1:6060/debug/pprof/mutex
go tool pprof http://127.0.0.1:6060/debug/pprof/block
```

Only after profiles cover representative traffic, combine them and place the result at `cmd/api/default.pgo`:

```bash
go tool pprof -proto profile-a.pprof profile-b.pprof > cmd/api/default.pgo
make build
```

Accept a change only when errors and business outcomes are unchanged and the targeted metric improves without unacceptable regressions in memory, allocation count, goroutines or maintainability.
