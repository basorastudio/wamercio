# WAMERCIO Theme Engine 2.1

WAMERCIO separa desde 2.1 dos conceptos que antes estaban mezclados:

- **Business Template**: define cómo funciona un tipo de negocio (motor, categorías, variantes, extras, atributos, respuestas rápidas y ejemplos).
- **Visual Theme**: define cómo luce el storefront sin alterar productos, pedidos ni configuración comercial.

## Temas incluidos

1. `fresh-market` — Colmados, supermercados y consumo diario.
2. `food-bold` — Restaurantes, pizzerías y comida rápida.
3. `editorial-fashion` — Boutiques, moda y accesorios.
4. `beauty-soft` — Cosméticos, salones y belleza.
5. `luxury` — Regalos y productos premium.
6. `tech-modern` — Tecnología y catálogos de comparación.
7. `industrial-pro` — Ferreterías, repuestos y mayoristas.
8. `minimal-shop` — Base neutral y flexible.

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
