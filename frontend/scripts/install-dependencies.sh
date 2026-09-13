#!/bin/sh
set -eu

REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmjs.org/}"
INSTALL_TIMEOUT="${NPM_INSTALL_TIMEOUT_SECONDS:-600}"
MAX_ATTEMPTS="${NPM_INSTALL_MAX_ATTEMPTS:-2}"

verify_dependencies() {
  node -e "require.resolve('next/package.json'); require.resolve('styled-jsx/package.json'); require.resolve('tailwindcss/package.json'); require.resolve('typescript/package.json');"
}

run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then
    timeout -s TERM "$INSTALL_TIMEOUT" "$@"
  else
    "$@"
  fi
}

if grep -Eq 'applied-caas-gateway|internal\.api\.openai\.org|artifactory/api/npm' package-lock.json; then
  echo "ERROR: package-lock.json contiene una URL de registro privada y no es portable." >&2
  exit 31
fi

case "$MAX_ATTEMPTS" in
  ''|*[!0-9]*)
    echo "ERROR: NPM_INSTALL_MAX_ATTEMPTS debe ser un número entero positivo." >&2
    exit 32
    ;;
esac
if [ "$MAX_ATTEMPTS" -lt 1 ]; then
  echo "ERROR: NPM_INSTALL_MAX_ATTEMPTS debe ser mayor o igual que 1." >&2
  exit 32
fi

rm -rf node_modules
attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "Instalando dependencias frontend con npm ci (intento ${attempt}/${MAX_ATTEMPTS})..."
  set +e
  run_with_timeout npm ci \
    --registry="$REGISTRY" \
    --include=dev \
    --include=optional \
    --no-audit \
    --no-fund \
    --prefer-offline \
    --progress=false
  ci_status=$?
  set -e

  if [ "$ci_status" -eq 0 ] && verify_dependencies; then
    node node_modules/next/dist/bin/next --version
    exit 0
  fi

  echo "npm ci no completó una instalación válida (código ${ci_status})." >&2
  rm -rf node_modules
  npm cache verify >/dev/null 2>&1 || true
  attempt=$((attempt + 1))
done

echo "ERROR: no fue posible instalar exactamente las dependencias definidas en package-lock.json." >&2
echo "No se usó npm install como alternativa para evitar una compilación no reproducible." >&2
exit 33
