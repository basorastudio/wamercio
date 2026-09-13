#!/bin/sh
set -eu

postgres_user="${POSTGRES_USER:-colmapro}"
postgres_password="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be configured}"

cat > /tmp/pgbouncer.ini <<EOF
[databases]
* = host=postgres port=5432

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = plain
auth_file = /tmp/userlist.txt
pool_mode = transaction
max_client_conn = ${PGBOUNCER_MAX_CLIENT_CONN:-200}
default_pool_size = ${PGBOUNCER_DEFAULT_POOL_SIZE:-2}
reserve_pool_size = ${PGBOUNCER_RESERVE_POOL_SIZE:-1}
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits,options
admin_users = ${postgres_user}
stats_users = ${postgres_user}
log_connections = 0
log_disconnections = 0
EOF

printf '"%s" "%s"\n' "$postgres_user" "$postgres_password" > /tmp/userlist.txt
exec pgbouncer /tmp/pgbouncer.ini
