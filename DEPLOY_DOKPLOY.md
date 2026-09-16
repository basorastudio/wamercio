# Despliegue WAMERCIO 2.8.4 en Dokploy

## Personalización pública por negocio

Esta versión sustituye **2.8.2** y no añade migraciones ni variables de entorno. Conserva PostgreSQL, Redis, uploads y las migraciones `000032`/`000033` existentes.

1. Reemplaza el código anterior por **WAMERCIO 2.8.4** y conserva todos los volúmenes actuales. **No uses Fresh Volumes.**
2. Ejecuta `sh scripts/verify-2.8.4.sh`.
3. Sube el código al repositorio y deja que el CI ejecute `npm run build`, `go test ./...`, `go build ./...` y validación de Compose.
4. En Dokploy usa **Rebuild + Redeploy**.
5. Después del despliegue abre una tienda en ventana privada y verifica: título de pestaña = nombre del negocio, favicon/logo del negocio, color del navegador = color primario, instalación PWA con nombre/logo del negocio y búsqueda móvil contraída.
6. En **Configuración → Mi negocio** prueba ocultar un elemento de portada, arrastrar otro, guardar, recargar y confirmar que la tienda pública conserva posición y visibilidad.

El Service Worker cambia a `wamercio-store-v2.8.3-*` y deja de precachear el manifest/iconos globales, por lo que una visita nueva no arrastra la identidad PWA de la plataforma. Si el dispositivo ya tenía instalada una PWA anterior, desinstálala una vez y vuelve a instalarla para comprobar inmediatamente el nuevo nombre/icono; Chromium también actualiza manifests instalados de forma periódica.

---

# Despliegue WAMERCIO 2.8.2 en Dokploy

## Hotfix 2.8.2 · Compilación frontend TypeScript

Esta versión sustituye **2.8.1**. El API ya compila correctamente; 2.8.2 corrige el siguiente bloqueo detectado por Dokploy en `npm run build`: el updater de `setLoyalty` usaba un estado `any`, por lo que TypeScript `strict` marcaba el parámetro como `implicit any`.

1. Reemplaza el código 2.8.1 por **WAMERCIO 2.8.2**.
2. Conserva PostgreSQL, Redis, uploads y todas las variables de entorno. **No uses Fresh Volumes.**
3. Ejecuta `sh scripts/verify-2.8.2.sh`.
4. Sube el código a GitHub y confirma que el workflow **WAMERCIO CI** complete Frontend, Go API, WhatsApp bridge y Docker compose validation.
5. En Dokploy ejecuta **Rebuild + Redeploy**. No hay migraciones nuevas: `000032` y `000033` continúan siendo las últimas.

La corrección no desactiva `strict`, no añade `skip` de compilación y no oculta errores: tipa explícitamente el estado de fidelización y la respuesta de `/customer/loyalty`.

---

# Despliegue WAMERCIO 2.8.1 en Dokploy

## Hotfix 2.8.1 · Compilación API pgx

Esta versión sustituye **2.8.0** para despliegues nuevos. Corrige el fallo de compilación del API causado por cuatro asignaciones inválidas de `RowsAffected()` en KDS y Fidelización. No agrega migraciones ni variables de entorno.

1. Reemplaza el código 2.8.0 por **WAMERCIO 2.8.1**.
2. Conserva PostgreSQL, Redis, uploads y todas las variables de entorno actuales. No uses **Fresh Volumes**.
3. Ejecuta primero `sh scripts/verify-2.8.1.sh`.
4. Confirma que el CI de GitHub complete **Frontend**, **Go API**, **WhatsApp bridge** y **Docker compose validation** antes de desplegar.
5. En Dokploy ejecuta **Rebuild + Redeploy**. Las migraciones `000032` y `000033` siguen siendo las últimas y no se vuelven a crear.

El Dockerfile del API continúa compilando con `go build -mod=readonly`; el hotfix usa la firma correcta `res.RowsAffected() == 0`.

---

# Despliegue WAMERCIO 2.8.0 en Dokploy

## Actualización 2.8.0 · Operación avanzada y crecimiento

1. Sustituye el código por **WAMERCIO 2.8.0** conservando las variables de entorno actuales.
2. Despliega/reconstruye la **API primero** para que ejecute, en orden, `000032_phase2_operations` y `000033_phase3_growth_experience`. Ambas migraciones son aditivas y conservan productos, extras, imágenes, pedidos, reservas y QR existentes.
3. Despliega la web después de la API. El Service Worker usa `wamercio-store-v2.8.0-*`, por lo que la PWA invalida el caché anterior.
4. No se requieren variables de entorno obligatorias nuevas para Fase 2/3.

Después del despliegue valida: **Atributos/Modificadores**, **Automatizaciones**, **Analítica**, **Reseñas**, **Fidelización**, estaciones de **KDS** y **Gestión de mesas → Diseñar QR**. En una mesa de prueba verifica tanto **Personalizar esta mesa** como **Usar diseño general**.

Antes de publicar puedes ejecutar:

```bash
sh scripts/verify-2.8.0.sh
```

> Si tu entorno compila los servicios Go, utiliza la toolchain declarada por cada `go.mod`. El verificador estático no reduce ni modifica esas versiones.

---

## Actualización 2.6.0 · Comercio inteligente

1. Sustituye el código por WAMERCIO 2.6.0 y conserva las variables de entorno actuales.
2. Despliega primero la API para que `golang-migrate` aplique `000031_promotions_phase1`.
3. Despliega la web después de la API. El Service Worker usa el caché `wamercio-store-v2.6.0-*`, por lo que la PWA invalida la versión anterior.
4. Verifica en una tienda de prueba: Cupones, Promociones, Analítica y un checkout con descuento.
5. Para un negocio con `dine_in_enabled=true`, verifica Reservaciones, QR por mesa y KDS.

**No se añaden variables de entorno ni dependencias nuevas en 2.6.0.**


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

## Revisión 2.5.8 · Áreas de mesas y pagos por modalidad

Esta revisión incorpora la migración `000030_table_areas_payment_rules`. Durante el **Rebuild + Redeploy**, permite que la API ejecute todas las migraciones pendientes antes de abrir el panel. No se agregan variables de entorno.

Después del despliegue valida:

- en **Gestión de mesas**, crea primero un **Área** (por ejemplo, Salón principal) y luego crea varias mesas seleccionando esa área;
- refresca el navegador con **Mesas y reservas** activo y confirma que **Gestión de mesas** no desaparece/reaparece en la barra lateral;
- en **Métodos de pago**, abre **Disponibilidad por modalidad** y configura combinaciones distintas para **Delivery / Recoger / Mesa**;
- en la tienda pública, cambia entre modalidades y confirma que solo se muestran los métodos permitidos para la modalidad elegida;
- intenta confirmar un pedido con una combinación no permitida y confirma que la API la rechaza o selecciona únicamente un método permitido;
- verifica que las mesas anteriores sigan disponibles dentro de **Área principal** y que las reservas existentes se conserven.


## Migración 2.8.4

El API aplicará `000034_whatsapp_registered_customer_identity` al iniciar. Esta migración:

1. elimina conversaciones que correspondan al propio número/JID de la sesión WhatsApp del negocio;
2. crea o enlaza la relación local de tienda para clientes globales registrados cuyo WhatsApp ya aparece en una conversación;
3. enlaza esas conversaciones como `customer_id` sin crear pedidos ni alterar `order_count`/`total_spent`.

No requiere nuevas variables de entorno ni reiniciar volúmenes.

