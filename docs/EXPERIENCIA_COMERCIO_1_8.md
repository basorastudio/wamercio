# WAMERCIO 1.8 — Experiencia de comercio simplificada

## Principio

El comerciante no debe administrar detalles técnicos. El panel muestra únicamente decisiones comerciales que entiende y utiliza en el día a día.

## Campos gestionados automáticamente

WAMERCIO conserva o genera internamente:

- identificadores web (`slug`);
- orden de categorías y productos;
- color base de la tienda;
- moneda por defecto DOP;
- SKU, etiquetas y precio comparativo cuando no son necesarios;
- tiempos técnicos por defecto de delivery;
- estados activos por defecto.

Estos datos continúan existiendo para compatibilidad, pero no forman parte del flujo normal del comerciante.

## Imágenes

Ya no se pide pegar URLs para imágenes o logos. Los bloques de imagen funcionan como botones de subida para:

- logo de la tienda;
- portada/banner;
- imagen de categoría;
- imagen de producto.

## Modales

Los formularios usan un patrón mobile-first:

- bottom-sheet en móvil;
- esquinas amplias y jerarquía visual clara;
- encabezado fijo;
- campos agrupados por intención;
- acciones al final;
- opciones avanzadas ocultas hasta que se necesiten.

## Navegación del comerciante

La navegación principal prioriza:

- Inicio;
- Pedidos;
- Conversaciones;
- Clientes;
- Productos;
- Categorías;
- Tiendas;
- Delivery;
- Ajustes;
- WhatsApp;
- Soporte;
- Mi cuenta.

Cupones, movimientos y gestión de plan dejan de ocupar espacio en la navegación principal. Las rutas se conservan para compatibilidad y futura reubicación contextual.

## Productos

El formulario principal solicita:

- foto;
- nombre;
- categoría;
- precio;
- descripción.

Inventario, variantes y extras se muestran bajo **Opciones del producto** solo cuando el comerciante los necesita.

## Categorías

El comerciante solo define:

- imagen;
- nombre;
- descripción opcional.

El identificador y el orden se generan automáticamente.

## Tiendas

El flujo de alta/edición muestra:

- logo;
- nombre;
- WhatsApp;
- dirección;
- descripción.

Slug, color y otros valores internos se gestionan automáticamente.

## Ajustes

Se reducen a tres áreas:

1. **Mi negocio** — identidad, logo, portada, WhatsApp, dirección y descripción.
2. **Ventas y entrega** — delivery/recogida, pedido mínimo, pagos y aviso comercial.
3. **Horarios** — días abiertos y horas.

## Catálogo público

La tienda pública adopta una interfaz más actual:

- hero/portada de marca;
- categorías horizontales con imagen opcional;
- buscador prominente;
- tarjetas de producto responsive;
- mejor experiencia en móvil;
- estados vacíos útiles;
- checkout y fichas de producto con esquinas y jerarquía consistentes.
