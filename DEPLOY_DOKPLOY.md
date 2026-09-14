# Despliegue WAMERCIO 2.5.5 en Dokploy

## ENV

Conserva el ENV actual y confirma:

```env
APP_URL=https://wamercio.com
NEXT_PUBLIC_APP_URL=https://wamercio.com
PLATFORM_DOMAIN=wamercio.com
TENANT_ROOT_DOMAIN=ltd.do
CUSTOM_DOMAIN_CNAME_TARGET=domains.ltd.do
```

No se añade ninguna variable nueva en 2.5.5.

## DNS

Mantén el wildcard `*.ltd.do` apuntando al servidor/Dokploy. WAMERCIO continúa publicando routers exactos por tienda mediante `domain-router`.

## Actualización

1. Sustituye el código por WAMERCIO 2.5.5.
2. Conserva PostgreSQL, Redis y uploads; no uses **Fresh Volumes**.
3. Ejecuta **Rebuild** y después **Redeploy**.
4. Abre una tienda, por ejemplo `https://pizzeria-juan.ltd.do`.

## Qué debes observar

- al completar un WhatsApp válido, el modal avanza solo a PIN o registro;
- la búsqueda está en el header y sus resultados no filtran las tarjetas del catálogo;
- seleccionar un resultado abre la ficha del producto;
- la dirección del negocio ya no aparece en la barra superior;
- en escritorio, abrir **Mi pedido** reduce el espacio del catálogo y coloca el carrito a la derecha sin bloquear la tienda;
- en móvil/tablet, el carrito continúa usando una superficie modal adecuada al dispositivo;
- `wamercio.com` sigue siendo exclusivamente plataforma/backoffice y `*.ltd.do` sigue siendo tiendas.
