#!/usr/bin/env bash
set -Eeuo pipefail
BACKUP_DIR="${1:-${COLMAPRO_BACKUP_ROOT:-/opt/colmapro_backups}/latest}"
PROJECT_DIR="${COLMAPRO_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE=(docker compose --project-directory "$PROJECT_DIR" -f "$PROJECT_DIR/docker-compose.yml")
BACKUP_DIR="$(readlink -f "$BACKUP_DIR")"
[[ -d "$BACKUP_DIR" ]] || { echo "Respaldo no encontrado: $BACKUP_DIR" >&2; exit 1; }
[[ -f "$BACKUP_DIR/SHA256SUMS" && -f "$BACKUP_DIR/databases.tsv" ]] || { echo "El respaldo está incompleto" >&2; exit 1; }
(cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS)
zstd -t "$BACKUP_DIR/globals.sql.zst"
while IFS=$'\t' read -r safe_name database_name; do
  [[ -z "$safe_name" ]] && continue
  file="$BACKUP_DIR/databases/${safe_name}.dump.zst"
  [[ -s "$file" ]] || { echo "El respaldo de $database_name está vacío" >&2; exit 1; }
  zstd -dc "$file" | "${COMPOSE[@]}" exec -T postgres pg_restore -l >/dev/null
  echo "Estructura válida: $database_name"
done < "$BACKUP_DIR/databases.tsv"
echo "Respaldo verificado correctamente: $BACKUP_DIR"
