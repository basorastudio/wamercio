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

Esta entrega conserva las migraciones anteriores e incorpora `000026_business_capabilities_coherence` y `000027_quote_customer_metrics`. La primera reconcilia las capacidades de cada tipo de negocio con `business_engine` + `template_config`; la segunda corrige métricas históricas para que las solicitudes de cotización no se contabilicen como compras, clientes o ingresos. Durante el redeploy deja que la API ejecute todas las migraciones pendientes en orden antes de validar la plataforma.

Después del despliegue comprueba:


- en **Ajustes → Conexión**: configura **Manual / Automática**, fecha desde/hasta y prueba **Sincronizar ahora**;
- en **Ventas y entrega**: activa **Mesas y reservas**, crea al menos una mesa y valida capacidad;
- en una tienda: selecciona **Mesa**, fecha/hora, personas y mesa antes de confirmar;
- en **Punto de Venta**: abre una tarjeta de producto, elige variantes/adicionales y prueba **Buscar cliente**.
- en móvil: navegación **Catálogo / Mi compra / Pedidos / WhatsApp**;
- en **Mi compra**: al elegir **Delivery + Efectivo** aparece **¿Necesita cambio?**;
- al elegir **Sí**, se muestran montos sugeridos, **Otro** y el **Vuelto estimado**;
- en **Pedidos** y **Entregas**, el negocio puede ver si el cliente necesita cambio y con cuánto pagará.

- en **SuperAdmin → Configuración → Tipos de negocio**: valida que variantes, adicionales, inventario, Delivery, Recoger, Mesa, citas, cotización y campos de checkout respondan a la plantilla;
- prueba al menos un negocio de producto, uno de comida y uno de servicio/cotización para confirmar que cada uno muestra solamente las funciones que le corresponden;
- crea una **solicitud de cotización** y confirma que no exige pago inicial ni aumenta compras/ingresos hasta convertirse en una operación real;
- en **Pedidos y solicitudes** y **Actividad reciente**, confirma que Pedido / Reserva / Solicitud aparecen con su contexto correcto.

## Actualización

1. Sustituye el código por WAMERCIO 2.5.8.
2. Conserva PostgreSQL, Redis y uploads; no uses **Fresh Volumes**.
3. Ejecuta **Rebuild** y después **Redeploy**.
4. Abre una tienda, por ejemplo `https://pizzeria-juan.ltd.do`.

## Qué debes observar

- agregar un producto no abre automáticamente el carrito: el cliente permanece en el catálogo y recibe una confirmación breve;
- una tarjeta muestra cuánto de ese producto ya está en el pedido;
- al abrir un producto ya agregado una sola vez, WAMERCIO recupera su configuración y permite **Actualizar mi compra**;
- desde el carrito, **Editar** abre la misma ficha del producto y regresa al carrito al guardar/cerrar;
- productos con variantes o adicionales pueden usar **Agregar otra combinación**;
- los productos con **Vender por libra** permiten indicar peso y, si está habilitado, comprar por monto;
- el carrito funciona como una página completa: productos a la izquierda y checkout a la derecha en escritorio, con flujo vertical en móvil;
- `wamercio.com` sigue siendo exclusivamente plataforma/backoffice y `*.ltd.do` sigue siendo tiendas.

## Actualización 2.5.8 · URL compacta y acceso unificado

Esta revisión agrega la migración `000028_compact_store_urls_unified_access`.
Los negocios nuevos usan identificadores compactos sin separadores (por ejemplo `Pizzería Demo` → `pizzeriademo`) y la cabecera pública utiliza una sola acción `ACCESO` para iniciar sesión o registrarse según corresponda.
Los slugs de negocios ya existentes no se renombran automáticamente para no romper enlaces previamente compartidos.

## Hotfix de ruta dinámica compacta (Next.js)

Antes de subir esta versión sobre un repositorio existente, elimina por completo la ruta obsoleta:

```text
apps/web/app/[storeSlug]/
```

La única ruta dinámica raíz válida debe ser:

```text
apps/web/app/[slug]/page.tsx
```

Next.js no permite dos segmentos dinámicos distintos para la misma profundidad (`[slug]` y `[storeSlug]`). Si ambos permanecen en Git, el `next build` falla con `You cannot use different slug names for the same dynamic path`.

Después de reemplazar los archivos ejecuta:

```bash
git rm -r --ignore-unmatch 'apps/web/app/[storeSlug]'
git add -A
git commit -m "fix: canonical compact store route"
git push
```

Luego realiza Rebuild + Redeploy en Dokploy.

## Revisión POS / WhatsApp / Gestión de mesas

No requiere migraciones ni variables de entorno adicionales.

Después del Rebuild + Redeploy valida:

- **Punto de Venta**: el rail **Venta actual** comienza en la línea superior de la cabecera y permanece fijo hasta el pie; en un escritorio amplio verifica 5 columnas con el menú desplegado y 6 con el menú plegado.
- **WhatsApp**: la cabecera genérica ya no aparece; abre un chat y prueba el menú `⋮` con Vaciar, Exportar, Cerrar, Bloquear y Eliminar.
- **Configuración → Ventas y entrega**: activa **Mesas y reservas** y guarda los cambios.
- Confirma que aparezca **Gestión de mesas** en el grupo Gestión de la barra lateral y crea una mesa de prueba.
