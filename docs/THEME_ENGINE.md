# WAMERCIO Theme Engine 2.1

WAMERCIO separa desde 2.1 dos conceptos que antes estaban mezclados:

- **Business Template**: define cómo funciona un tipo de negocio (motor, categorías, variantes, extras, atributos, respuestas rápidas y ejemplos).
- **Visual Theme**: define cómo luce el storefront sin alterar productos, pedidos ni configuración comercial.

## Temas incluidos

1. `fresh-market` — **Mercado Fresco**: minimarkets, supermercados, tiendas de conveniencia y mercados.
2. `food-bold` — **Comida con Sabor**: pizzerías, restaurantes, cafeterías, pica pollos y comida rápida.
3. `editorial-fashion` — **Moda Editorial**: boutiques, ropa, calzados y accesorios.
4. `beauty-soft` — **Belleza Suave**: salones, cosméticos, maquillaje y cuidado personal.
5. `luxury` — **Elegancia Premium**: joyería, regalos, detalles y productos premium.
6. `tech-modern` — **Tecnología Moderna**: celulares, electrónica y accesorios.
7. `industrial-pro` — **Ferretería Pro**: ferreterías, repuestos, materiales y suministros.
8. `minimal-shop` — **Tienda Minimalista**: tiendas generales, servicios y negocios variados.

## Persistencia

La migración `000012_store_themes` agrega a `stores`:

- `visual_theme varchar(40)`
- `theme_config jsonb`

`template_config` permanece reservado para la lógica del negocio. `theme_config` contiene únicamente overrides visuales.

## Design tokens

El storefront convierte `theme_config` en variables CSS para color principal/secundario, acento, fondo, superficies, textos, bordes, radios, sombras y familias tipográficas.

También interpreta variantes de:

- Header
- Hero
- Categorías
- Tarjetas de productos
- Proporción de imágenes
- Columnas móviles
- Botones
- Fondo

## Compatibilidad

La migración conserva el `primary_color` de las tiendas existentes como override y asigna automáticamente un tema recomendado según la plantilla funcional existente.

## Personalización avanzada

El comerciante puede añadir CSS propio desde **Ajustes > Diseño y marca > Avanzado**. No se permite JavaScript personalizado para mantener el aislamiento y la seguridad del SaaS.

## Editor visual 2.1.2

El panel muestra lenguaje de negocio en español y evita exponer términos técnicos innecesarios. Desde **Ajustes → Diseño y marca** el comerciante dispone de:

- diseños base con vista previa en vivo;
- paletas listas como **Verde negocio**, **Caribe**, **Azul confianza**, **Sabor**, **Belleza** y **Premium**;
- color principal, apoyo, detalle, fondo, tarjetas, textos, bordes y texto de botones;
- letra de títulos y letra para productos/textos;
- estilo de encabezado y portada;
- presentación de categorías y productos;
- formato de foto, productos por fila, bordes, sombras y botones;
- fondo sólido o degradado;
- CSS adicional para clientes avanzados, sin JavaScript arbitrario.

Los IDs internos de los temas no cambian, por lo que las tiendas existentes conservan compatibilidad aunque los nombres visibles sean más claros.
