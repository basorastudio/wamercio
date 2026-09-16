# WAMERCIO — Áreas de mesas y métodos de pago por modalidad

## Objetivo
Mejorar la gestión de mesas y el control de métodos de pago sin alterar el patrón visual, funcional ni multi-tenant de WAMERCIO.

## Áreas y mesas
Cada negocio con `Mesas y reservas` habilitado administra primero áreas (por ejemplo Salón principal, Terraza o VIP). Cada mesa pertenece obligatoriamente a un área. Las mesas históricas se asignan automáticamente a `Área principal` para conservar compatibilidad y reservas existentes.

La pantalla `/tables` organiza la información por área y permite crear, editar y archivar áreas y mesas. Los nombres de mesa pueden repetirse en áreas diferentes, pero no dentro de una misma área activa.

## Navegación sin parpadeo
`Gestión de mesas` debe resolverse con el estado `dine_in_enabled` cargado junto con la tienda activa. La navegación no debe depender de una consulta posterior que haga aparecer el elemento tras el primer render. El último estado conocido puede persistirse como ayuda de hidratación, pero la API sigue siendo la fuente de verdad.

## Métodos de pago por modalidad
Los métodos globales continúan siendo `Efectivo`, `Tarjeta en terminal` y `Transferencia electrónica`. Se añade una matriz de disponibilidad para `delivery`, `pickup` y `dine_in`. Un método desactivado globalmente nunca puede habilitarse para una modalidad.

La tienda pública filtra inmediatamente los métodos permitidos al cambiar de modalidad. El backend repite la validación durante el checkout para evitar combinaciones manipuladas desde el navegador.

## Compatibilidad
El POS usa los métodos globalmente habilitados. Las reglas por modalidad aplican a pedidos del cliente. No se agregan variables de entorno nuevas.

## Persistencia
Nueva tabla `store_table_areas`, relación `store_tables.area_id` y configuración JSONB de métodos por modalidad. La migración crea `Área principal` y enlaza mesas existentes antes de exigir `area_id`.

## Pruebas
Se cubren migraciones, endpoints de áreas/mesas, navegación condicional, filtrado de métodos por modalidad y validación de checkout.
