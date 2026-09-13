#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/opt/wamercio"
if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta como root: sudo bash uninstall.sh"
  exit 1
fi
read -r -p "Esto apagará WAMERCIO. ¿Eliminar también datos de PostgreSQL/Redis y credenciales? [s/N]: " answer
cd "$APP_DIR" 2>/dev/null || true
if [[ -f docker-compose.yml ]]; then
  if [[ "$answer" =~ ^[sS]$ ]]; then
    docker compose down -v
    rm -rf "$APP_DIR"
  else
    docker compose down
  fi
fi
