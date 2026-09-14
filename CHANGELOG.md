# WAMERCIO 2.5.4 — Routing exacto de tiendas `*.ltd.do`

## Corrección

- Las tiendas activas ya no dependen de un router Traefik `HostRegexp` genérico.
- `domain-router` consulta `stores.slug` y publica un router `Host(...)` exacto para cada `https://{slug}.ltd.do`.
- Cada router HTTPS usa `certResolver: letsencrypt`, permitiendo certificado TLS individual por tienda sin depender de un certificado wildcard del origen.
- Los dominios personalizados activos continúan publicándose por el mismo mecanismo exacto.
- Se elimina el router wildcard HTTP/HTTPS de la configuración base de Traefik; el wildcard se mantiene donde corresponde: DNS `*.ltd.do`.
- `domain-router` respeta los subdominios reservados configurados en Centro SaaS y nunca publica una tienda sobre `cliente.ltd.do`, `proyecto.ltd.do`, `geo.ltd.do`, etc.
- Se elimina automáticamente el archivo dinámico heredado `wamercio-custom-domains.yml` al publicar la nueva configuración `wamercio-store-hosts.yml`.

## Despliegue

No requiere migraciones ni variables nuevas. Conserva `TENANT_ROOT_DOMAIN=ltd.do`, el DNS wildcard `*.ltd.do` y realiza Rebuild + Redeploy.
