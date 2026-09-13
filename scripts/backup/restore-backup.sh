#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${1:-}"
TARGET_DATABASE="${2:-all}"
PROJECT_DIR="${WAMERCIO_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE=(docker compose --project-directory "$PROJECT_DIR" -f "$PROJECT_DIR/docker-compose.yml")

[[ -n "$BACKUP_DIR" ]] || { echo "Uso: $0 /ruta/respaldo [nombre_base|all]" >&2; exit 2; }
BACKUP_DIR="$(readlink -f "$BACKUP_DIR")"
"$PROJECT_DIR/scripts/backup/verify-backup.sh" "$BACKUP_DIR"

if [[ "${WAMERCIO_RESTORE_CONFIRM:-}" != "RESTORE_WAMERCIO" ]]; then
  echo "La restauración reemplaza datos. Define WAMERCIO_RESTORE_CONFIRM=RESTORE_WAMERCIO para continuar." >&2
  exit 3
fi

set -a
# shellcheck disable=SC1091
source "$PROJECT_DIR/.env"
set +a
POSTGRES_USER="${POSTGRES_USER:-wamercio}"
RESTORE_GLOBALS="${WAMERCIO_RESTORE_GLOBALS:-false}"

"${COMPOSE[@]}" stop backend pgbouncer frontend >/dev/null
restore_failed=0
trap 'if [[ $restore_failed -ne 0 ]]; then echo "La restauración falló; los servicios permanecerán detenidos." >&2; else "${COMPOSE[@]}" up -d pgbouncer backend frontend >/dev/null; fi' EXIT

if [[ "$RESTORE_GLOBALS" == "true" ]]; then
  echo "Restaurando roles y objetos globales..."
  zstd -dc "$BACKUP_DIR/globals.sql.zst" | "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 || { restore_failed=1; exit 1; }
fi

restore_database() {
  local safe_name="$1" database_name="$2" file="$BACKUP_DIR/databases/${safe_name}.dump.zst"
  echo "Restaurando $database_name..."
  "${COMPOSE[@]}" exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''$1'\'' AND pid <> pg_backend_pid();" -c "DROP DATABASE IF EXISTS \"$1\";" -c "CREATE DATABASE \"$1\";"' sh "$database_name"
  zstd -dc "$file" | "${COMPOSE[@]}" exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" --no-owner --no-privileges --exit-on-error --dbname="$1"' sh "$database_name"
}

found_target=0
while IFS=$'\t' read -r safe_name database_name; do
  [[ -z "$safe_name" ]] && continue
  if [[ "$TARGET_DATABASE" == "all" || "$TARGET_DATABASE" == "$database_name" ]]; then
    found_target=1
    restore_database "$safe_name" "$database_name" || { restore_failed=1; exit 1; }
  fi
done < "$BACKUP_DIR/databases.tsv"

if [[ $found_target -eq 0 ]]; then
  restore_failed=1
  echo "No se encontró la base solicitada: $TARGET_DATABASE" >&2
  exit 4
fi

restore_failed=0
echo "Restauración completada. Los servicios se iniciarán nuevamente."
