# Despliegue WAMERCIO 2.5.4 en Dokploy

## ENV

Conserva el ENV actual y confirma:

```env
APP_URL=https://wamercio.com
NEXT_PUBLIC_APP_URL=https://wamercio.com
PLATFORM_DOMAIN=wamercio.com
TENANT_ROOT_DOMAIN=ltd.do
CUSTOM_DOMAIN_CNAME_TARGET=domains.ltd.do
```

No se añade ninguna variable nueva en 2.5.4.

## DNS

Mantén el registro wildcard `*.ltd.do` apuntando al servidor/Dokploy. El wildcard es DNS; WAMERCIO publica en Traefik routers exactos para cada tienda activa.

## Actualización

1. Sustituye el código por WAMERCIO 2.5.4.
2. Conserva PostgreSQL, Redis y uploads; no uses Fresh Volumes.
3. Ejecuta **Rebuild** y después **Redeploy**.
4. Espera unos segundos a que `domain-router` lea las tiendas activas y escriba `/etc/dokploy/traefik/dynamic/wamercio-store-hosts.yml`.
5. Abre `https://pizzeria-juan.ltd.do`.

## Qué debes observar

- `pizzeria-juan.ltd.do` deja de caer en el 404 por ausencia de router.
- El router HTTPS exacto solicita/usa certificado mediante `letsencrypt`.
- `wamercio.com` continúa siendo exclusivamente plataforma y backoffice.
- `proyecto.ltd.do`, `geo.ltd.do`, `id.ltd.do`, `waxum.ltd.do`, `domains.ltd.do` y `cliente.ltd.do` continúan reservados.
- Los dominios personalizados activos siguen apuntando al mismo `wamercio-gateway`.
