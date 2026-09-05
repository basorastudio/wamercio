# Estado de implementación — reconstrucción 1:1

Esta reconstrucción conserva el modelo funcional y la experiencia del proyecto PHP original, pero no reutiliza su arquitectura ni sus debilidades de seguridad.

## Implementado y operativo en esta entrega

| Módulo | Estado | Alcance actual |
|---|---|---|
| Multi-tenant por subdominio | ✅ | Resolución wildcard y storefront por `slug` |
| Landing SaaS | ✅ | Presentación, planes y CTA de registro |
| Registro de negocio | ✅ | Crea tenant, propietario y suscripción inicial |
| Autenticación | ✅ | Roles, bcrypt, JWT en cookie HTTP-only |
| Catálogo público | ✅ | Categorías, búsqueda, productos, ofertas, imágenes |
| Variaciones de producto | ✅ | Grupos, opciones, mínimos/máximos y recargos |
| Carrito | ✅ | Cantidades, variaciones y notas por línea |
| Checkout | ✅ | Delivery, recogida, mesa y otros |
| Pedidos | ✅ | Alta, detalle, totales calculados en servidor y estados |
| WhatsApp | ✅/⚙️ | Continuación por `wa.me`; adaptador HTTP para Waxum/AstraCalls |
| Clientes | ✅ | Alta/actualización automática desde pedidos y listado |
| Categorías | ✅ | Listado y creación |
| Productos | ✅ | CRUD, stock, oferta, imágenes y variaciones |
| Banners | ✅ | Alta/listado/eliminación |
| Cupones | ✅ | Alta/listado/eliminación y aplicación en checkout |
| Delivery | ✅/⚙️ | Zonas y tarifas; geocercas GEO RD MAP pendientes |
| Horarios | ✅ | Configuración semanal |
| Mesas/locales | ✅ | CRUD básico |
| QR | ✅ | QR del catálogo por tenant |
| PDV | ✅ | Interfaz base de venta con catálogo/carrito |
| Reportes | ✅ | Pedidos y ventas de 14 días |
| Configuración | ✅ | Identidad, contacto, operación y pagos |
| Plan/suscripción | ✅ | Consulta del plan vigente |
| Marketplace local | ✅ | Marketplace por slug/municipio, negocios y productos |
| PWA tenant | ✅ | Manifest dinámico por negocio |
| Google Shopping XML | ✅ | Feed XML básico por negocio |
| Media | ✅ | Carga autenticada y almacenamiento persistente local |
| SuperAdmin resumen | ✅ | Métricas globales |
| SuperAdmin negocios | ✅ | Listado central de tenants |
| PostgreSQL | ✅ | Esquema relacional, FKs e índices |
| Redis | ✅ | Infraestructura incluida para cache/sesión futura |
| Docker/Dokploy | ✅ | Compose, healthchecks y servicios internos |

## Parcial: existe la arquitectura pero falta paridad completa 1:1

- SuperAdmin: CRUD completo de planes, usuarios, suscripciones, vouchers, segmentos, provincias/municipios y configuración global.
- Afiliados/revendedores: modelo y rol definidos, pero falta completar todo el panel visual y liquidación de comisiones.
- Integraciones: pantalla y variables preparadas; falta fijar el contrato exacto del OpenAPI de la instancia Waxum/AstraCalls que se vaya a utilizar.
- Impresión: tablas/tokens modelados; falta agente/cola de impresión equivalente al flujo antiguo.
- Pagos: métodos dominicanos configurables; falta conectar un gateway dominicano concreto y sus webhooks.
- GEO RD MAP: variables y diseño previstos; falta implementar geocercas, cálculo por zona y routing.
- Analytics/Meta Pixel: falta panel y emisión de scripts por tenant.
- Notificaciones automáticas: estructura disponible, falta editor de plantillas y disparadores por estado.
- Vouchers/afiliación: base de datos preparada, falta flujo comercial completo.
- Importador desde MySQL antiguo: no incluido, porque esta reconstrucción parte limpia y no debe arrastrar credenciales/datos heredados.
- Pruebas E2E y observabilidad de producción: pendientes antes de operación masiva.

## Mejoras deliberadas frente al original

- No MD5: bcrypt para contraseñas.
- No SQL concatenado: consultas parametrizadas con pgx.
- No secretos dentro del repositorio: variables de entorno.
- No MyISAM ni relaciones implícitas: PostgreSQL con claves foráneas.
- No PHP procedural/routing artesanal: API Go separada del frontend Next.js.
- El navegador nunca decide precios finales: el backend recalcula productos, ofertas, opciones, cupón y total.
- Los datos del panel se filtran por `tenant_id` en servidor.
- PostgreSQL y Redis no publican puertos en producción.

## Definición de “recrear tal cual”

La meta 1:1 es conservar **función, flujo, organización, aspecto general y experiencia de uso** de la aplicación original, no copiar su código. La interfaz nueva mantiene la composición de portada, identidad del negocio, estado abierto/cerrado, categorías horizontales, tarjetas de producto, carrito flotante, checkout y panel administrativo, pero se implementa con componentes modernos y responsive.
