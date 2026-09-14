# WAMERCIO 2.5.4

WAMERCIO es una plataforma dominicana de comercio conversacional, mobile-first, SPA + PWA y multi-tenant.

## Publicación

- Plataforma y administración: `https://wamercio.com`
- Tiendas: `https://{slug}.ltd.do`
- Dominios propios: host verificado por negocio

En 2.5.4 las tiendas se publican en Traefik mediante routers exactos generados desde PostgreSQL. `*.ltd.do` se utiliza como wildcard DNS, mientras cada tienda activa obtiene una regla `Host(...)` y TLS individual.

Consulta `DEPLOY_DOKPLOY.md` para el despliegue.
