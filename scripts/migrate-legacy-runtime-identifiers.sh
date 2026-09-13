#!/usr/bin/env sh
set -eu

CONTAINER="${POSTGRES_CONTAINER:-wamercio_postgres}"
TARGET_ROLE="wamercio"
TARGET_CORE="wamercio_core"
TARGET_GLOBAL="wamercio_global_customers"
LEGACY_ROLE="colma""pro"
LEGACY_CORE="${LEGACY_ROLE}_core"
LEGACY_GLOBAL="${LEGACY_ROLE}_global_customers"
MIGRATOR_ROLE="wamercio_identity_migrator"

if [ "${WAMERCIO_MIGRATE_IDENTIFIERS_CONFIRM:-}" != "YES" ]; then
  echo "Migración no ejecutada. Esta operación renombra el usuario y las bases internas existentes."
  echo "Haz un backup y vuelve a ejecutar con WAMERCIO_MIGRATE_IDENTIFIERS_CONFIRM=YES."
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no está disponible en este host." >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "No se encontró el contenedor PostgreSQL: $CONTAINER" >&2
  exit 1
fi

psql_as() {
  user="$1"
  shift
  docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$user" -d postgres "$@"
}

if psql_as "$TARGET_ROLE" -Atqc "SELECT 1" >/dev/null 2>&1; then
  echo "Los identificadores internos ya están normalizados para WAMERCIO."
  exit 0
fi

if ! psql_as "$LEGACY_ROLE" -Atqc "SELECT 1" >/dev/null 2>&1; then
  echo "No se encontró el usuario interno anterior ni el usuario WAMERCIO. Revisa el estado de PostgreSQL antes de continuar." >&2
  exit 1
fi

# Create a temporary superuser because PostgreSQL cannot rename the role used by
# the current connection.
psql_as "$LEGACY_ROLE" -Atqc "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$MIGRATOR_ROLE') THEN CREATE ROLE $MIGRATOR_ROLE LOGIN SUPERUSER; END IF; END \$\$;"

rename_database() {
  old_db="$1"
  new_db="$2"
  old_exists="$(psql_as "$MIGRATOR_ROLE" -Atqc "SELECT 1 FROM pg_database WHERE datname = '$old_db'" || true)"
  new_exists="$(psql_as "$MIGRATOR_ROLE" -Atqc "SELECT 1 FROM pg_database WHERE datname = '$new_db'" || true)"

  if [ "$old_exists" != "1" ]; then
    if [ "$new_exists" = "1" ]; then
      echo "Base ya normalizada: $new_db"
      return 0
    fi
    echo "No existe la base esperada: $old_db" >&2
    exit 1
  fi
  if [ "$new_exists" = "1" ]; then
    echo "Existen simultáneamente $old_db y $new_db; se aborta para evitar pérdida de datos." >&2
    exit 1
  fi

  psql_as "$MIGRATOR_ROLE" -c "ALTER DATABASE \"$old_db\" WITH ALLOW_CONNECTIONS false;" >/dev/null
  psql_as "$MIGRATOR_ROLE" -Atqc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$old_db' AND pid <> pg_backend_pid();" >/dev/null || true
  psql_as "$MIGRATOR_ROLE" -c "ALTER DATABASE \"$old_db\" RENAME TO \"$new_db\";" >/dev/null
  psql_as "$MIGRATOR_ROLE" -c "ALTER DATABASE \"$new_db\" WITH ALLOW_CONNECTIONS true;" >/dev/null
  echo "Base normalizada: $new_db"
}

rename_database "$LEGACY_CORE" "$TARGET_CORE"
rename_database "$LEGACY_GLOBAL" "$TARGET_GLOBAL"

# Terminate any remaining sessions owned by the previous role before renaming it.
psql_as "$MIGRATOR_ROLE" -Atqc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '$LEGACY_ROLE' AND pid <> pg_backend_pid();" >/dev/null || true

if [ "$(psql_as "$MIGRATOR_ROLE" -Atqc "SELECT 1 FROM pg_roles WHERE rolname = '$TARGET_ROLE'" || true)" = "1" ]; then
  echo "El usuario $TARGET_ROLE ya existe mientras el usuario anterior también existe; se aborta para evitar una colisión." >&2
  exit 1
fi

psql_as "$MIGRATOR_ROLE" -c "ALTER ROLE \"$LEGACY_ROLE\" RENAME TO \"$TARGET_ROLE\";" >/dev/null
psql_as "$TARGET_ROLE" -c "DROP ROLE IF EXISTS \"$MIGRATOR_ROLE\";" >/dev/null

echo "Identificadores internos normalizados para WAMERCIO."
echo "Ahora actualiza el ENV y realiza Rebuild + Redeploy en Dokploy."
