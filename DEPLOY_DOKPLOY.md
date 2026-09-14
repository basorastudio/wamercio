# Despliegue WAMERCIO 2.5.8 en Dokploy

## ENV

Conserva el ENV actual y confirma:

```env
APP_URL=https://wamercio.com
NEXT_PUBLIC_APP_URL=https://wamercio.com
PLATFORM_DOMAIN=wamercio.com
TENANT_ROOT_DOMAIN=ltd.do
CUSTOM_DOMAIN_CNAME_TARGET=domains.ltd.do
```

No se añade ninguna variable nueva en 2.5.8.

## DNS

Mantén el wildcard `*.ltd.do` apuntando al servidor/Dokploy. WAMERCIO continúa publicando routers exactos por tienda mediante `domain-router`.


## Cambio requerido en esta entrega

Esta versión añade la migración `000024_cash_change_checkout`, que incorpora la preferencia de cambio en efectivo a los pedidos. Durante el redeploy deja que la API ejecute las migraciones antes de validar el checkout.

Después del despliegue comprueba:

- en móvil: navegación **Catálogo / Mi pedido / Pedidos / WhatsApp**;
- en **Mi pedido**: al elegir **Delivery + Efectivo** aparece **¿Necesita cambio?**;
- al elegir **Sí**, se muestran montos sugeridos, **Otro** y el **Vuelto estimado**;
- en **Pedidos** y **Entregas**, el negocio puede ver si el cliente necesita cambio y con cuánto pagará.

## Actualización

1. Sustituye el código por WAMERCIO 2.5.8.
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
- el carrito funciona como una página completa: productos a la izquierda y checkout a la derecha en escritorio, con flujo vertical en móvil;
- `wamercio.com` sigue siendo exclusivamente plataforma/backoffice y `*.ltd.do` sigue siendo tiendas.
