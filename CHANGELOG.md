# WAMERCIO 2.3.0 — Centro SaaS funcional

- Centro SaaS con configuración real por sección.
- Secretos cifrados para integraciones.
- GEO RD MAP, Identidad, R2 y WhatsApp con estado/pruebas.
- Política dinámica de PIN para propietarios y personal.
- Páginas legales públicas y auditoría filtrable.

# WAMERCIO 2.2.2 — Corrección de compilación del Centro SaaS

- Corrige el error de TypeScript en `app/admin/settings/page.tsx` durante `next build`: `sections` ya no depende de la inferencia literal de `as const`, que hacía que `flatMap()` redujera todos los IDs al primer literal `general`.
- Define `SettingsSectionItem` y `SettingsSectionGroup` explícitamente y usa `LucideIcon` como tipo de icono, manteniendo intactos los grupos, IDs, textos, iconos y navegación del Centro SaaS.
- Añade `scripts/verify-web-settings-types.sh` para impedir que reaparezca la inferencia que rompía el build.
- Mantiene sin cambios el esquema de base de datos, ENV, API, Docker Compose y funcionalidades de WAMERCIO 2.2.1.

# WAMERCIO 2.2.1 — Corrección de compilación del API

- Corrige un bloque de validación redundante insertado accidentalmente en `requestSubscription`, que referenciaba `id` antes de declararlo y detenía el build del API en Dokploy con `undefined: id`.
- La validación redundante se elimina porque `requireStoreAuth` ya exige una sesión de propietario antes de acceder a solicitudes de suscripción.
- Añade `scripts/verify-api-compile-guards.sh` y lo integra en la verificación de la versión para impedir que esta regresión reaparezca.
- Actualiza versión y caché PWA a `2.2.1` sin cambios de esquema ni nuevas variables de entorno.

# WAMERCIO 2.2.0 — Administración SaaS y operación comercial convergentes

- Reestructura Superadmin con Página comercial, Propietarios, Planes/Suscripciones, Clientes globales, Usuarios SaaS y Centro SaaS manteniendo la UI de WAMERCIO.
- Añade configuración centralizada de territorio, tipos/plantillas, dominios, arquitectura de datos, bancos, WhatsApp, notificaciones, acceso, identidad, legal, backups y auditoría.
- Incorpora identidad global de clientes por WhatsApp sin duplicar los perfiles comerciales de cada negocio.
- Añade usuarios SaaS internos con áreas permitidas y separación estricta de propietarios.
- Añade Punto de Venta, Usuarios del negocio, Centro de Entregas y Métodos de pago manuales.
- Integra un catálogo bancario central dominicano consumido por los negocios.
- Conecta la Página comercial con la landing pública, soporte para `{domain}` y modo mantenimiento sin detener tiendas ni paneles.
- Registra auditoría de cambios centrales, usuarios SaaS, bancos, planes y estados de propietarios.
- Simplifica Configuración del negocio para evitar duplicar Entregas y Métodos de pago como opciones paralelas.
- Añade migración `000014_saas_operations_convergence` compatible con la arquitectura PostgreSQL central actual.

# WAMERCIO 2.1.3 — Navegación limpia y checkout lateral

- Evita el parpadeo de **Mis tiendas** al refrescar: el menú ya no asume múltiples tiendas mientras se resuelve la sesión; solo aparece cuando realmente existen dos o más.
- Añade **Ver tienda** en la barra superior del panel. Con una sola tienda abre directamente el catálogo público en una pestaña nueva; con varias lleva al selector de tiendas.
- El botón **Completar pedido** ya no abre un modal central. El checkout continúa dentro del mismo carrito lateral, con botón de regreso, formulario, resumen y confirmación en un único flujo.
- Al abrir carrito o detalle de producto se bloquea el scroll de fondo para evitar desplazamientos simultáneos.
- Oculta visualmente las barras de desplazamiento redundantes en toda la interfaz sin desactivar el scroll por rueda, touch, trackpad o teclado.
- Actualiza el cache PWA a `wamercio-store-v2.1.3`.

# WAMERCIO 2.1.2 — Storefront directo y experiencia de diseño

- El catálogo público usa URL directa `/{slug}` (por ejemplo `wamercio.com/mi-mascota`); las URLs antiguas `/store/{slug}` redirigen automáticamente para no romper enlaces existentes.
- Protege slugs reservados de la aplicación (`admin`, `stores`, `catalog`, etc.) al crear o renombrar tiendas.
- Añade 46 imágenes demo locales para los productos preconstruidos y utiliza imágenes de productos como portada de categorías cuando no existe una propia.
- Nueva migración `000013_demo_product_images`, compatible con tiendas ya creadas y sin dependencias de imágenes externas.
- Mejora el storefront con cabecera/hero más terminados, señales operativas, encabezado de catálogo, conteo de opciones, destacados y pie comercial.
- Renombra los temas visuales y sus descripciones con lenguaje comercial en español orientado a República Dominicana, manteniendo los IDs internos para compatibilidad.
- Rediseña **Ajustes → Diseño y marca** con términos más claros, seis paletas listas, controles de colores explicados por uso, tipografías, encabezado, portada, categorías, tarjetas, fotos, botones, fondos y vista previa en vivo.
- `Mis tiendas` se oculta automáticamente cuando el comerciante tiene exactamente una tienda; aparece de nuevo al registrar una segunda. Se conserva un acceso compacto **Agregar otra tienda** para no bloquear el crecimiento.
- La vista previa visual usa productos demo ilustrados y el cache PWA sube a `wamercio-store-v2.1.2`.

# WAMERCIO 2.1.1 — Catálogo público y eliminación SuperAdmin

- Corrige el catálogo público: la consulta de productos ahora incluye `attributes`, que `scanProduct` ya esperaba; el desfase hacía que todos los productos se descartaran silenciosamente y la tienda mostrara “No encontramos productos”.
- El catálogo público devuelve un error explícito si una consulta o lectura de producto falla, evitando falsos catálogos vacíos.
- SuperAdmin → Tiendas incorpora eliminación definitiva con modal de confirmación y limpieza de pedidos/datos relacionados.
- SuperAdmin → Comerciantes incorpora eliminación definitiva con confirmación; elimina sus tiendas y datos relacionados sin permitir borrar cuentas `superadmin`.
- Se mantienen intactos el Theme Engine 2.1, los temas visuales y el flujo normal de archivado de tiendas desde el panel del comerciante.

# WAMERCIO 2.1.0 — Theme Engine

- Separa plantillas funcionales de temas visuales.
- Añade 8 temas profesionales: Fresh Market, Food Bold, Editorial Fashion, Beauty Soft, Luxury, Tech Modern, Industrial Pro y Minimal Shop.
- Nuevo editor Diseño y marca con colores, tipografía, header, hero, categorías, productos, botones, fondo y CSS personalizado.
- La tienda pública interpreta `visual_theme` y `theme_config` mediante design tokens.
- Las plantillas de negocio asignan un tema recomendado real sin acoplar la lógica comercial al diseño.
- Migración compatible con tiendas existentes, conservando su color principal.

# WAMERCIO 2.0.2

## Corrección de compilación

- Corrige el import faltante de `Archive` en la administración de tiendas.
- Conserva el flujo de archivado/reactivación introducido en 2.0.1.
- Revisión estática de componentes JSX para evitar referencias visuales sin importar.

# WAMERCIO 2.0.1

## Corrección de compilación

- Elimina la segunda declaración accidental de `scanProduct` en el API.
- Conserva intacto el sistema de plantillas de WAMERCIO 2.0.0 y todas las funciones heredadas de 1.9.
- Revisa las funciones Go del API y del bridge de WhatsApp para detectar redeclaraciones adicionales: 0 encontradas.

# WAMERCIO 2.0.0

## Plantillas de negocio preconstruidas

- Añade onboarding por tipo de negocio antes del registro del comerciante.
- Incluye 15 plantillas sectoriales iniciales más una plantilla genérica `Otro tipo de negocio`.
- El catálogo inicial se enfoca en plantillas comerciales reutilizables y mantiene una opción genérica extensible.
- Clona categorías, productos/servicios demo, configuración contextual, campos sectoriales y respuestas rápidas de WhatsApp al crear una tienda.
- Añade motores reutilizables `retail`, `fashion`, `food`, `catalog`, `quotation`, `services` y `wholesale`.
- `Productos` adapta textos y campos al tipo de negocio y admite atributos preconfigurados.
- `Mis tiendas` permite elegir plantilla también para tiendas adicionales.
- SuperAdmin incorpora `/admin/templates` para administrar plantillas y su contenido sin redeploy.
- Conserva todas las mejoras del flujo comercial 1.9.0.

## Base de datos

- Añade `000011_business_templates`; `000010_commerce_flow` de WAMERCIO 1.9 permanece intacta.
- Añade configuración de plantilla a tiendas, atributos sectoriales a productos y catálogo maestro de plantillas.

# WAMERCIO 1.9.0

## Cierre del flujo comercial

- Convierte WhatsApp en un punto de venta conversacional: desde el chat se pueden buscar productos, seleccionar variantes/extras, armar el pedido y enviarlo al cliente sin salir de la conversación.
- Pedidos creados desde WhatsApp quedan vinculados a la conversación y al CRM del cliente.
- Añade seguimiento público de pedidos mediante enlace seguro sin necesidad de crear una cuenta.
- Agrega comprobantes de transferencia: el cliente puede subir imagen/PDF desde el seguimiento y el comercio puede revisarlo desde Pedidos.
- Mejora los estados operativos: Pendiente, Confirmado, Preparando, Listo, En camino, Entregado/Recogido y Cancelado.
- Elimina el bloqueo de ventas por límite mensual de pedidos; WhatsApp pasa a ser una capacidad base de todos los planes.
- Dashboard enfocado en operación diaria: pedidos y ventas de hoy, pedidos por atender, WhatsApp sin leer y alerta de inventario bajo.
- Catálogo agrupa Productos/Categorías; Delivery pasa a Ajustes → Zonas de entrega y el menú diario queda más limpio.
- Añade pausa de pedidos y cumplimiento real de horarios comerciales en el checkout público.
- Añade respuestas rápidas predeterminadas por tienda para WhatsApp.
- Añade eventos en tiempo real vía Redis + Server-Sent Events para el Centro de WhatsApp, manteniendo un refresco de respaldo.
- Mensajes automáticos usan una outbox persistente con reintentos y backoff para evitar perder confirmaciones por desconexiones temporales.
- CORS utiliza `CORS_ALLOWED_ORIGINS` en lugar de permitir todos los orígenes.
- Login WhatsApp+PIN y SuperAdmin incorporan rate limiting con Redis.
- Las tiendas ya no se borran: se archivan para preservar pedidos, clientes e historial y pueden reactivarse.
- Mi cuenta concentra perfil, PIN, plan y acceso directo al soporte por WhatsApp.
- Cache PWA actualizado a `wamercio-store-v1.9`.
- Añade CI con GitHub Actions para compilar frontend, API, bridge de WhatsApp y validar Docker Compose antes de desplegar.
- Añade pruebas unitarias iniciales para normalización de WhatsApp, PIN y slugs.

## Base de datos

Incluye la migración `000010_commerce_flow`, que añade disponibilidad de pedidos, vínculo pedido↔conversación, token público de seguimiento, outbox fiable y respuestas rápidas.

# WAMERCIO 1.8.3

## Hotfix de compatibilidad con whatsmeow

- Corrige `InvoiceMessage`: se usa `note`, único texto descriptivo disponible en el protobuf actual.
- Corrige el getter de GIF de `VideoMessage`: `GetGifPlayback()`.
- Corrige `PollCreationMessageV4`, que llega envuelto en `FutureProofMessage`, desempaquetando su `Message` interno antes de leer el nombre de la encuesta.
- No incluye migraciones ni cambios de infraestructura.

# WAMERCIO 1.8.2

## WhatsApp y navegación refinados

- WhatsApp ahora ocupa el viewport del panel y elimina el desplazamiento externo duplicado; solo se desplazan la lista de chats y el lienzo de mensajes.
- Selector de tienda reubicado a la cabecera en los módulos operativos.
- La opción `Conversaciones` pasa a llamarse `WhatsApp` y utiliza un icono específico de WhatsApp.
- La vinculación técnica deja de ocupar un acceso principal y pasa a `Ajustes → Conexión`.
- Eliminado el segundo botón de `Contraer menú`; se mantiene un único control en la cabecera.
- Vista previa móvil de Ajustes reducida y fijada para funcionar como referencia constante.
- Renderizador de mensajes ampliado para imágenes, GIF/video, video circular, notas de voz, audio, documentos, stickers, ubicaciones, contactos, encuestas, reacciones, mensajes interactivos, productos/pedidos y archivos genéricos.
- El bridge clasifica más tipos del protobuf de WhatsApp antes de guardarlos.

# WAMERCIO 1.8.1

## Ajustes de experiencia operativa

- Barra lateral del comerciante ahora es contraíble y expandible, con mejor aprovechamiento del espacio de trabajo.
- Centro de conversaciones rediseñado con una experiencia mucho más cercana a WhatsApp Web.
- Ajusta el flujo de modales para evitar superposiciones cuando se cambia de resumen a edición.
- Modal de Nuevo producto pasa a una estructura de dos columnas, sin barra de desplazamiento visible.
- Ajustes incorpora vista previa en forma de móvil para validar la tienda en tiempo real.

# WAMERCIO 1.8.0

## Experiencia de tienda

- Simplifica la navegación del comerciante y elimina de la barra principal módulos de baja frecuencia.
- Rediseña Dashboard con hero operativo, accesos rápidos, métricas compactas y mejores estados vacíos.
- Moderniza globalmente modales, campos, botones, tarjetas y formularios con comportamiento mobile-first.

## Productos

- Elimina de la interfaz normal SKU, etiqueta, precio anterior, orden visual, destacado y otros campos técnicos.
- Mantiene foto, nombre, categoría, precio y descripción como flujo principal.
- Mueve inventario, variantes y extras a una sección opcional.
- Cambia listado tipo tabla por tarjetas visuales.

## Categorías

- Elimina slug, orden y URL de imagen de la interfaz.
- Añade subida directa de imagen desde el placeholder.
- Genera automáticamente el orden cuando no se envía.

## Tiendas y ajustes

- Elimina slug, color hexadecimal, URL del logo y estado técnico del formulario principal.
- Añade subida directa de logo y portada.
- Reduce Ajustes de cinco secciones a tres: Mi negocio, Ventas y entrega, Horarios.
- Oculta moneda/color/slug y conserva valores internamente.

## Delivery

- El formulario se reduce a zona y cargo.
- El tiempo estimado utiliza el valor interno por defecto si el comerciante no lo modifica.

## Catálogo público

- Nueva portada más visual.
- Categorías horizontales con imagen opcional.
- Buscador y tarjetas de producto rediseñados.
- Mejor experiencia responsive y estados vacíos.
- Cupón deja de ocupar espacio en el checkout simplificado.

## PWA

- Cache actualizado a `wamercio-store-v1.8`.

## Compatibilidad

- Sin migraciones nuevas.
- Sin cambios de `.env`.
- Sin cambios en Traefik/gateway/volúmenes.
