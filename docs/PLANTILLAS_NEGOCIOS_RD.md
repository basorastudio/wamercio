# WAMERCIO 2.0 — Plantillas de negocios de República Dominicana

## Objetivo

El usuario no debe aprender a configurar un ecommerce. Debe indicar qué negocio tiene y recibir una tienda funcional para personalizar.

La regla de producto es:

> Elige tu negocio. WAMERCIO lo prepara. Tú solo agrega o modifica lo que vendes.

## Alcance

WAMERCIO se concentra en negocios que venden productos, gastronomía, servicios, cotizaciones o catálogos especializados y utilizan WhatsApp para atender y cerrar operaciones.

El catálogo inicial no pretende enumerar cada actividad comercial posible. SuperAdmin puede crear nuevas plantillas y `Otro tipo de negocio` funciona como punto de partida para cualquier operación que venda, cotice o coordine servicios por WhatsApp.

## Motores comerciales

Las plantillas comparten motores reutilizables para evitar código específico por negocio:

- `retail`: venta directa de productos;
- `fashion`: moda y productos con talla/color;
- `food`: gastronomía con variantes y extras;
- `catalog`: catálogo técnico/especializado;
- `quotation`: venta y solicitud de cotización;
- `services`: servicios que se coordinan con el cliente;
- `wholesale`: venta mayorista y por presentación.

La configuración concreta se guarda en `business_templates.settings` y se clona a `stores.template_config`.

## Plantillas incluidas

| Plantilla | Familia | Motor | Uso principal |
| --- | --- | --- | --- |
| Comida rápida | Comida | food | combos, platos, extras y delivery |
| Pizzería | Comida | food | tamaños, ingredientes y combos |
| Repostería | Comida | food | postres, tamaños y pedidos personalizados |
| Boutique | Moda | fashion | talla, color e inventario |
| Cosméticos | Belleza | retail | tonos, tamaños y catálogo visual |
| Celulares y tecnología | Tecnología | catalog | especificaciones, condición y garantía |
| Ferretería | Ferretería | quotation | compra directa y cotización |
| Repuestos | Automotriz | catalog | compatibilidad, marca y referencia |
| Salón de belleza | Servicios | services | servicios y coordinación por WhatsApp |
| Barbería | Servicios | services | servicios y coordinación por WhatsApp |
| Pet Shop | Mascotas | retail | alimentos, tamaños y accesorios |
| Floristería | Regalos | retail | arreglos y detalles |
| Regalos personalizados | Regalos | retail | personalización y referencias |
| Productos naturales y suplementos | Bienestar | retail | presentaciones y sabores |
| Mayorista / distribuidor | Mayoristas | wholesale | unidad, paquete/caja y pedidos por volumen |
| Otro tipo de negocio | Otros | retail | punto de partida genérico |

## Clonado de plantilla

La plantilla funciona como un molde de una sola aplicación:

```text
Plantilla maestra
      ↓ seleccionar
Transacción PostgreSQL
      ↓
Tienda
Categorías
Productos/servicios demo
Respuestas rápidas
Configuración contextual
```

Una vez creado el comercio, el usuario puede modificar o eliminar cualquier elemento sin alterar la plantilla maestra.

## Respuestas rápidas

Las plantillas también crean respuestas adecuadas al sector. El chat de WhatsApp carga las respuestas de la tienda desde `/api/v1/quick-replies` y las muestra como accesos rápidos en el compositor.

## Onboarding

El registro unificado funciona así:

1. introducir WhatsApp;
2. si la cuenta existe, solicitar PIN;
3. si no existe, mostrar selector de tipo de negocio;
4. seleccionar plantilla;
5. introducir nombre del responsable, nombre del negocio y PIN;
6. crear cuenta + tienda + contenido inicial en una sola transacción.

## Creación de tiendas adicionales

`Mis tiendas → Nueva tienda` usa el mismo selector de plantillas. Esto permite que un propietario tenga varios negocios con estructuras distintas.

## SuperAdmin

La sección `/admin/templates` permite administrar el catálogo maestro sin exponerlo al comerciante. Las tiendas existentes no se modifican al editar una plantilla.

## Evolución prevista

Las plantillas iniciales utilizan los motores comerciales ya compatibles con WAMERCIO. Las funciones más especializadas —agenda avanzada con disponibilidad por profesional, alquiler con calendario y listings inmobiliarios— deben añadirse como capacidades de motor, no como aplicaciones separadas.
