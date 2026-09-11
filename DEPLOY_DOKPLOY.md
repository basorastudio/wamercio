# Despliegue de WAMERCIO en Dokploy

Esta entrega está preparada para **Docker Compose**. En Dokploy usa el tipo **Docker Compose**, no Docker Stack, porque el proyecto construye las imágenes `web`, `api` y `whatsapp` desde el código fuente.

## 1. Requisitos

- VPS con Dokploy funcionando.
- Dominio o subdominio apuntando por DNS tipo `A` a la IP del VPS.
- Repositorio Git privado o público que contenga el contenido de este ZIP.
- Puertos 80/443 libres para Traefik/Dokploy.

## 2. Subir el proyecto a Git

Descomprime el ZIP y, dentro de la carpeta `WAMERCIO`:

```bash
git init
git add .
git commit -m "WAMERCIO inicial"
git branch -M main
git remote add origin TU_REPOSITORIO_GIT
git push -u origin main
```

**No subas `.env`.** El repositorio ya ignora ese archivo.

## 3. Crear el proyecto en Dokploy

1. Crea un **Project** nuevo, por ejemplo `WAMERCIO`.
2. Dentro del proyecto, crea un servicio **Compose**.
3. Selecciona **Docker Compose**.
4. Conecta GitHub/Git o el proveedor donde subiste el proyecto.
5. Selecciona la rama `main`.
6. Compose Path: `./docker-compose.yml`.

## 4. Variables de entorno

En **Environment** agrega, como mínimo:

```dotenv
POSTGRES_DB=wamercio
POSTGRES_USER=wamercio
POSTGRES_PASSWORD=CAMBIA_ESTA_PASSWORD
DATABASE_URL=postgres://wamercio:CAMBIA_ESTA_PASSWORD@postgres:5432/wamercio?sslmode=disable
REDIS_URL=redis://redis:6379/0

JWT_SECRET=GENERA_UN_SECRETO_LARGO
INTERNAL_WEBHOOK_SECRET=GENERA_OTRO_SECRETO_LARGO

ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASSWORD=CAMBIA_ESTA_PASSWORD_ADMIN
ADMIN_NAME=Administrador WAMERCIO

APP_URL=https://app.tudominio.com
NEXT_PUBLIC_APP_URL=https://app.tudominio.com
INTERNAL_API_URL=http://api:8080
API_PUBLIC_URL=https://app.tudominio.com

WHATSAPP_BRIDGE_URL=http://whatsapp:8090
WHATSAPP_DATABASE_URL=postgres://wamercio:CAMBIA_ESTA_PASSWORD@postgres:5432/wamercio?sslmode=disable
CORE_WEBHOOK_URL=http://api:8080

TZ=America/Santo_Domingo
```

Puedes generar secretos desde Linux con:

```bash
openssl rand -base64 48
```

Genera uno distinto para `JWT_SECRET` y otro para `INTERNAL_WEBHOOK_SECRET`.

El `docker-compose.yml` ya referencia las variables con `${VARIABLE}`, por lo que Dokploy puede interpolarlas directamente.

## 5. Desplegar

Pulsa **Deploy**.

Dokploy construirá:

- `web` → Next.js, puerto interno `3000`
- `api` → Go, puerto interno `8080`
- `whatsapp` → Go/whatsmeow, puerto interno `8090`
- `postgres` → PostgreSQL 16
- `redis` → Redis 7

Las migraciones SQL se ejecutan automáticamente al arrancar el API.

El primer arranque crea automáticamente el administrador definido en `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

## 6. Configurar el dominio

En el servicio Compose entra a **Domains** y agrega el dominio al servicio:

- **Service:** `web`
- **Container Port:** `3000`
- **Domain:** `app.tudominio.com`
- **HTTPS:** habilitado

No agregues dominios públicos a `api`, `whatsapp`, `postgres` ni `redis`.

WAMERCIO usa el frontend como reverse proxy interno para `/api/*` y `/media/*`, por lo que solo hace falta publicar `web`.

Después de modificar un dominio en un Compose de Dokploy, vuelve a desplegar para que Traefik lea la configuración actualizada.

## 7. DNS

En tu proveedor DNS crea:

```text
Tipo: A
Nombre: app
Valor: IP_DE_TU_VPS
Proxy: según tu configuración de Cloudflare
```

Si utilizas Cloudflare y encuentras problemas iniciales con certificados, prueba primero en modo DNS only hasta verificar HTTPS.

## 8. Verificación

Comprueba estas rutas:

```text
https://app.tudominio.com/login
https://app.tudominio.com/register
https://app.tudominio.com/health
```

Inicia sesión con el administrador configurado en las variables de entorno.

Luego verifica este flujo:

1. Crear tienda.
2. Crear categoría.
3. Crear producto.
4. Crear zona de delivery.
5. Abrir `https://app.tudominio.com/store/SLUG`.
6. Hacer un pedido de prueba.
7. Confirmar que aparece en **Pedidos**.
8. Ir a **WhatsApp** y generar QR.
9. En el teléfono: WhatsApp → Dispositivos vinculados → Vincular dispositivo.
10. Escanear QR.
11. Enviar un mensaje al número vinculado y comprobar **Conversaciones**.

## 9. Datos persistentes

El Compose usa volúmenes nombrados:

```text
postgres_data
redis_data
uploads_data
```

No los elimines al actualizar la aplicación.

Para una actualización normal usa **Redeploy**; no ejecutes `docker compose down -v` porque `-v` elimina los volúmenes.

## 10. Backups recomendados

Prioridad:

1. `postgres_data`
2. `uploads_data`

Redis puede reconstruirse y tiene menor prioridad.

Configura backups periódicos desde Dokploy o mediante `pg_dump` hacia almacenamiento externo/R2.

Ejemplo manual:

```bash
docker exec POSTGRES_CONTAINER pg_dump -U wamercio wamercio > wamercio.sql
```

## 11. Logs útiles

En Dokploy revisa por servicio:

- `web`: errores de Next.js/proxy.
- `api`: migraciones, PostgreSQL, checkout y autenticación.
- `whatsapp`: conexión websocket, QR y eventos de WhatsApp.
- `postgres`: salud de la base de datos.

## 12. Problemas habituales

### El frontend abre pero el API falla

Verifica:

```dotenv
INTERNAL_API_URL=http://api:8080
```

### WhatsApp muestra “motor no disponible”

Verifica:

```dotenv
WHATSAPP_BRIDGE_URL=http://whatsapp:8090
CORE_WEBHOOK_URL=http://api:8080
INTERNAL_WEBHOOK_SECRET=...
```

El secreto debe ser idéntico en `api` y `whatsapp`.

### El QR no aparece

Revisa los logs del servicio `whatsapp`. El VPS necesita salida HTTPS/WebSocket hacia los servidores de WhatsApp.

### Un Redeploy pierde imágenes

Las imágenes deben permanecer en `uploads_data`. Confirma que no se eliminó el volumen.

## 13. Arquitectura pública recomendada

```text
Internet
   │
   ▼
Dokploy / Traefik
   │ HTTPS
   ▼
web :3000
   │
   ├── /api/*   ─────► api :8080
   │                   │
   │                   ├── PostgreSQL
   │                   ├── Redis
   │                   └── whatsapp :8090
   │
   └── /store/{slug}
```

Solo `web` queda expuesto a Internet.

## Nota sobre Go y whatsmeow

La imagen de compilación de `api` y `whatsapp` está fijada en `golang:1.27.1-alpine`.
No reduzcas el bridge a Go 1.23: la versión actual fijada de `whatsmeow` exige Go 1.26+.
Después de actualizar desde 1.0.0-mvp, usa **Redeploy / Rebuild** en Dokploy para invalidar
la capa anterior del builder.

## Nota de build Go 1.0.2

Los servicios `api` y `whatsapp` ejecutan `go mod tidy` dentro de la etapa builder antes de compilar. Esto genera/verifica automáticamente `go.sum` en el contenedor de build y evita fallos de Dokploy por sumas de módulos ausentes. Los builders usan Go 1.27.1, compatible con la versión fijada de `whatsmeow` que requiere Go 1.26 o superior.


## Solución a `404 page not found`

Un `404 page not found` en texto plano después de un build correcto normalmente es la respuesta por defecto de Traefik: el dominio llega al servidor pero no coincide con un router activo.

- Servicio: `web`
- Host: `wamercio.com`
- Path: `/`
- Container Port: `3000`
- HTTPS: ON
- Certificate: Let's Encrypt

Después de guardar cualquier cambio en **Domains**, vuelve a desplegar el Compose. Esta versión conecta `web` explícitamente a `dokploy-network`. Usa **Preview Compose** para confirmar que Dokploy añadió las labels `traefik.http.routers.*` y `traefik.http.services.*` al servicio `web`.
