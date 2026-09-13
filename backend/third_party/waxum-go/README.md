# WAXUM Go SDK

SDK en Go, tipado y sin dependencias externas, para consumir la API REST multi-sesión de **WAXUM**.

Fue generado tomando como contrato `openapi/waxum.openapi.json` y complementado con utilidades manuales para las partes que la documentación de WAXUM describe fuera o de forma incompleta en OpenAPI.

## Cobertura

- **103 operaciones REST** del OpenAPI suministrado.
- **142 esquemas tipados** de solicitudes y respuestas.
- Servicios separados por dominio: sesiones, mensajes, grupos, contactos, medios, llamadas, webhooks, presencia, privacidad, bloqueo, MEX, newsletters, operaciones y NATS.
- Autenticación Bearer con `SUPERADMIN_TOKEN` o JWT.
- Errores HTTP tipados mediante `APIError`.
- Contextos, timeouts, cliente HTTP configurable y reintentos opcionales.
- Carga de medios mediante `multipart/form-data`.
- Verificación HMAC-SHA256 de webhooks.
- Descarga de grabaciones WAV de llamadas.
- Métodos `Raw` y `Health` para endpoints auxiliares o añadidos posteriormente.

## Requisitos

- Go 1.22 o superior.
- Una instancia de WAXUM accesible por HTTP o HTTPS.
- Un token válido de superadministrador.

## Instalación

### Como módulo local

Descomprime este SDK dentro de tu proyecto, por ejemplo:

```text
mi-aplicacion/
├── go.mod
├── cmd/
└── third_party/
    └── waxum-go/
```

Después ejecuta:

```bash
go mod edit -replace github.com/basoradev/waxum-go=./third_party/waxum-go
go get github.com/basoradev/waxum-go
```

### Publicándolo en GitHub

También puedes subir el contenido a un repositorio y cambiar la primera línea de `go.mod` por la ruta definitiva del módulo.

## Inicio rápido

```go
package main

import (
    "context"
    "fmt"
    "log"

    waxum "github.com/basoradev/waxum-go"
)

func main() {
    client, err := waxum.NewClient(
        "TU_SUPERADMIN_TOKEN",
        waxum.WithBaseURL("https://waxum.ltd.do"),
    )
    if err != nil {
        log.Fatal(err)
    }

    sessions, _, err := client.Sessions.List(context.Background())
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("Sesiones: %d\n", sessions.Total)
}
```

## Crear una sesión

```go
created, _, err := client.Sessions.Create(ctx, &waxum.CreateSessionRequest{
    ID:   waxum.Ptr("negocio-principal"),
    Name: waxum.Ptr("WhatsApp del negocio principal"),
    Device: &waxum.DevicePropsRequest{
        OS:       waxum.Ptr("Windows"),
        Platform: waxum.Ptr("desktop"),
    },
})
```

## Conectar mediante código de vinculación

```go
pair, _, err := client.Sessions.Pair(ctx, "negocio-principal", &waxum.PairCodeRequest{
    PhoneNumber:         "+18095551234",
    ShowPushNotification: waxum.Ptr(true),
})
if err != nil {
    log.Fatal(err)
}
fmt.Println(pair.Code)
```

## Enviar texto

```go
message, _, err := client.Messages.SendText(ctx, "negocio-principal", &waxum.SendTextRequest{
    To:   "18095551234",
    Text: "Hola desde WAXUM y Go",
})
```

También puedes construir un JID de usuario:

```go
jid := waxum.UserJID("+1 (809) 555-1234")
```

## Enviar imagen desde URL

```go
message, _, err := client.Messages.SendImage(ctx, "negocio-principal", &waxum.SendImageRequest{
    To:      "18095551234",
    Image:   waxum.MediaFromURL("https://example.com/producto.jpg"),
    Caption: waxum.Ptr("Producto disponible"),
})
```

## Subir un archivo a WAXUM

El OpenAPI actual no documenta el cuerpo multipart de `media/upload`, por lo que el SDK incorpora una implementación manual basada en la documentación oficial.

```go
file, err := os.Open("factura.pdf")
if err != nil {
    log.Fatal(err)
}
defer file.Close()

mediaType := waxum.MediaTypeDocument
uploaded, _, err := client.Media.Upload(ctx, "negocio-principal", waxum.UploadMediaRequest{
    Filename:  "factura.pdf",
    Reader:    file,
    MediaType: &mediaType,
    MIMEType:  "application/pdf",
})
```

El resultado contiene `URL`, `DirectPath`, `MediaKey`, hashes y longitud, que pueden reutilizarse en mensajes.

## Webhooks y firma HMAC

```go
func webhookHandler(w http.ResponseWriter, r *http.Request) {
    event, _, err := waxum.ParseWebhookRequest(r, os.Getenv("WAXUM_WEBHOOK_SECRET"), 8<<20)
    if err != nil {
        http.Error(w, "firma o payload inválido", http.StatusUnauthorized)
        return
    }

    log.Printf("sesión=%s evento=%s", event.SessionID, event.Event)
    w.WriteHeader(http.StatusOK)
}
```

WAXUM envía la firma en `X-Webhook-Signature` con el formato `sha256=<hex>`.

## Manejo de errores

```go
result, response, err := client.Sessions.Get(ctx, "sesion-inexistente")
if err != nil {
    var apiErr *waxum.APIError
    if errors.As(err, &apiErr) {
        log.Printf(
            "status=%d code=%s message=%s request_id=%s",
            apiErr.StatusCode,
            apiErr.Code,
            apiErr.Message,
            apiErr.RequestID,
        )
    }
    return
}
_ = result
_ = response
```

También puedes usar:

```go
if waxum.IsStatus(err, http.StatusNotFound) {
    // manejar 404
}
```

## Timeout y cliente HTTP personalizado

```go
transport := &http.Transport{
    MaxIdleConns:        100,
    MaxIdleConnsPerHost: 20,
    IdleConnTimeout:     90 * time.Second,
}

client, err := waxum.NewClient(
    token,
    waxum.WithBaseURL(baseURL),
    waxum.WithHTTPClient(&http.Client{
        Transport: transport,
        Timeout:   30 * time.Second,
    }),
)
```

## Reintentos

Los reintentos están desactivados de forma efectiva por defecto (`MaxAttempts: 1`). Al habilitarlos, el SDK solo reintenta métodos idempotentes salvo que se indique expresamente lo contrario.

```go
client, err := waxum.NewClient(
    token,
    waxum.WithBaseURL(baseURL),
    waxum.WithRetry(waxum.RetryConfig{
        MaxAttempts:    3,
        InitialBackoff: 250 * time.Millisecond,
        MaxBackoff:     3 * time.Second,
    }),
)
```

No actives `RetryUnsafeMethods` sin implementar idempotencia en tu aplicación, porque repetir un `POST` puede duplicar mensajes o acciones.

## Endpoints no generados todavía

Para una ruta nueva de WAXUM que aún no aparezca en el OpenAPI:

```go
var output map[string]any
_, err := client.Raw(ctx, http.MethodGet, "/api/v1/nueva-ruta", nil, &output)
```

## Descarga de grabaciones de llamada

```go
wav, _, err := client.Calls.DownloadCallRecording(ctx, sessionID, callID)
if err != nil {
    log.Fatal(err)
}
if err := os.WriteFile("grabacion.wav", wav, 0o600); err != nil {
    log.Fatal(err)
}
```

## Estructura

```text
.
├── client.go                 Cliente HTTP, opciones, errores y reintentos
├── *_generated.go            Servicios generados por dominio
├── models_generated.go       Modelos y enumeraciones tipadas
├── media.go                  Carga multipart
├── webhook.go                Verificación y parsing de webhooks
├── raw_helpers.go            Helpers documentados fuera del OpenAPI
├── examples/                 Ejemplos ejecutables
├── docs/ENDPOINTS.md         Tabla completa de métodos y rutas
├── openapi/                  Contrato usado para generar el SDK
└── tools/generate_sdk.py     Generador reproducible
```

## Regenerar

Después de sustituir `openapi/waxum.openapi.json` por una versión nueva:

```bash
go generate ./...
gofmt -w .
go test ./...
```

Los archivos `*_generated.go` y `models_generated.go` se regeneran. Los archivos manuales no se sobrescriben.

## Pruebas

```bash
go test ./...
go vet ./...
```

## Referencia completa

Consulta [`docs/ENDPOINTS.md`](docs/ENDPOINTS.md) para ver los métodos del SDK, verbo HTTP, endpoint y `operationId` correspondiente.

## Licencia

MIT. Este SDK no es un producto oficial de WhatsApp ni de Meta. Su uso debe respetar las condiciones del servicio aplicables y la normativa correspondiente.
