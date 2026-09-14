# Despliegue WAMERCIO 2.5.1 en Dokploy

## Variables

Conserva el ENV existente y añade/confirma:

```env
APP_URL=https://wamercio.com
NEXT_PUBLIC_APP_URL=https://wamercio.com
PLATFORM_DOMAIN=wamercio.com
TENANT_ROOT_DOMAIN=ltd.do
CUSTOM_DOMAIN_CNAME_TARGET=domains.ltd.do
```

El DNS wildcard `*.ltd.do` debe apuntar al servidor de Dokploy. `ltd.do` ya es el dominio raíz reservado para los negocios.

## Actualización

1. Sustituye el código por WAMERCIO 2.5.1.
2. Conserva PostgreSQL, Redis y uploads; no uses Fresh Volumes.
3. Haz **Rebuild** y después **Redeploy**.
4. El API aplica la migración `000019_multitenant_domains`.
5. `traefik-config` instala los routers base y `domain-router` publica routers exactos para negocios y dominios propios.

## Pruebas recomendadas

1. Abre `wamercio.com` y confirma que muestra únicamente la plataforma central.
2. Abre `pizzeria-juan.ltd.do` y confirma que resuelve el negocio por Host.
3. Comprueba el menú inferior en móvil, carrito, acceso y panel del cliente.
4. Instala la PWA desde el subdominio y confirma que usa nombre/identidad del negocio.
5. En Configuración → Dominios agrega un dominio propio, configura el CNAME a `domains.ltd.do`, verifica y ábrelo por HTTPS.
6. Comprueba que `wamercio.com/dashboard` sigue siendo el panel central del comerciante.
7. Inicia sesión como cliente en un negocio `*.ltd.do` y comprueba que la sesión continúa en otro subdominio.
8. En un dominio personalizado prueba “Ya tengo sesión en WAMERCIO” y confirma el SSO mediante `cliente.ltd.do`.
