#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/opt/wamercio"
CREDENTIALS_FILE="${APP_DIR}/CREDENCIALES_ADMIN.txt"
SUPERADMIN_CREDENTIALS_FILE="${APP_DIR}/CREDENCIALES_SUPERADMIN.txt"
if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta como root: sudo bash show-credentials.sh"
  exit 1
fi
if [[ ! -f "$CREDENTIALS_FILE" && ! -f "$SUPERADMIN_CREDENTIALS_FILE" ]]; then
  echo "No se encontraron archivos de credenciales en: $APP_DIR"
  exit 1
fi
if [[ -f "$CREDENTIALS_FILE" ]]; then
  cat "$CREDENTIALS_FILE"
fi
if [[ -f "$SUPERADMIN_CREDENTIALS_FILE" ]]; then
  echo
  cat "$SUPERADMIN_CREDENTIALS_FILE"
fi
