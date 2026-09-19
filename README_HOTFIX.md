# WAMERCIO V4.1.15 — WhatsApp Bridge build hotfix

El despliegue falla antes de iniciar los contenedores porque `video_raw_hook.go` importa un paquete inexistente:

`wamercio/services/whatsapp-bridge/internal/voip/wacall`

El paquete real del proyecto está en:

`wamercio/services/whatsapp-bridge/internal/wacall`

Este hotfix cambia solamente esa ruta y deja el bloque de imports ordenado por `gofmt`. No modifica la lógica de video, PostgreSQL, API ni Web.

## Aplicar

Desde la raíz del repositorio:

```bash
sh apply-hotfix.sh .
```

o aplica `WAMERCIO-V4.1.15-BUILD-HOTFIX.patch` con Git.

Después ejecuta:

```bash
cd services/whatsapp-bridge
go mod tidy
go mod verify
CGO_ENABLED=0 GOOS=linux go build -mod=readonly -trimpath -ldflags="-s -w" -o /tmp/wamercio-whatsapp ./cmd/bridge
```

Finalmente haz commit/push y vuelve a desplegar en Dokploy.
