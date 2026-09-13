# Corrección de bootstrap de plataforma y catálogo global

## Problemas corregidos

- Se evitó solicitar `/api/bootstrap` desde `wamercio.com` y las rutas de superadministración.
- La consulta de tenant permanece deshabilitada hasta que el navegador determine el dominio, la ruta y el tenant administrativo.
- El catálogo global ya no descarga todos los productos al iniciar el panel SaaS.
- Los productos se consultan bajo demanda por categoría, grupo, detalle o búsqueda, con páginas de 120 elementos.
- El backend limita por defecto respuestas accidentales del catálogo a 100 productos y devuelve el total filtrado.
- Nginx comprime JSON y archivos estáticos compatibles.
- El health check del frontend usa `/healthz`, sin registrar una solicitud a `/` cada diez segundos.

## Resultado esperado

El panel de superadministración abre sin el `404` de `/api/bootstrap`, sin transferir respuestas de catálogo de varios megabytes durante el inicio y sin advertencias de buffering temporal para la carga normal del catálogo.
