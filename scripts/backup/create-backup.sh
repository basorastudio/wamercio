#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${COLMAPRO_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BACKUP_ROOT="${COLMAPRO_BACKUP_ROOT:-/opt/colmapro_backups}"
STATE_ROOT="${COLMAPRO_BACKUP_STATE_ROOT:-/var/lib/colmapro}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DESTINATION="${BACKUP_ROOT}/${STAMP}"
COMPOSE=(docker compose --project-directory "$PROJECT_DIR" -f "$PROJECT_DIR/docker-compose.yml")

for command in docker jq zstd restic sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "Falta la dependencia requerida: $command" >&2; exit 1; }
done

[[ -f "$PROJECT_DIR/.env" ]] || { echo "No existe $PROJECT_DIR/.env" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source "$PROJECT_DIR/.env"
[[ -f "$PROJECT_DIR/.env.auto" ]] && source "$PROJECT_DIR/.env.auto"
set +a

POSTGRES_USER="${POSTGRES_USER:-colmapro}"
mkdir -p "$DESTINATION/databases" "$STATE_ROOT"
chmod 700 "$DESTINATION" "$STATE_ROOT"

write_status() {
  local status="$1" message="$2"
  jq -n \
    --arg status "$status" \
    --arg message "$message" \
    --arg started_at "${BACKUP_STARTED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" \
    --arg finished_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg backup_id "$STAMP" \
    '{status:$status,message:$message,backup_id:$backup_id,started_at:$started_at,finished_at:$finished_at}' \
    > "$STATE_ROOT/backup-status.json.tmp"
  mv "$STATE_ROOT/backup-status.json.tmp" "$STATE_ROOT/backup-status.json"
  chmod 600 "$STATE_ROOT/backup-status.json"
}

BACKUP_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
write_status running "Creando copia local"
trap 'rc=$?; if [[ $rc -ne 0 ]]; then write_status failed "La copia de seguridad falló. Revisa los registros del servicio."; fi; exit $rc' EXIT

# Load the configuration saved by the superadministrator. Environment variables
# can override every value for emergency recovery or first-time bootstrap.
backup_json="$(${COMPOSE[@]} exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "${SAAS_DB_NAME:-colmapro_saas}" -Atqc "SELECT value::text FROM platform_settings WHERE key='"'"'backups'"'"' LIMIT 1"' 2>/dev/null | tr -d '\r' || true)"
[[ -n "$backup_json" ]] || backup_json='{}'

json_value() { jq -r "$1 // empty" <<<"$backup_json"; }
json_bool() { jq -r "$1 // false" <<<"$backup_json"; }

BACKUP_ENABLED="${COLMAPRO_BACKUP_ENABLED:-$(json_bool '.enabled')}"
[[ "$BACKUP_ENABLED" == "true" ]] || { write_status skipped "Los respaldos automáticos están desactivados"; echo "Respaldos desactivados."; exit 0; }

RESTIC_PASSWORD="${COLMAPRO_RESTIC_PASSWORD:-$(json_value '.restic_password')}"
[[ -n "$RESTIC_PASSWORD" ]] || { echo "No se configuró la contraseña de Restic" >&2; exit 1; }
export RESTIC_PASSWORD

PRIMARY_ENABLED="${COLMAPRO_BACKUP_PRIMARY_ENABLED:-$(json_bool '.primary.enabled')}"
PRIMARY_ENDPOINT="${COLMAPRO_BACKUP_PRIMARY_ENDPOINT:-$(json_value '.primary.endpoint')}"
PRIMARY_REGION="${COLMAPRO_BACKUP_PRIMARY_REGION:-$(json_value '.primary.region')}"
PRIMARY_BUCKET="${COLMAPRO_BACKUP_PRIMARY_BUCKET:-$(json_value '.primary.bucket')}"
PRIMARY_ACCESS_KEY="${COLMAPRO_BACKUP_PRIMARY_ACCESS_KEY:-$(json_value '.primary.access_key')}"
PRIMARY_SECRET_KEY="${COLMAPRO_BACKUP_PRIMARY_SECRET_KEY:-$(json_value '.primary.secret_key')}"
PRIMARY_PREFIX="${COLMAPRO_BACKUP_PRIMARY_PREFIX:-$(json_value '.primary.prefix')}"

SECONDARY_ENABLED="${COLMAPRO_BACKUP_SECONDARY_ENABLED:-$(json_bool '.secondary.enabled')}"
SECONDARY_ENDPOINT="${COLMAPRO_BACKUP_SECONDARY_ENDPOINT:-$(json_value '.secondary.endpoint')}"
SECONDARY_REGION="${COLMAPRO_BACKUP_SECONDARY_REGION:-$(json_value '.secondary.region')}"
SECONDARY_BUCKET="${COLMAPRO_BACKUP_SECONDARY_BUCKET:-$(json_value '.secondary.bucket')}"
SECONDARY_ACCESS_KEY="${COLMAPRO_BACKUP_SECONDARY_ACCESS_KEY:-$(json_value '.secondary.access_key')}"
SECONDARY_SECRET_KEY="${COLMAPRO_BACKUP_SECONDARY_SECRET_KEY:-$(json_value '.secondary.secret_key')}"
SECONDARY_PREFIX="${COLMAPRO_BACKUP_SECONDARY_PREFIX:-$(json_value '.secondary.prefix')}"

DAILY_KEEP="${COLMAPRO_BACKUP_DAILY_DAYS:-$(json_value '.retention_daily')}"; DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="${COLMAPRO_BACKUP_WEEKLY_WEEKS:-$(json_value '.retention_weekly')}"; WEEKLY_KEEP="${WEEKLY_KEEP:-4}"
MONTHLY_KEEP="${COLMAPRO_BACKUP_MONTHLY_MONTHS:-$(json_value '.retention_monthly')}"; MONTHLY_KEEP="${MONTHLY_KEEP:-12}"

"${COMPOSE[@]}" exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -h 127.0.0.1 >/dev/null'

"${COMPOSE[@]}" exec -T postgres sh -lc 'pg_dumpall -U "$POSTGRES_USER" --globals-only --no-role-passwords' \
  | zstd -T0 -19 --quiet -o "$DESTINATION/globals.sql.zst"

database_list="$("${COMPOSE[@]}" exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d postgres -Atqc "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname"')"

while IFS= read -r database_name; do
  database_name="$(printf '%s' "$database_name" | tr -d '\r' | xargs)"
  [[ -z "$database_name" ]] && continue
  safe_name="$(printf '%s' "$database_name" | tr -cs 'A-Za-z0-9_.-' '_')"
  echo "Respaldando ${database_name}..."
  "${COMPOSE[@]}" exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -Fc -Z0 --no-owner --no-privileges --dbname="$1"' sh "$database_name" \
    | zstd -T0 -19 --quiet -o "$DESTINATION/databases/${safe_name}.dump.zst"
  printf '%s\t%s\n' "$safe_name" "$database_name" >> "$DESTINATION/databases.tsv"
done <<< "$database_list"

cat > "$DESTINATION/manifest.json" <<JSON
{
  "application": "WAMERCIO",
  "backup_id": "$STAMP",
  "created_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "database_count": $(wc -l < "$DESTINATION/databases.tsv" | tr -d ' '),
  "database_format": "PostgreSQL custom format without internal compression",
  "compression": "Zstandard level 19",
  "encryption": "Restic authenticated encryption",
  "primary_provider": "Contabo Object Storage",
  "secondary_provider": "Cloudflare R2"
}
JSON

(
  cd "$DESTINATION"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)

"$PROJECT_DIR/scripts/backup/verify-backup.sh" "$DESTINATION"

upload_repository() {
  local label="$1" endpoint="$2" region="$3" bucket="$4" access_key="$5" secret_key="$6" prefix="$7"
  [[ -n "$endpoint" && -n "$bucket" && -n "$access_key" && -n "$secret_key" ]] || { echo "Configuración incompleta para $label" >&2; return 1; }
  local clean_endpoint="${endpoint%/}" clean_prefix="${prefix#/}"
  export AWS_ACCESS_KEY_ID="$access_key" AWS_SECRET_ACCESS_KEY="$secret_key" AWS_DEFAULT_REGION="${region:-auto}"
  export RESTIC_REPOSITORY="s3:${clean_endpoint}/${bucket}/${clean_prefix}"
  if ! restic snapshots >/dev/null 2>&1; then
    restic init
  fi
  restic backup "$DESTINATION" --tag colmapro --tag "$label" --host "$(hostname)" --json >/dev/null
  restic forget --keep-daily "$DAILY_KEEP" --keep-weekly "$WEEKLY_KEEP" --keep-monthly "$MONTHLY_KEEP" --prune
  restic check --read-data-subset=1/50
}

write_status uploading "Enviando copia cifrada a los proveedores externos"
remote_count=0
if [[ "$PRIMARY_ENABLED" == "true" ]]; then
  upload_repository contabo "$PRIMARY_ENDPOINT" "$PRIMARY_REGION" "$PRIMARY_BUCKET" "$PRIMARY_ACCESS_KEY" "$PRIMARY_SECRET_KEY" "$PRIMARY_PREFIX"
  remote_count=$((remote_count + 1))
fi
if [[ "$SECONDARY_ENABLED" == "true" ]]; then
  upload_repository cloudflare-r2 "$SECONDARY_ENDPOINT" "$SECONDARY_REGION" "$SECONDARY_BUCKET" "$SECONDARY_ACCESS_KEY" "$SECONDARY_SECRET_KEY" "$SECONDARY_PREFIX"
  remote_count=$((remote_count + 1))
fi
(( remote_count > 0 )) || { echo "No hay proveedores externos habilitados" >&2; exit 1; }

ln -sfn "$DESTINATION" "$BACKUP_ROOT/latest"
printf '%s\n' "$DESTINATION" > "$BACKUP_ROOT/latest.txt"
chmod -R go-rwx "$DESTINATION"
COLMAPRO_BACKUP_DAILY_DAYS="$DAILY_KEEP" COLMAPRO_BACKUP_WEEKLY_WEEKS="$WEEKLY_KEEP" COLMAPRO_BACKUP_MONTHLY_MONTHS="$MONTHLY_KEEP" "$PROJECT_DIR/scripts/backup/retention.sh"
write_status completed "Copia verificada y replicada correctamente"
trap - EXIT

echo "Respaldo completado: $DESTINATION"
