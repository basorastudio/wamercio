# WAMERCIO load testing

The scripts in `tests/load` use k6 and are intended for staging. Do not run them against production without an approved maintenance or test window.

## Common variables

```bash
export COLMAPRO_LOAD_BASE_URL=https://business-staging.ltd.do
export COLMAPRO_LOAD_STORE_ID=BUSINESS_UUID
```

For protected routes, authenticate first and provide the cookie through the variable required by each script. Never commit real credentials or cookies.

## Scenarios

```bash
k6 run tests/load/catalog.js
k6 run tests/load/auth.js
k6 run tests/load/orders.js
k6 run tests/load/sse.js
```

Run each scenario independently and record:

- Requests per second.
- p50, p95, and p99 latency.
- Error rate.
- Backend CPU, memory, goroutines, and GC.
- PostgreSQL connections and wait time.
- Redis latency and errors.
- SSE connections, reconnections, and saturated queues.

Write scenarios require an isolated test business and disposable data. After each run, validate inventory, sales, cash, credit, and idempotency instead of relying only on HTTP status codes.
