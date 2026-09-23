# WAMERCIO V4.4.0 — Operación diaria del negocio

## Objetivo

WAMERCIO V4.4.0 incorpora al panel de los negocios una capa operativa orientada a la jornada real de comercio: sucursales, caja/turnos, TPV avanzado, pedidos telefónicos y para recoger, catálogo/precios por sucursal, combos, promociones existentes aplicadas en TPV, cobros de delivery y liquidaciones de repartidores.

La implementación mantiene el lenguaje visual adoptado en WAMERCIO V4.2–V4.3: sidebar verde oscuro, fondo cálido, tarjetas compactas, jerarquía WACatelog-like, botones/inputs consistentes y navegación agrupada. No se copió código de la aplicación de referencia; se adaptaron sus conceptos operativos al stack y modelo multi-tenant de WAMERCIO.

## 1. Sucursales

Nueva sección: `Operación → Sucursales` (`/branches`).

Incluye:
- una sucursal principal automática por negocio;
- creación, edición, activación/desactivación y eliminación segura;
- nombre, código, dirección, territorio, teléfono, WhatsApp, horario y radio sugerido de delivery;
- regla de una única sucursal principal por negocio;
- protección contra eliminación de la principal o de sucursales con historial operativo;
- catálogo por sucursal mediante modal;
- disponibilidad por producto y precio local sobrescribible sin duplicar el producto maestro;
- contador de pedidos y estado de caja abierta por sucursal.

### Persistencia

- `store_branches`
- `store_branch_products`
- trigger `trg_wamercio_create_primary_branch`

Toda tienda existente recibe una sucursal `Principal` al aplicar la migración y toda tienda nueva la recibe automáticamente al crearse.

## 2. Caja y turnos

Nueva sección: `Ventas → Caja` (`/cash`).

Flujo:

`Abrir caja → operar → registrar movimientos → recibir liquidaciones → contar efectivo → cerrar → calcular diferencia`

Incluye:
- selección de sucursal;
- fondo inicial;
- una sola caja abierta por sucursal;
- ventas en efectivo enlazadas a la sesión;
- entradas de efectivo;
- retiros;
- gastos;
- reembolsos;
- liquidaciones de delivery;
- efectivo esperado calculado por backend;
- conteo final;
- diferencia positiva/negativa;
- historial de cierres y responsable de apertura/cierre.

Fórmula utilizada:

`Esperado = fondo inicial + ventas efectivo + entradas + liquidaciones - retiros - gastos - reembolsos`

### Persistencia

- `cash_sessions`
- `cash_movements`

## 3. TPV avanzado

La página `/pos` fue reconstruida para trabajar con el nuevo modelo operativo.

### Modos de venta

- **Presencial**: venta de mostrador, finaliza y cobra en el momento.
- **Teléfono**: registra un pedido pendiente; exige número de cliente.
- **Recoger**: registra un pedido pendiente para pickup.

### Funciones

- selección de sucursal;
- catálogo y disponibilidad específica de la sucursal;
- precio local por sucursal;
- búsqueda de cliente;
- creación/uso rápido de nombre y teléfono;
- caja obligatoria para cobrar en efectivo una venta presencial;
- variantes existentes;
- extras existentes;
- grupos de modificadores/opciones existentes con reglas min/max/obligatorias;
- composición de combos/bundles;
- promociones automáticas existentes aplicadas también al TPV;
- validación de stock;
- descuento de inventario del producto y de componentes de combo;
- creación del pedido con `branch_id` y `cash_session_id`;
- movimiento `sale_cash` automático para efectivo presencial.

Los pedidos telefónicos y para recoger pueden quedar pendientes para ser cobrados posteriormente, evitando obligar a abrir caja al momento de tomarlos.

## 4. Opciones, extras y modificadores

WAMERCIO ya disponía de variantes, extras y composición. V4.4.0 integra estas capacidades correctamente dentro del TPV avanzado y reorganiza la navegación como `Opciones y extras`.

La distinción operativa queda así:

- **Variantes**: SKU/inventario (por ejemplo talla/color).
- **Opciones y extras**: personalización de compra (tamaño, sabor, acompañante, queso extra, etc.).
- **Combos**: producto vendible formado por varios productos/componentes.

No se crea una segunda implementación paralela de modificadores.

## 5. Combos

Nueva sección: `Catálogo → Combos` (`/catalog/combos`).

Se reutiliza el modelo de productos + composición que ya existe en WAMERCIO. Un combo es un producto real marcado con `attributes.wamercio_combo=true`, con:
- nombre;
- descripción;
- imagen;
- precio;
- precio comparativo;
- estado;
- destacado;
- componentes y cantidades.

Al ser productos del catálogo normal, los combos quedan disponibles para storefront, WhatsApp y TPV sin mantener inventarios o catálogos paralelos.

## 6. Promociones programadas en TPV

No se creó un segundo módulo de promociones. El motor existente de promociones de WAMERCIO se reutiliza desde `createPOSSale` mediante `bestPromotionForCheckout`.

Por tanto una promoción válida puede afectar tanto el checkout público como la venta/pedido iniciado desde el panel.

## 7. Delivery: cobros y dinero en ruta

La sección `/delivery` fue ampliada con dos vistas operativas principales:

### Operación

- pedidos pendientes de preparar/asignar;
- asignación a repartidor;
- estados de entrega;
- cobro de la entrega;
- método de cobro;
- importe cobrado;
- importe remitido;
- efectivo pendiente por liquidar;
- KPI de efectivo actualmente en calle.

### Liquidaciones

- saldo pendiente por repartidor;
- cantidad de entregas pendientes de liquidación;
- recepción total o parcial de efectivo;
- selección de caja abierta donde entra el dinero;
- historial de liquidaciones;
- movimiento de caja `delivery_remittance` automático.

Persistencia nueva:
- columnas de cobro/remisión en `delivery_assignments`;
- `delivery_remittances`;
- `delivery_remittance_items`.

La API rechaza registrar nuevamente el cobro si el pedido ya está pagado.

## 8. Dashboard operativo

El dashboard del negocio conserva los indicadores comerciales y añade una franja operativa con:
- cajas abiertas;
- sucursales activas;
- efectivo pendiente en calle;
- ticket promedio.

Los valores proceden de endpoints reales de sucursales, caja, delivery y analítica.

## 9. Pedidos con contexto de sucursal

Los endpoints de pedidos ahora devuelven:
- `branch_id`
- `branch_name`

La interfaz diferencia correctamente:
- Delivery
- Recoger
- Mostrador
- Teléfono
- Mesa/reserva existente

y muestra la sucursal correspondiente en lista y detalle.

## 10. Navegación del comerciante

La sidebar fue reorganizada manteniendo el mismo sistema visual:

### Principal
- Dashboard
- Pedidos
- Clientes

### Ventas
- Punto de venta
- Caja
- Cotizaciones

### Catálogo
- Productos
- Combos
- Galería
- Opciones y extras
- Cupones
- Promociones

### Operación
- Sucursales
- Entregas

### Tienda online
- Tienda online

Las áreas existentes de Interacción, Relación con clientes, Informes y Ajustes permanecen disponibles.

## 11. Nuevos endpoints

### Sucursales

- `GET /api/v1/branches?store_id=...`
- `POST /api/v1/branches`
- `PUT /api/v1/branches/{id}`
- `DELETE /api/v1/branches/{id}`
- `GET /api/v1/branches/{id}/catalog`
- `PUT /api/v1/branches/{id}/catalog/{productID}`

### Caja

- `GET /api/v1/cash/sessions?store_id=...`
- `GET /api/v1/cash/summary?store_id=...&branch_id=...`
- `POST /api/v1/cash/sessions/open`
- `POST /api/v1/cash/sessions/{id}/movements`
- `POST /api/v1/cash/sessions/{id}/close`

### Delivery / liquidaciones

- `GET /api/v1/delivery/courier-balances?store_id=...`
- `POST /api/v1/delivery/assignments/{id}/collect`
- `GET /api/v1/delivery/remittances?store_id=...`
- `POST /api/v1/delivery/remittances`

## 12. Migración

Nueva migración:

`000051_business_operations`

No se debe borrar ni recrear PostgreSQL.

La migración:
- crea sucursales y catálogo por sucursal;
- crea caja/turnos/movimientos;
- vincula órdenes a sucursal/caja;
- amplía asignaciones de delivery con cobros y remisiones;
- crea liquidaciones;
- genera sucursal principal para tiendas existentes;
- instala el trigger para tiendas futuras.

## 13. Despliegue en Dokploy

1. Hacer backup de PostgreSQL.
2. Publicar el código V4.4.0.
3. Reconstruir **api** y **web**.
4. Permitir que el API ejecute migraciones hasta `000051`.
5. No borrar volúmenes ni reiniciar la base de datos.
6. Esta versión no modifica el servicio `whatsapp`, por lo que no requiere cambios funcionales allí.
7. Al entrar a cada negocio debe existir automáticamente una sucursal `Principal`.
8. Verificar primero: Sucursales → Caja → Punto de venta → Entregas/Liquidaciones.

## 14. Validación realizada en este entorno

- Parseo sintáctico de **115 archivos TS/TSX**: **0 errores**.
- `gofmt -d` en todos los archivos Go modificados: **sin diferencias**.
- Revisión de rutas nuevas contra sus handlers.
- Revisión manual de los flujos de sucursal, caja, TPV, pedido telefónico, delivery y liquidación.
- No se pudo ejecutar un `next build` completo porque el paquete de trabajo no incluye `node_modules` y la instalación de dependencias no completó en este entorno.
- No se pudo ejecutar el `go test` integral: el entorno local dispone de Go 1.23.2 y el proyecto declara Go 1.26.0; además no están disponibles todas las dependencias de módulos sin acceso de red.

La validación definitiva de build debe realizarse en el pipeline de despliegue que tenga las versiones de Node/Go y acceso a dependencias declaradas por el proyecto.

## 15. Alcance deliberadamente reservado para la siguiente etapa

V4.4.0 construye el núcleo operativo. No se presentan como implementadas funciones que todavía no lo están:

- selección automática de sucursal en el storefront público por geolocalización;
- stock independiente por sucursal (V4.4.0 implementa disponibilidad y precio local, no existencias separadas);
- límite máximo configurable de efectivo que un repartidor puede llevar antes de bloquear nuevas asignaciones;
- asignación formal de empleados a una o varias sucursales;
- cierre ciego de caja / conteo por denominaciones;
- transferencias de stock entre sucursales.

Estas funciones encajan como siguiente fase sin rehacer la arquitectura creada en V4.4.0.

## Archivos principales modificados

- `services/api/migrations/000051_business_operations.up.sql`
- `services/api/migrations/000051_business_operations.down.sql`
- `services/api/internal/httpapi/business_operations.go`
- `services/api/internal/httpapi/server.go`
- `services/api/internal/httpapi/delivery_pro.go`
- `apps/web/app/branches/page.tsx`
- `apps/web/app/cash/page.tsx`
- `apps/web/app/catalog/combos/page.tsx`
- `apps/web/app/pos/page.tsx`
- `apps/web/app/delivery/page.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/orders/page.tsx`
- `apps/web/components/store-shell.tsx`
- `apps/web/lib/types.ts`
- `apps/web/public/sw.js`
- `VERSION`
- `README.md`
- `CHANGELOG.md`

