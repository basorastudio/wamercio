# Despliegue WAMERCIO 2.5.6 en Dokploy

## ENV

Conserva el ENV actual y confirma:

```env
APP_URL=https://wamercio.com
NEXT_PUBLIC_APP_URL=https://wamercio.com
PLATFORM_DOMAIN=wamercio.com
TENANT_ROOT_DOMAIN=ltd.do
CUSTOM_DOMAIN_CNAME_TARGET=domains.ltd.do
```

No se añade ninguna variable nueva en 2.5.6.

## DNS

Mantén el wildcard `*.ltd.do` apuntando al servidor/Dokploy. WAMERCIO continúa publicando routers exactos por tienda mediante `domain-router`.

## Actualización

1. Sustituye el código por WAMERCIO 2.5.6.
2. Conserva PostgreSQL, Redis y uploads; no uses **Fresh Volumes**.
3. Ejecuta **Rebuild** y después **Redeploy**.
4. Abre una tienda, por ejemplo `https://pizzeria-juan.ltd.do`.

## Qué debes observar

- agregar un producto no abre automáticamente el carrito: el cliente permanece en el catálogo y recibe una confirmación breve;
- una tarjeta muestra cuánto de ese producto ya está en el pedido;
- al abrir un producto ya agregado una sola vez, WAMERCIO recupera su configuración y permite **Actualizar mi pedido**;
- desde el carrito, **Editar** abre la misma ficha del producto y regresa al carrito al guardar/cerrar;
- productos con variantes o adicionales pueden usar **Agregar otra combinación**;
- los productos con **Vender por libra** permiten indicar peso y, si está habilitado, comprar por monto;
- en escritorio el carrito sigue siendo un panel estructural y en móvil/tablet conserva su superficie modal;
- `wamercio.com` sigue siendo exclusivamente plataforma/backoffice y `*.ltd.do` sigue siendo tiendas.
