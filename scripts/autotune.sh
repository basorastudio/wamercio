#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${APP_DIR}/.env"
ENV_AUTO="${APP_DIR}/.env.auto"
PGBOUNCER_DIR="${APP_DIR}/deploy/pgbouncer"

get_env() {
  local key="$1" fallback="${2:-}" value=""
  if [[ -f "$ENV_FILE" ]]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d '=' -f2- || true)"
  fi
  if [[ -z "$value" || "$value" == "auto" ]]; then
    printf '%s' "$fallback"
  else
    printf '%s' "$value"
  fi
}

memory_to_mb() {
  local value="${1,,}"
  case "$value" in
    *g|*gb|*gib)
      value="${value%%[!0-9]*}"
      echo $((value * 1024))
      ;;
    *m|*mb|*mib)
      echo "${value%%[!0-9]*}"
      ;;
    *)
      echo "${value%%[!0-9]*}"
      ;;
  esac
}

# Host values are informational only. Database and cache budgets remain
# explicit so container replicas never multiply a host-derived connection cap.
cpu_cores="$(nproc 2>/dev/null || echo 1)"
ram_mb="$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo 2>/dev/null || echo 1024)"
ram_gb="$((ram_mb / 1024))"
disk_gb="$(df -BG "$APP_DIR" 2>/dev/null | awk 'NR==2 {gsub("G","",$2); print $2}')"
disk_gb="${disk_gb:-0}"

backend_memory_limit="$(get_env BACKEND_MEMORY_LIMIT 1536m)"
backend_memory_mb="$(memory_to_mb "$backend_memory_limit")"
if ! [[ "$backend_memory_mb" =~ ^[0-9]+$ ]] || (( backend_memory_mb < 256 )); then
  backend_memory_mb=1536
fi
backend_gomemlimit="$(get_env BACKEND_GOMEMLIMIT "$((backend_memory_mb * 90 / 100))MiB")"

pg_max_connections="$(get_env PG_MAX_CONNECTIONS 80)"
pg_shared_buffers="$(get_env PG_SHARED_BUFFERS 512MB)"
pg_effective_cache="$(get_env PG_EFFECTIVE_CACHE_SIZE 2GB)"
pg_work_mem="$(get_env PG_WORK_MEM 4MB)"
pg_maintenance_mem="$(get_env PG_MAINTENANCE_WORK_MEM 256MB)"

central_min_conns="$(get_env CENTRAL_DB_MIN_CONNS 1)"
central_max_conns="$(get_env CENTRAL_DB_MAX_CONNS 8)"
global_min_conns="$(get_env GLOBAL_CUSTOMERS_DB_MIN_CONNS 1)"
global_max_conns="$(get_env GLOBAL_CUSTOMERS_DB_MAX_CONNS 8)"
tenant_min_conns="$(get_env TENANT_DB_MIN_CONNS 0)"
tenant_max_conns="$(get_env TENANT_DB_MAX_CONNS 2)"
tenant_pool_ttl="$(get_env TENANT_POOL_TTL_MINUTES 5)"
max_active_tenants="$(get_env MAX_ACTIVE_TENANT_POOLS 20)"

pgbouncer_max_client_conn="$(get_env PGBOUNCER_MAX_CLIENT_CONN 200)"
pgbouncer_default_pool_size="$(get_env PGBOUNCER_DEFAULT_POOL_SIZE 2)"
pgbouncer_reserve_pool_size="$(get_env PGBOUNCER_RESERVE_POOL_SIZE 1)"

redis_memory="$(get_env REDIS_MAXMEMORY 256mb)"
bootstrap_ms="$(get_env BOOTSTRAP_REFETCH_MS 30000)"
session_ms="$(get_env CLIENT_SESSION_REFRESH_MS 30000)"
cart_ms="$(get_env CLIENT_CART_PULL_MS 15000)"
request_per_tenant="$(get_env MAX_REQUESTS_PER_MINUTE_PER_TENANT 720)"
request_per_ip="$(get_env MAX_REQUESTS_PER_MINUTE_PER_IP 180)"

cat > "$ENV_AUTO" <<EOF_ENV
AUTOTUNE_ENABLED=true
AUTOTUNE_PROFILE=conservative
AUTOTUNE_CPU_CORES=${cpu_cores}
AUTOTUNE_RAM_MB=${ram_mb}
AUTOTUNE_RAM_GB=${ram_gb}
AUTOTUNE_DISK_GB=${disk_gb}

BACKEND_MEMORY_LIMIT=${backend_memory_limit}
BACKEND_GOMEMLIMIT=${backend_gomemlimit}
BACKEND_GOGC=$(get_env BACKEND_GOGC 100)

PG_MAX_CONNECTIONS=${pg_max_connections}
PG_SHARED_BUFFERS=${pg_shared_buffers}
PG_EFFECTIVE_CACHE_SIZE=${pg_effective_cache}
PG_WORK_MEM=${pg_work_mem}
PG_MAINTENANCE_WORK_MEM=${pg_maintenance_mem}

CENTRAL_DB_MIN_CONNS=${central_min_conns}
CENTRAL_DB_MAX_CONNS=${central_max_conns}
CENTRAL_DB_MAX_IDLE_TIME=$(get_env CENTRAL_DB_MAX_IDLE_TIME 5m)
CENTRAL_DB_MAX_LIFETIME=$(get_env CENTRAL_DB_MAX_LIFETIME 30m)
GLOBAL_CUSTOMERS_DB_MIN_CONNS=${global_min_conns}
GLOBAL_CUSTOMERS_DB_MAX_CONNS=${global_max_conns}
GLOBAL_CUSTOMERS_DB_MAX_IDLE_TIME=$(get_env GLOBAL_CUSTOMERS_DB_MAX_IDLE_TIME 5m)
GLOBAL_CUSTOMERS_DB_MAX_LIFETIME=$(get_env GLOBAL_CUSTOMERS_DB_MAX_LIFETIME 30m)

TENANT_DB_MIN_CONNS=${tenant_min_conns}
TENANT_DB_MAX_CONNS=${tenant_max_conns}
TENANT_DB_MAX_IDLE_TIME=$(get_env TENANT_DB_MAX_IDLE_TIME 5m)
TENANT_DB_MAX_LIFETIME=$(get_env TENANT_DB_MAX_LIFETIME 30m)
TENANT_POOL_TTL_MINUTES=${tenant_pool_ttl}
MAX_ACTIVE_TENANT_POOLS=${max_active_tenants}

USE_PGBOUNCER=true
PGBOUNCER_ADDR=pgbouncer:6432
PGBOUNCER_POOL_MODE=transaction
PGBOUNCER_MAX_CLIENT_CONN=${pgbouncer_max_client_conn}
PGBOUNCER_DEFAULT_POOL_SIZE=${pgbouncer_default_pool_size}
PGBOUNCER_RESERVE_POOL_SIZE=${pgbouncer_reserve_pool_size}

REDIS_MAXMEMORY=${redis_memory}
REDIS_MAXMEMORY_POLICY=$(get_env REDIS_MAXMEMORY_POLICY allkeys-lru)
REDIS_POOL_SIZE=$(get_env REDIS_POOL_SIZE 20)
REDIS_MIN_IDLE_CONNS=$(get_env REDIS_MIN_IDLE_CONNS 2)

BOOTSTRAP_REFETCH_MS=${bootstrap_ms}
CLIENT_SESSION_REFRESH_MS=${session_ms}
CLIENT_CART_PULL_MS=${cart_ms}
ENABLE_REALTIME_EVENTS=true
MAX_REQUESTS_PER_MINUTE_PER_TENANT=${request_per_tenant}
MAX_REQUESTS_PER_MINUTE_PER_IP=${request_per_ip}
EOF_ENV
chmod 600 "$ENV_AUTO" || true

mkdir -p "$PGBOUNCER_DIR"
postgres_user="$(get_env POSTGRES_USER wamercio)"
postgres_password="$(get_env POSTGRES_PASSWORD change_this_secure_password)"

cat > "${PGBOUNCER_DIR}/pgbouncer.ini" <<EOF_PGB
[databases]
* = host=postgres port=5432

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = plain
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = ${pgbouncer_max_client_conn}
default_pool_size = ${pgbouncer_default_pool_size}
reserve_pool_size = ${pgbouncer_reserve_pool_size}
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits,options
admin_users = ${postgres_user}
stats_users = ${postgres_user}
log_connections = 0
log_disconnections = 0
EOF_PGB

cat > "${PGBOUNCER_DIR}/userlist.txt" <<EOF_USERS
"${postgres_user}" "${postgres_password}"
EOF_USERS
chmod 644 "${PGBOUNCER_DIR}/userlist.txt" || true

cat > "${APP_DIR}/deploy/postgres/postgresql.auto.conf" <<EOF_PG
data_directory = '/var/lib/postgresql/data'
hba_file = '/var/lib/postgresql/data/pg_hba.conf'
ident_file = '/var/lib/postgresql/data/pg_ident.conf'
listen_addresses = '*'
port = 5432
max_connections = ${pg_max_connections}
shared_buffers = '${pg_shared_buffers}'
effective_cache_size = '${pg_effective_cache}'
work_mem = '${pg_work_mem}'
maintenance_work_mem = '${pg_maintenance_mem}'
wal_compression = on
checkpoint_completion_target = 0.9
random_page_cost = 1.1
effective_io_concurrency = 200
log_min_messages = warning
log_min_error_statement = error
EOF_PG

cat > "${APP_DIR}/deploy/redis/redis.auto.conf" <<EOF_REDIS
maxmemory ${redis_memory}
maxmemory-policy $(get_env REDIS_MAXMEMORY_POLICY allkeys-lru)
appendonly yes
EOF_REDIS

echo "AutoTune conservador generado correctamente"
echo "CPU detectada: ${cpu_cores} · RAM detectada: ${ram_gb} GB · Disco: ${disk_gb} GB"
echo "Los presupuestos de PostgreSQL, PgBouncer, Redis y pools son explícitos y no escalan con el host."
echo "Archivo: ${ENV_AUTO}"
