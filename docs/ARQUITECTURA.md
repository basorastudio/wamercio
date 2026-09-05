# Arquitectura funcional

## Capas

1. **Web / Next.js**: landing, catálogo público, carrito, checkout, panel, SuperAdmin y PWA.
2. **API / Go**: autenticación, tenancy, catálogo, pedidos, administración, integraciones.
3. **PostgreSQL**: fuente de verdad.
4. **Redis**: disponible para caché, rate-limit, sesiones auxiliares y jobs.
5. **Media**: volumen persistente; interfaz migrable a R2/S3.
6. **Waxum/AstraCalls**: canal WhatsApp desacoplado mediante adaptador.
7. **GEO RD MAP**: previsto para catálogo territorial, geocercas, tarifas y routing.

## Tenancy

Cada entidad operacional lleva `tenant_id`. El backend nunca toma el tenant de un campo arbitrario para rutas privadas: lo toma del JWT. En rutas públicas, el tenant se resuelve por `slug`/subdominio.

## Diseño conservado del original

- Tienda mobile-first con portada, avatar superpuesto, estado abierto/cerrado, categorías horizontales y tarjetas de producto.
- Barra flotante de carrito.
- Checkout lateral/modal progresivo.
- Panel administrativo con barra lateral y módulos equivalentes al original.
- SuperAdmin separado.
- Marketplace y afiliados como dominios funcionales independientes.

## Adaptaciones RD

- Moneda DOP / RD$.
- Provincia → municipio → sector/barrio.
- Teléfono WhatsApp dominicano sin prefijo +55 hardcodeado.
- Sustitución de CEP/ViaCEP por estructura territorial dominicana y GEO RD MAP.
- Métodos base: efectivo, tarjeta al recibir, transferencia bancaria y enlace de pago.
- Zona horaria `America/Santo_Domingo`.
