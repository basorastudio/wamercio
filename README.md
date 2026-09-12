# WAMERCIO 1.8.2

WAMERCIO es una plataforma SaaS de comercio conversacional construida con Next.js, Go, PostgreSQL, Redis y un servicio WhatsApp multisesión propio.

## Novedad 1.8: panel de comercio simplificado

Esta versión reorganiza la experiencia del comerciante alrededor de un principio: **menos configuración, más operación**.

El panel ya no expone campos técnicos como slug, orden visual, SKU, color hexadecimal o URLs de imágenes. WAMERCIO genera o conserva esos valores internamente.

### Formularios más simples

- Productos: foto, nombre, categoría, precio y descripción; inventario/variantes/extras quedan como opciones.
- Categorías: imagen, nombre y descripción; slug/orden automáticos.
- Tiendas: logo, nombre, WhatsApp, dirección y descripción.
- Delivery: zona y costo; valores técnicos quedan automáticos.
- Ajustes: solo `Mi negocio`, `Ventas y entrega` y `Horarios`.

### Subida de imágenes

Logo, portada, categorías y productos se cargan tocando directamente el bloque visual de la imagen. Ya no se solicitan URLs.

### Frontend modernizado

- modales mobile-first tipo bottom-sheet;
- tarjetas con jerarquía visual más clara;
- campos y acciones rediseñados;
- Dashboard con accesos rápidos;
- catálogo público más visual y responsive;
- navegación del comerciante reducida a módulos operativos esenciales.

Consulta `docs/EXPERIENCIA_COMERCIO_1_8.md` para la matriz completa de cambios.

## Accesos

```text
Comerciante: WhatsApp + PIN de 4 dígitos
SuperAdmin: /admin/login → correo + contraseña
```

## Infraestructura

Se mantiene la ruta estable:

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000 → Go API
                                           ↘ WhatsApp bridge
```

La actualización 1.8 no requiere cambios de `.env`, volúmenes ni migraciones de base de datos.

## Actualización

Sube el código al mismo repositorio y ejecuta **Rebuild** en Dokploy. No uses **Fresh Volumes**.
