# Corrección Dokploy: API `unhealthy` después de compilar

## Síntoma

El backend Go y el frontend Next.js compilan correctamente. PostgreSQL y Redis llegan a `Healthy`, pero el contenedor `api` pasa a `unhealthy` y `web` no inicia porque depende de `api: condition: service_healthy`.

## Causa encontrada

La migración `007_wamercio_brand.sql` apuntaba por error a una tabla inexistente:

```sql
UPDATE platform_settings ...
```

La tabla correcta fue creada en `003_admin_and_operations.sql` como:

```sql
system_settings
```

En una base nueva, las migraciones 001–006 se aplicaban y la 007 fallaba dentro de su transacción. El proceso Go finalizaba antes de ejecutar `http.ListenAndServe(:8080)`, por lo que el healthcheck no tenía ningún servidor al cual conectarse.

## Corrección aplicada

`007_wamercio_brand.sql` ahora es idempotente y usa la tabla correcta:

```sql
INSERT INTO system_settings(key, value, updated_at)
VALUES ('platform_name', 'wamercio', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;
```

La transacción fallida de la versión anterior no pudo registrar `007_wamercio_brand.sql` en `schema_migrations`, por lo que en el siguiente arranque la migración corregida se ejecutará automáticamente. No es necesario borrar la base de datos ni los volúmenes.

## Diagnóstico de arranque mejorado

El API ahora escribe en logs:

- `postgresql listo`
- `migraciones aplicadas correctamente`
- `redis listo`
- `wamercio escuchando en :8080`

El comando interno de healthcheck también usa timeout de 2 segundos y cierra correctamente la respuesta HTTP.

## Qué hacer en Dokploy

1. Subir estos cambios a la rama `main`.
2. No borrar `postgres_data`, `redis_data` ni `media_data`.
3. Pulsar `Redeploy`.
4. Verificar el log del contenedor `api`.

El arranque esperado es:

```text
postgresql listo
migraciones aplicadas correctamente
redis listo
wamercio escuchando en :8080
```

Después el healthcheck del API debe pasar y Dokploy podrá iniciar `web`.

## Si todavía quedara `unhealthy`

Revisar el log **del contenedor API**, no solo el log de build. Las validaciones de arranque más importantes son:

- `DATABASE_URL` debe existir y apuntar a `postgres:5432` dentro del Compose.
- `JWT_SECRET` debe tener al menos 32 caracteres.
- Si `SEED_DEMO=true`, `DEMO_ADMIN_PASSWORD` es obligatorio.

La versión corregida registra claramente cuál de estas etapas falla.
