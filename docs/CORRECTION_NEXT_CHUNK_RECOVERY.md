# Recuperación de chunks de Next.js después de despliegues

## Problema corregido

El navegador podía conservar un `index.html` o un service worker de una versión anterior mientras Dokploy/Docker Compose ya servía una imagen nueva. Ese documento solicitaba un archivo como:

```text
/_next/static/chunks/app/page-<hash-anterior>.js
```

Como los chunks de Next.js son inmutables y cambian de hash en cada compilación, el archivo anterior devolvía `404`, produciendo `ChunkLoadError`, una pantalla en blanco y el error secundario de hidratación de React.

Durante actualizaciones progresivas con más de una réplica también podía mezclarse el HTML de una tarea con los chunks de otra.

## Solución

- El dominio SaaS ya no registra el service worker destinado a las tiendas tenant.
- El service worker no guarda `/` ni documentos HTML.
- Las navegaciones usan red y una página `offline.html` estable como contingencia.
- Los chunks se conservan en una caché de assets independiente y segura por hash.
- `index.html` se entrega con `no-store` tanto para navegador como para CDN/Cloudflare.
- Nginx devuelve `chunk-recovery.js` cuando falta un chunk JavaScript.
- `runtime-recovery.js` detecta `ChunkLoadError`, limpia service workers/cachés obsoletos y recarga una sola vez con invalidación de caché.
- Traefik utiliza afinidad por cookie para evitar mezclar réplicas frontend durante una actualización.

## Archivos principales

```text
frontend/public/runtime-recovery.js
frontend/public/chunk-recovery.js
frontend/public/offline.html
frontend/public/sw.js
frontend/app/layout.tsx
frontend/deploy/nginx/default.conf
frontend/src/components/DynamicPWA.tsx
docker-compose.yml
```

## Despliegue

Reconstruir la imagen frontend sin reutilizar una imagen antigua y redesplegar el servicio. Después del primer acceso, la aplicación limpia automáticamente el service worker anterior y puede recargar una vez.

Si Cloudflare tiene una regla personalizada **Cache Everything**, debe excluir documentos HTML, `/sw.js`, `/runtime-recovery.js` y `/chunk-recovery.js`. Los encabezados de origen ya incluyen `Cloudflare-CDN-Cache-Control: no-store`.
