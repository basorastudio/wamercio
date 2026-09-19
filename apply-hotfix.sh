#!/bin/sh
set -eu
ROOT="${1:-.}"
cd "$ROOT"
FILE="services/whatsapp-bridge/internal/bridge/video_raw_hook.go"
[ -f "$FILE" ] || { echo "No se encontró $FILE" >&2; exit 1; }
python3 - <<'PY'
from pathlib import Path
p=Path('services/whatsapp-bridge/internal/bridge/video_raw_hook.go')
s=p.read_text()
wrong='"wamercio/services/whatsapp-bridge/internal/voip/wacall"'
right='"wamercio/services/whatsapp-bridge/internal/wacall"'
if wrong in s:
    s=s.replace(wrong,right)
    p.write_text(s)
elif right not in s:
    raise SystemExit('No se encontró ni la ruta vieja ni la nueva de wacall')
PY
if command -v gofmt >/dev/null 2>&1; then gofmt -w "$FILE"; fi
if grep -R --line-number 'internal/voip/wacall' services/whatsapp-bridge --include='*.go'; then
  echo 'Aún quedan imports incorrectos internal/voip/wacall' >&2
  exit 1
fi
echo 'Hotfix aplicado. Import correcto: internal/wacall'
