# WAMERCIO 4.6.1 — Auditoría contextual de interfaces y flujos

Fecha de edición: 17 de octubre de 2026. Base: WAMERCIO 4.6.0 suministrado en la conversación.

## 1. Propósito y límite de la auditoría

Alinear la terminología visible, botones, catálogo, el checkout, los estados de operaciones, notificaciones, panel de gestión, analítica y parte de la administración de plantillas con la realidad de cada negocio. **Esta es una revisión estática orientada a los flujos comerciales relevantes, NO una certificación exhaustiva del funcionamiento de todas las integraciones, permisos, contabilidad o escenarios de producción**. El software contiene más de 100 archivos Go y 120 TS/TSX; lograr certeza integral requiere pruebas reales de extremo a extremo y auditoría por módulo.

## 2. Matriz de 16 plantillas

| Plantilla | Nombre de catálogo | Acción pública | Operación resultante / precaución |
|---|---|---|---|
| Comida rápida | Menú | Enviar pedido | Venta; cocina y delivery cuando están habilitados |
| Pizzería | Menú de pizzas | Pedir pizzas | Venta; no presentar turnos de servicios |
| Repostería | Postres y encargos | Solicitar encargo | Solicitud de encargo; fecha y decoración se confirman luego |
| Boutique | Colección | Enviar compra | Venta de prendas; talla, color y stock |
| Cosméticos | Cosméticos | Enviar compra | Venta; variantes, tonos y presentaciones |
| Celulares y tecnología | Equipos y accesorios | Enviar pedido | Pedido o consulta; especificaciones técnicas |
| Ferretería | Materiales y herramientas | Solicitar cotización | Cotización; no dinero cobrado ni venta confirmada |
| Repuestos | Repuestos y accesorios | Consultar compatibilidad | Solicitud de cotización y verificación de compatibilidad |
| Salón de belleza | Servicios de belleza | Solicitar cita | **Solicitud, no cita confirmada**; pago por definir |
| Barbería | Cortes y servicios | Solicitar turno | **Solicitud, no turno confirmado**; pago por definir |
| Pet Shop | Tienda para mascotas | Enviar pedido | Pedido de artículos para mascotas |
| Floristería | Arreglos florales | Solicitar arreglo | Encargo con dedicatoria, disponibilidad y entrega por confirmar |
| Regalos personalizados | Regalos personalizados | Solicitar personalización | Solicitud sujeta a revisión de diseño y precio |
| Productos naturales | Productos naturales | Enviar pedido | Pedido de producto, presentación y stock |
| Mayorista | Catálogo por volumen | Solicitar precio por volumen | Cotización empresarial, no ingreso garantizado |
| Otro negocio | Productos | Confirmar pedido | Motor comercial general, sin módulos verticales extra |

La selección de módulos especializados continúa siguiendo el sistema de 26 flags implementado en 4.6.0. Las personalizaciones en plantillas surten efecto en nuevos negocios; no se reasignan retroactivamente perfiles a tiendas ya existentes.

## 3. Cambios realmente aplicados

### 3.1 Motor de lenguaje y capacidades
- `apps/web/lib/business-language.ts`: un vocabulario contextual recomendado por cada plantilla y **15 textos configurables** (`interface_copy`) para botones, nombres, confirmaciones, aviso de recepción y operación, otros. Valida tipo y longitud de overrides. Respeta `item_label`/`item_label_plural` preexistentes.
- `apps/web/lib/business-capabilities.ts`: sincroniza textos y etiquetas; citas de servicios sin pago anticipado durante el envío de solicitud; las mesas exclusivamente para `food`.
- `apps/web/components/catalog-nav.tsx`: el nombre del catálogo aparece adaptado al negocio.

### 3.2 Tienda pública, pedidos y clientes
- `apps/web/components/storefront.tsx`: CTAs, avisos, instrucciones, selección del cliente y éxito según perfil; comunica que los turnos solicitados **no bloquean un horario**.
- `apps/web/components/storefront-mobile-nav.tsx`: rótulos personalizables de navegación para móvil.
- `apps/web/app/catalog/products/page.tsx`: denominación dinámica de artículos/servicios, búsqueda contextual y supresión de paneles de combos o modificadores cuando no aplican; conserva edición de composiciones previas incluso si el flag está apagado.
- `apps/web/app/catalog/categories/page.tsx`: etiqueta de producto ajustada y categorías sin términos ajenos al negocio.
- `apps/web/app/orders/page.tsx`: encabezados, nombres y botones de estados disponibles según solicitud normal, cita y cotización.
- `apps/web/app/cliente/pedidos/page.tsx`: diferencia en historia y detalle reservas de mesas de solicitudes de citas y de cotizaciones; impide solicitar reseñas de cotizaciones desde el portal.

### 3.3 Paneles y administración
- `apps/web/components/store-shell.tsx`: navegación adecuada a los módulos efectivos y nombres adaptados por comercio.
- `apps/web/app/dashboard/page.tsx`: KPI y listados descriptivos; títulos de catálogo y operaciones; accesos rápidos solo de módulos habilitados. Corregida referencia a variables no definidas en `SourceDonut`.
- `apps/web/app/analytics/page.tsx`: los importes mostrados son la suma de operaciones no canceladas **incluyendo pendientes**, no ingresos ya cobrados. Se evitaron títulos de «facturación» que los convertían incorrectamente en cobros; prestaciones de promoción ocultas si el módulo no aplica.
- `apps/web/app/settings/store/page.tsx`: ajustes de servicios como **solicitudes de cita**, no reservaciones automáticas; rótulos de pedido mínimo adaptados.
- `apps/web/app/admin/templates/page.tsx`: gestor de los 15 textos y avisos por plantilla; switches condicionados al motor, con advertencia de que el módulo de restaurantes es de mesas y no de agenda profesional.

### 3.4 Backend y notificaciones
- `services/api/internal/httpapi/server.go` expone `template_slug` real en respuesta pública de la tienda para resolver el perfil correcto.
- Determina `flow_type` con reglas de negocio congruentes y valida compatibilidad de mesa con motor `food`; cita en servicio sin exigir pago antes de aceptación.
- Avisos de WhatsApp de solicitud de cita o cotización no prometen automáticamente confirmación ni pedido entregado; permite override administrativo en `interface_copy` donde se implementó.
- Cambios exclusivamente en estado de pago no repiten notificación del mismo estado operativo.
- Cotizaciones se excluyen de automatizaciones de venta completada (la capa general de flujos visuales sigue requiriendo verificación específica).

## 4. Pruebas ejecutadas

- 16/16 perfiles contrastados con la base de plantillas y sus módulos.
- 26 flags del perfil 4.6.0 verificados por el test existente.
- 15 claves de lenguaje, overrides, flujos de cita/quote y texto de confirmación verificados por nuevo script `scripts/test_4_6_1_business_context.js`.
- `tsc --strict --target ES5 --noEmit` sobre los tres módulos puros de perfiles y capacidades: aprobado.
- 120 archivos TypeScript/TSX: inspección sintáctica con AST TypeScript; 0 errores de *parseo*.
- `gofmt` sobre código Go: ningún error de parseo reportado en los archivos presentes.

### NO verificado todavía
- Compilación completa Next.js y compilación completa del API Go: este entorno carece de dependencias web instaladas y del toolchain Go exigido (Go 1.27.1), y las descargas externas fallaron.
- Tests integrados con base de datos real, Redis, WhatsApp, callback de cobros, webhooks y sesiones reales.
- Permisos y autorización en endpoints API cuando se deshabilita un módulo; **ocultar pantalla no es revocar permiso**.
- Agenda real para turnos con disponibilidad, profesionales, bloqueo de cupos, recordatorios y reprogramaciones: **no está implementada**.
- Exhaustividad sobre las restantes páginas administrativas, flujos asíncronos, POS, caja, delivery, contabilidad y cumplimiento normativo.

## 5. Puerta de aprobación antes de Dokploy

1. Actualizar la rama usada por Dokploy con este paquete, conservando secretos en entorno y datos persistidos. No subir `.env`.
2. En GitHub Actions, verificar **Frontend production build** (ejecuta tests de versiones 4.6.0 y 4.6.1 antes de `npm run build`), Go API y resto de servicios.
3. Probar en staging creación de una tienda por cada una de las 16 plantillas, editor de plantillas, catálogo, cliente móvil y administración web.
4. Probar citas no confirmadas, rechazo/reprogramación, cotizaciones, pedidos con pago por definir, cambios de estado, transferencias manuales y WhatsApp desconectado.
5. Revisar roles y permisos por API, integraciones externas, backups, datos históricos y políticas de reintento de eventos.
6. Solo después, despliegue en producción en Dokploy y verificación de logs, salud de servicios y base de datos.

## 6. Compatibilidad

No se crean migraciones de base de datos ni se eliminan productos, pedidos, comercios o datos de usuarios. Los cambios visuales conservan el patrón existente y los contratos internos de estados de pedido. Las configuraciones personalizadas siguen almacenadas por plantilla/tienda según los mecanismos existentes. No se han modificado credenciales ni valores de producción.
