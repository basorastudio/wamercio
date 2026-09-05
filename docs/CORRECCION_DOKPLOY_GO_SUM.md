# Corrección Dokploy — `missing go.sum entry`

## Síntoma

Durante `docker compose ... up -d --build`, la imagen `api` fallaba en:

```text
RUN CGO_ENABLED=0 GOOS=linux go build ...
missing go.sum entry for module providing package ...
```

El fallo ocurre en la fase de build, antes de iniciar PostgreSQL, Redis o la aplicación.

## Causa

El repositorio fuente no contiene todavía un `go.sum` completo. El Dockerfile anterior ejecutaba `go mod download` antes de copiar el código fuente y luego compilaba en el modo de módulos por defecto. Con Go moderno esto puede dejar únicamente metadatos parciales de módulos y la compilación se niega a completar sumas faltantes.

## Corrección aplicada

`apps/api/Dockerfile` ahora:

1. descarga los módulos fijados en `go.mod` para aprovechar la caché de Docker;
2. copia el código fuente completo;
3. ejecuta `go mod tidy`, que resuelve el grafo real de imports y genera/completa `go.sum` dentro de la fase de build;
4. compila con `-mod=mod`, permitiendo a Go completar de forma segura cualquier suma requerida durante ese build.

También se eliminó `github.com/google/uuid` de `go.mod` porque no existe ningún import de ese módulo en el código actual.

## Archivos modificados

- `apps/api/Dockerfile`
- `apps/api/go.mod`
- `apps/api/.dockerignore`
- `apps/web/.dockerignore`

## Despliegue

Subir los cambios a la rama `main` del repositorio configurado en Dokploy y ejecutar **Redeploy**.

No es necesario borrar los volúmenes de PostgreSQL, Redis ni `media_data`.

## Recomendación adicional

En una máquina de desarrollo con acceso a `proxy.golang.org`, ejecutar:

```bash
cd apps/api
go mod tidy
go test ./...
git add go.mod go.sum
git commit -m "build: versionar dependencias Go"
```

Versionar el `go.sum` generado sigue siendo la práctica recomendada para builds reproducibles. La corrección del Dockerfile permite, además, que un export sin ese archivo no vuelva a bloquear Dokploy.
