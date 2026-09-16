# WAMERCIO 2.8.5

## Corrección de identidad global y relación comercial

WAMERCIO vuelve a separar explícitamente dos conceptos distintos:

- **Identidad global:** una persona se registra una sola vez en la plataforma y puede iniciar sesión en cualquier negocio sin volver a registrarse.
- **Cliente del negocio:** una identidad global pasa a ser cliente de una tienda únicamente cuando registra su primera compra no cancelada y que no sea cotización.

Cuando un usuario global escribe por WhatsApp a una tienda donde nunca ha comprado, WAMERCIO muestra su **nombre y apellido registrados en la plataforma** como identidad principal, conserva el nombre de perfil de WhatsApp como información secundaria y lo clasifica como **Contacto**.

La migración `000035_global_identity_contact_semantics` corrige instalaciones que hayan desplegado 2.8.4: desvincula de la conversación relaciones de cliente sin compra y actualiza el nombre visible desde la identidad global, sin borrar la cuenta, direcciones, PIN ni historial global.

La protección contra conversaciones creadas con el propio WhatsApp del negocio introducida en 2.8.4 se conserva.

Para despliegue y actualización consulta `DEPLOY_DOKPLOY.md`.

---

# WAMERCIO 2.8.4


## Cambios 2.8.4

> **Nota:** la promoción automática de una identidad global a Cliente introducida en 2.8.4 fue corregida por 2.8.5. Se mantiene únicamente la higiene del número propio y el reconocimiento del nombre global.


- Higiene de identidad WhatsApp: el número propio de cada negocio no puede aparecer como conversación del negocio.
- Reconocimiento del nombre de identidades globales registradas por WhatsApp. La clasificación comercial anterior a la primera compra fue corregida en 2.8.5.
- Backfill histórico mediante `000034`; la migración correctiva `000035` restaura la separación Contacto/Cliente.

La tienda pública es ahora completamente identificada por cada negocio: nombre, logo, colores, favicon, PWA y portada configurable. El propietario puede ocultar o reposicionar los elementos superpuestos a la portada desde **Configuración → Mi negocio** y en móvil la búsqueda se mantiene contraída hasta pulsar la lupa.

Para despliegue y actualización consulta `DEPLOY_DOKPLOY.md`.

---

# WAMERCIO 2.8.2

Hotfix de producción sobre 2.8.0: corrige la compilación Go/pgx de KDS y Fidelización y añade guardas de regresión para `RowsAffected()`.

# WAMERCIO 2.8.0

WAMERCIO es una plataforma dominicana de comercio conversacional, mobile-first, SPA + PWA y multi-tenant.

## Comercio inteligente 2.8.0

### Novedades 2.8.0

WAMERCIO 2.8.0 completa las fases de profundidad operativa y crecimiento sobre la base 2.6.0: modificadores reutilizables, combos, alérgenos, automatizaciones WhatsApp, analítica avanzada, galería/traducciones, reseñas verificadas, fidelización, estaciones KDS y diseñador QR general/por mesa.

Las capacidades gastronómicas continúan condicionadas por el tipo de negocio; catálogo, pedidos, POS, WhatsApp, checkout y multi-tenant conservan compatibilidad con tiendas existentes. Las migraciones nuevas son `000032_phase2_operations` y `000033_phase3_growth_experience`.

WAMERCIO amplía el núcleo comercial sin convertir la plataforma en un sistema exclusivo para restaurantes:

- **Cupones programables:** fecha/hora de inicio y fin sobre el motor de cupones existente.
- **Promociones automáticas:** descuentos por todo el catálogo, productos o categorías, con compra mínima, vigencia y límite de usos. El checkout compara promoción y cupón y conserva el mejor descuento, sin acumulación opaca.
- **Analítica:** ventas, pedidos, ticket promedio, clientes, modalidades, métodos de pago, productos con mayor facturación y rendimiento de promociones en 7, 30 o 90 días.
- **Reservaciones:** agenda administrativa, creación manual, validación de capacidad/conflictos y estados operativos.
- **QR por mesa:** cada mesa puede generar, copiar, abrir y descargar su QR; la tienda pública abre con la mesa preseleccionada mediante `?table=<uuid>`.
- **KDS:** pantalla de cocina con Nuevos / Preparando / Listos, actualización automática y reutilización del ciclo de estados de pedidos.

Reservaciones, KDS y Gestión de mesas continúan siendo capacidades contextuales: solo se muestran cuando el negocio tiene habilitada la modalidad dine-in. No se agregan dependencias ni variables de entorno.

## Compra progresiva

La tienda pública conserva el catálogo visible mientras el cliente arma su pedido: agregar o actualizar no fuerza la apertura del carrito, los productos muestran lo que ya está incluido y cada línea puede volver a editarse. Los productos configurados para venta por libra admiten compra por peso o por monto sin duplicar el modelo de datos.

## Sincronización, mesas y POS

### Áreas de mesas y pagos por modalidad

- **Gestión de mesas** se organiza por **Áreas**. Primero se crea el área (por ejemplo, Salón principal o Terraza) y luego cada mesa se asocia mediante un selector.
- Las mesas existentes se migran automáticamente a **Área principal** y la reserva pública muestra `Área · Mesa` para evitar ambigüedad.
- **Métodos de pago → Disponibilidad por modalidad** permite decidir qué formas de pago están disponibles para **Delivery**, **Recoger** y **Mesa**. Los interruptores globales siguen siendo el límite superior.
- La API valida la modalidad + método de pago durante el checkout, de modo que una combinación deshabilitada no puede forzarse desde el navegador.
- La barra lateral obtiene `dine_in_enabled` desde `/stores` y usa un estado persistido para evitar el parpadeo de **Gestión de mesas** al refrescar.


- La sesión WhatsApp del negocio no importa todo el historial por defecto. El comercio define sincronización **manual/automática** y un rango de fechas.
- Los negocios que atienden en local pueden activar **Mesas y reservas**, administrar capacidad y aceptar pedidos asociados a una reserva.
- El POS reutiliza la lógica comercial del catálogo: ficha con imagen, descripción, variantes y adicionales antes de agregar, además de búsqueda de clientes registrados.

## Capacidades por tipo de negocio

WAMERCIO utiliza `business_engine` + `template_config` como fuente de verdad para adaptar cada negocio sin duplicar plataformas. El catálogo, checkout, POS, entregas, WhatsApp asistido y panel administrativo muestran únicamente las funciones que corresponden al tipo de negocio:

- variantes, adicionales e inventario cuando la plantilla los soporta;
- Delivery, Recoger y Mesa/Reserva según capacidades reales del negocio;
- citas, solicitudes de cotización, personalización y venta mayorista cuando estén habilitadas;
- campos dinámicos de checkout definidos por la plantilla y persistidos con la operación;
- flujos diferenciados `order`, `reservation` y `quote`, evitando que una cotización pendiente se contabilice como compra, cliente o ingreso.

El SuperAdmin puede administrar estas capacidades desde **Tipos de negocio**, de modo que nuevas plantillas hereden un comportamiento coherente en toda la plataforma.

## Publicación

- Plataforma y administración: `https://wamercio.com`
- Tiendas: `https://{slug}.ltd.do`
- Dominios propios: host verificado por negocio

## Storefront 2.5.5

La experiencia pública del negocio se refinó para mantener la tienda útil mientras el cliente compra. Al abrir **Mi compra**, WAMERCIO cambia a una página completa de carrito/checkout en lugar de usar un panel lateral:

- acceso progresivo por WhatsApp sin botón intermedio;
- búsqueda predictiva en la barra superior sin filtrar el lienzo del catálogo;
- resultados contextuales que abren directamente la ficha del producto;
- tarjetas de producto más consistentes y precios iniciales correctos cuando existen variantes;
- carrito como página completa dedicada: productos a la izquierda y checkout completo visible de inmediato a la derecha en escritorio, con flujo vertical responsive en móvil;
- la edición de una línea del carrito abre la ficha del producto directamente sobre **Mi compra**, sin regresar al catálogo;
- una sola acción **Seguir comprando** devuelve al catálogo y no existe un paso intermedio para desplegar entrega/pago;
- la dirección deja de ocupar espacio en la barra superior.

La publicación exacta de `*.ltd.do` y dominios personalizados conserva la arquitectura de WAMERCIO 2.5.4.

Consulta `DEPLOY_DOKPLOY.md` para el despliegue.
