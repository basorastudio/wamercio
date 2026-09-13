#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ROOT="${COLMAPRO_BACKUP_ROOT:-/opt/colmapro_backups}"
DAILY_DAYS="${COLMAPRO_BACKUP_DAILY_DAYS:-7}"
WEEKLY_WEEKS="${COLMAPRO_BACKUP_WEEKLY_WEEKS:-4}"
MONTHLY_MONTHS="${COLMAPRO_BACKUP_MONTHLY_MONTHS:-12}"

[[ -d "$BACKUP_ROOT" ]] || exit 0
mapfile -t backups < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' -printf '%f\n' | sort -r)
declare -A keep=()
now="$(date +%s)"

for name in "${backups[@]}"; do
  timestamp="${name:0:8} ${name:9:6}"
  epoch="$(date -u -d "${timestamp:0:4}-${timestamp:4:2}-${timestamp:6:2} ${timestamp:9:2}:${timestamp:11:2}:${timestamp:13:2}" +%s 2>/dev/null || echo 0)"
  (( epoch > 0 )) || continue
  age_days=$(( (now - epoch) / 86400 ))
  if (( age_days < DAILY_DAYS )); then keep["$name"]=1; continue; fi
  if (( age_days < WEEKLY_WEEKS * 7 )) && [[ "$(date -u -d "@$epoch" +%u)" == "7" ]]; then keep["$name"]=1; continue; fi
  if (( age_days < MONTHLY_MONTHS * 31 )) && [[ "$(date -u -d "@$epoch" +%d)" == "01" ]]; then keep["$name"]=1; continue; fi
done

for name in "${backups[@]}"; do
  if [[ -z "${keep[$name]:-}" ]]; then
    echo "Eliminando respaldo vencido: $name"
    rm -rf -- "$BACKUP_ROOT/$name"
  fi
done
