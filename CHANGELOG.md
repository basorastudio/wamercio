# WAMERCIO 2.8.4 — Identidad WhatsApp y reconocimiento de clientes

- Corrige conversaciones fantasma creadas con el propio WhatsApp del negocio. El bridge ya no toma el número de la sesión como fallback del contacto remoto y el API aplica una segunda validación defensiva por JID/teléfono.
- La migración `000034_whatsapp_registered_customer_identity` elimina conversaciones propias existentes y enlaza retroactivamente conversaciones de clientes registrados.
- Un WhatsApp con cuenta global activa en WAMERCIO se reconoce como **Cliente** desde su primera conversación, aunque tenga `0` compras. Los números no registrados continúan como **Contacto**.
- Al reconocer un cliente global se crea/enlaza su relación local con la tienda, por lo que el Centro SaaS refleja el negocio asociado sin fabricar pedidos ni métricas de compra.
- Conserva por separado el nombre real del cliente y el nombre de perfil de WhatsApp; la lista de conversaciones prioriza la identidad de cliente cuando existe.
- Actualiza las regresiones históricas para mantener separados identidad comercial y métricas de compra/cotización.

# WAMERCIO 2.8.3 — Identidad total de tienda y editor libre de portada

- Fija el menú paralelo de **Configuración** en escritorio para que permanezca visible mientras se recorre el lienzo de ajustes.
- Simplifica la vista previa lateral eliminando el nombre del preset y el texto explicativo redundante.
- Añade controles independientes para mostrar u ocultar **etiqueta superior, nombre del negocio, descripción, WhatsApp, dirección y pedido mínimo** sobre la foto de portada.
- Añade un editor visual de portada con arrastre por puntero/táctil; cada posición se guarda como coordenadas porcentuales dentro de `theme_config`, sin migraciones nuevas.
- El storefront reproduce exactamente la visibilidad y posición guardadas y conserva el diseño histórico mientras el propietario no activa la posición libre.
- Elimina el branding público de WAMERCIO del catálogo y del acceso de clientes; nombre, logo e identidad visual provienen del negocio.
- El título del navegador usa solamente el nombre del negocio y favicon/apple-touch-icon usan el logo del negocio; cuando no hay logo se genera un icono neutro con la inicial y color de la tienda, nunca la W de la plataforma.
- El `manifest.webmanifest` se resuelve por host y publica nombre, descripción, logo/icono y colores del negocio para la instalación PWA.
- El `theme-color` de navegador/PWA se genera desde el color primario del negocio en servidor y se sincroniza en cliente.
- La búsqueda móvil queda contraída por defecto a un botón de lupa; al pulsarlo abre una fila de búsqueda y puede cerrarse con el mismo botón o Escape.
- El portal del cliente hereda logo y color principal del negocio en lugar de estados visuales verdes fijos.
- El Service Worker `v2.8.3` deja de precachear el manifest y los iconos globales para evitar conservar identidad WAMERCIO en dominios de tiendas.
- Añade `test_2_8_3_store_branding.py` y `verify-2.8.3.sh`. No agrega dependencias, variables de entorno ni migraciones.

---

# WAMERCIO 2.8.2 — Hotfix de compilación frontend

- Corrige el fallo de `next build` en `components/storefront.tsx` causado por un updater funcional sobre un estado `any`, que dejaba el parámetro de `setLoyalty` sin tipado contextual bajo `strict: true`.
- Introduce `LoyaltyState` con los campos reales devueltos por `/customer/loyalty` y tipa tanto la llamada API como el estado y su actualización posterior al checkout.
- Añade `test_2_8_2_web_type_guard.py` y `verify-2.8.2.sh` para impedir que este patrón vuelva a romper la compilación de producción.
- Conserva el hotfix Go de 2.8.1, las migraciones `000032`/`000033`, el modelo de datos y las variables de entorno sin cambios.
- No agrega dependencias ni migraciones nuevas.

---

# WAMERCIO 2.8.1 — Hotfix de compilación de producción

- Corrige cuatro usos incompatibles de `pgx/v5` donde `RowsAffected()` se trataba erróneamente como una función de dos valores; `pgx` devuelve un único `int64`.
- Corrige `kds_stations.go` en validación de categorías, productos y actualización de estaciones.
- Corrige `loyalty.go` en la aplicación transaccional de canjes de puntos.
- Añade una regresión específica que bloquea futuros usos de la forma inválida `n, _ := res.RowsAffected()`.
- Añade `verify-2.8.1.sh` y conserva las migraciones `000032`/`000033` sin cambios de esquema.
- No agrega variables de entorno, dependencias ni migraciones nuevas.

---

# WAMERCIO 2.8.0 — Operación avanzada, crecimiento y fidelización

- Añade **modificadores reutilizables** con grupos, opciones, selección mínima/máxima y asignación a múltiples productos, preservando los extras históricos por producto.
- Añade **combos/bundles estructurados** sobre productos existentes, con composición inmutable en el pedido y ajuste de inventario de componentes cuando corresponde.
- Incorpora **alérgenos y atributos dietéticos** reutilizables para negocios con capacidad gastronómica.
- Incorpora **Automatizaciones WhatsApp** para promociones, reservaciones, recordatorios, cambios de estado y postventa, reutilizando el outbox existente y registrando cada ejecución.
- Amplía **Analítica** con clientes recurrentes, cancelaciones, origen de pedidos, conversión de promociones y comparación contra el período anterior.
- Añade **galería de productos** y **traducciones opcionales**, manteniendo español, `image_url` y los campos actuales como fallback compatible.
- Añade **reseñas verificadas** ligadas a pedidos completados, con moderación del comercio y exposición pública exclusiva de reseñas aprobadas.
- Añade **Fidelización por puntos** con configuración por negocio, cuentas por cliente, libro mayor auditable, acreditación idempotente y canje transaccional en checkout.
- Amplía el **KDS** con estaciones configurables y asignación por categorías o productos específicos sin duplicar pedidos.
- Completa el **Diseñador QR** con estilo general del negocio y override opcional por mesa; colores, marco, texto y logo cambian sin alterar el destino `?table=<uuid>`.
- Añade las migraciones reversibles `000032_phase2_operations` y `000033_phase3_growth_experience`.
- Añade `verify-2.8.0.sh` para ejecutar contratos de Fase 1/2/3, regresiones históricas, TypeScript, JSON/YAML, migraciones, shell y formato Go.
- No agrega variables de entorno obligatorias ni sustituye módulos existentes.

---

# WAMERCIO 2.6.0 — Promociones, Analítica, Reservaciones, QR por mesa y KDS

- Los **cupones** permiten programar fecha/hora de inicio y fin desde la interfaz, conservando compatibilidad con cupones sin vencimiento.
- Añade **Promociones** como entidad independiente del cupón: descuento automático por todo el catálogo, productos o categorías, compra mínima, vigencia, límite de usos y estado.
- El checkout calcula la mejor promoción automática y la compara con el cupón ingresado; aplica solamente el mayor descuento y guarda `promotion_id`/`promotion_name` en el pedido para trazabilidad.
- Incorpora **Analítica** por períodos de 7, 30 y 90 días con ventas, pedidos, ticket promedio, clientes, modalidades, métodos de pago, top de productos y rendimiento de promociones.
- Incorpora **Reservaciones** administrativas con agenda, creación manual, validación de capacidad y conflictos, y estados `reserved`, `confirmed`, `seated`, `completed`, `canceled` y `no_show`.
- **Gestión de mesas** genera un QR individual por mesa, permite copiar/probar/descargar el SVG y abre el storefront mediante `?table=<uuid>` con modalidad Mesa y mesa preseleccionada.
- Añade **KDS · Cocina** con columnas Nuevos / Preparando / Listos, polling ligero cada 15 segundos y avance mediante el endpoint de estados existente.
- La navegación mantiene Promociones y Analítica como herramientas horizontales; Reservaciones/KDS/Mesas aparecen solo cuando `dine_in_enabled` está activo.
- Añade la migración reversible `000031_promotions_phase1` y la suite `verify-2.6.0.sh`. No agrega dependencias ni variables de entorno.

---

## 2.5.8 · Áreas de mesas y métodos de pago por modalidad
- **Gestión de mesas** incorpora una capa de **Áreas**: el comercio crea Salón, Terraza, VIP u otras áreas y cada mesa selecciona su área mediante un selector. Una misma área puede agrupar decenas de mesas y el listado muestra cantidad de mesas y capacidad acumulada.
- Las mesas históricas se preservan mediante una migración automática a **Área principal**; los nombres de mesa pueden repetirse en áreas distintas sin perder reservas existentes.
- El acceso **Gestión de mesas** usa `dine_in_enabled` desde la carga inicial de tiendas y conserva el estado de navegación localmente para evitar el parpadeo al refrescar la aplicación.
- **Métodos de pago** añade **Disponibilidad por modalidad** para configurar por separado **Delivery / Recoger / Mesa**, respetando los interruptores globales de Efectivo, Tarjeta en terminal y Transferencia electrónica.
- La tienda pública filtra los métodos de pago en tiempo real al cambiar de modalidad y el backend vuelve a validar la combinación al confirmar el pedido.
- Añade la migración `000030_table_areas_payment_rules` y regresiones específicas para áreas, navegación y reglas de pago. No requiere variables de entorno nuevas.


## 2.5.8 · QR público y alcance territorial del negocio
- Añade un QR real debajo de la vista previa móvil en **Configuración → Mi negocio**, generado con la URL pública actual del catálogo para abrirlo directamente desde un teléfono.
- Incorpora **Alcance del negocio** con los modos **Nacional / Provincial / Municipal** y persistencia mediante `stores.service_scope`.
- El registro y la edición de direcciones de clientes adaptan los selectores territoriales al alcance: Nacional permite provincia, municipio/distrito y barrio; Provincial fija la provincia del negocio; Municipal fija provincia y municipio/distrito.
- El backend normaliza las partes fijas de la dirección según el negocio y el checkout rechaza direcciones guardadas que queden fuera de su alcance configurado.
- Elimina el aviso redundante **Gestión de mesas habilitada** de Ventas y entrega; la administración permanece centralizada en **Gestión de mesas**.
- Añade la migración `000029_store_service_scope` y regresiones específicas para alcance territorial y QR. No requiere variables de entorno nuevas.


## 2.5.8 · Punto de Venta fijo y filtros por categorías
- La barra de búsqueda del POS permanece visible debajo de la cabecera mientras se recorre el catálogo.
- Añade chips dinámicos de categorías (`Todos` + categorías activas con productos) y combina el filtro con la búsqueda por nombre, código o descripción.
- La **Venta actual** ocupa el lateral de escritorio desde la cabecera hasta el borde inferior del viewport; el contenido interno puede desplazarse sin mover el panel y el total/CTA permanecen accesibles.
- Elimina la tarjeta redundante **Actividad / Pedidos recientes** y deja de solicitar esos pedidos únicamente para esa sección.
- Añade una regresión específica del espacio de trabajo POS a `verify-2.5.8.sh`.
- No requiere migraciones ni nuevas variables de entorno.


## 2.5.8 · URLs compactas y acceso unificado
- Los nuevos identificadores públicos de negocios eliminan separadores entre tipo y nombre: `Pizzería Demo` genera `pizzeriademo`, disponible como acceso corto `wamercio.com/pizzeriademo` y subdominio `pizzeriademo.ltd.do`.
- Los slugs existentes no se renombran automáticamente para no romper enlaces previamente compartidos.
- La cabecera pública fusiona **Acceder** y **Registrarme** en una sola acción **ACCESO**, que abre el flujo progresivo existente de autenticación/registro.
# WAMERCIO 2.5.8 — Auditoría integral de coherencia y comercio conversacional

- Unifica las capacidades del negocio mediante `business_engine` + `template_config` para que catálogo, tienda, checkout, POS, entregas, WhatsApp asistido y backoffice respondan al mismo modelo.
- Variantes, adicionales, inventario, Delivery, Recoger, Mesa/Reserva, citas, cotización, personalización, mayorista y campos dinámicos de checkout se muestran y validan únicamente cuando la plantilla los soporta.
- El backend aplica las mismas restricciones que la interfaz, evitando activar capacidades no permitidas mediante llamadas manipuladas.
- Introduce flujos contextuales `order`, `reservation` y `quote`; las solicitudes de cotización usan `pending_quote`, no exigen forma de pago anticipada y conservan sus campos específicos.
- Corrige la distinción **Clientes / Contactos**: una cotización pendiente no convierte por sí sola un contacto en cliente ni incrementa compras, ingresos o métricas comerciales.
- Mejora **Pedidos y solicitudes**, **Actividad reciente**, el portal global del cliente y el historial de conversaciones para identificar Pedido / Reserva / Solicitud sin duplicidades de etiquetas.
- Amplía **SuperAdmin → Tipos de negocio** con las capacidades existentes de la plataforma y campos dinámicos de checkout, evitando configuraciones dispersas.
- Añade `000026_business_capabilities_coherence` y `000027_quote_customer_metrics`, preservando capacidades explícitas existentes y corrigiendo estadísticas históricas afectadas por cotizaciones.
- Integra nuevas regresiones de capacidades, flujos contextuales, métricas de cotización y coherencia global en `verify-2.5.8.sh`.
- No agrega variables de entorno nuevas.

---

# WAMERCIO 2.5.8 — Sincronización WhatsApp, Mesas y POS asistido

- WhatsApp permite elegir **Sincronización manual** o **Automática** y limitar el historial por **Fecha desde / Fecha hasta**. Una vinculación nueva ya no importa silenciosamente todo el historial: el full sync queda desactivado y los rangos se respetan al solicitar páginas antiguas.
- La sincronización manual puede iniciarse desde **Ajustes → Conexión → Sincronización de mensajes** y muestra estado, última ejecución y errores. Los chats no directos continúan excluidos.
- **Ventas y entrega** incorpora **Mesas y reservas**: activación por negocio, duración de reserva, creación/edición/archivo de mesas y capacidad por mesa.
- La tienda pública añade la modalidad **Mesa / Reservar y comer aquí**, fecha/hora, cantidad de personas y mesa disponible, con validación de capacidad y conflictos antes de confirmar el pedido.
- Pedidos y el portal del cliente muestran la mesa, fecha/hora y cantidad de personas cuando el pedido es para consumir en el negocio. Cancelar o completar el pedido libera/cierra la reserva asociada.
- El **Punto de Venta** ahora muestra tarjetas de producto con imagen, descripción, disponibilidad y precio; al seleccionar un producto abre su ficha con variantes, adicionales y cantidad antes de agregarlo a la venta.
- El POS incorpora **Buscar cliente**, selección de clientes existentes y mantiene nombre/WhatsApp manual como alternativa. Las ventas guardan variante y adicionales en el detalle del pedido.
- Se añade la migración `000025_whatsapp_sync_tables_pos`. No requiere variables de entorno nuevas.

---

# WAMERCIO 2.5.8 — Compra directa, opciones en tarjetas y detalle de pedidos

- Recupera **Mi compra** en la cabecera de escritorio con contador, manteniendo **Mi compra** en la navegación inferior móvil.
- Renombra el CTA inicial del producto de **Agregar a mi pedido** a **Comprar**; al editar una línea existente se conserva **Actualizar mi compra**.
- Convierte **Opciones** y **Adicionales** del modal de producto en tarjetas de dos columnas/filas, usando el borde y un solo cotejo como estado seleccionado para eliminar controles visuales duplicados.
- Sustituye **Ver negocio** por **Ver detalles** en **Mis pedidos** y abre un detalle del pedido dentro del panel del cliente, cargado desde `/customer/orders/{id}`.
- El detalle muestra productos, variantes, adicionales, entrega/recogida, método de pago, cambio en efectivo cuando aplica, indicaciones y desglose de totales.
- Actualiza las regresiones del carrito para permitir el acceso **Mi compra** de escritorio sin reintroducir el antiguo drawer lateral.
- No requiere migraciones ni nuevas variables de entorno.

---

# WAMERCIO 2.5.8 — Pulido móvil de catálogo, carrito y pagos

- Convierte las tarjetas informativas **Recibiendo pedidos / Delivery / Compra fácil** en un carrusel horizontal automático en móvil, manteniéndolas en una sola fila de tres columnas en escritorio.
- Sustituye el antiguo rótulo superior **Mi pedido** y renombra el acceso móvil como **Mi compra**; una revisión posterior recupera **Mi compra** también en escritorio.
- Compacta las líneas del carrito en móvil para aprovechar mejor el ancho y reducir espacios vacíos.
- Mueve **3 · Notas** debajo de los productos del carrito, separándolo del bloque de modalidad/pago.
- Reestructura el pie de cada tarjeta de producto para reservar una columna fija al botón `+`/cotejo y evitar que tape el precio.
- El modal de producto deja de usar esquinas redondeadas exteriores para una presentación más limpia y directa.
- Reordena los métodos de pago como **Efectivo → Tarjeta en terminal → Transferencia electrónica** en checkout, configuración, POS y creación de pedidos desde conversaciones.
- Añade regresiones específicas para estos comportamientos. No requiere migraciones ni nuevas variables de entorno.

---

# WAMERCIO 2.5.8 — Experiencia cliente refinada y cambio en efectivo

- Refina la aplicación cliente tomando como referencia el patrón móvil de ColmaPro: navegación inferior **Catálogo / Mi pedido / Pedidos / WhatsApp**, tarjetas compactas y continuidad entre catálogo, carrito, pedidos y perfil.
- Mantiene el carrito como página completa y reduce la columna de checkout en escritorio para una lectura más limpia, conservando el tema visual configurable de cada negocio.
- Implementa **¿Necesita cambio?** únicamente para pedidos **Delivery + Efectivo**. El cliente indica **Sí / No**, puede elegir montos sugeridos o **Otro**, y WAMERCIO calcula el **Vuelto estimado** antes de confirmar.
- El checkout bloquea la confirmación cuando el cliente solicita cambio pero no ha indicado un monto superior al total.
- Guarda `cash_change_requested` y `cash_tendered` en cada pedido mediante la migración `000024_cash_change_checkout`.
- El detalle administrativo del pedido, el seguimiento público y el centro de **Entregas** muestran la información de cambio para que el negocio y el repartidor sepan con cuánto pagará el cliente.
- La navegación móvil del panel del cliente adopta el mismo patrón de acceso rápido y conserva acceso al perfil/cierre de sesión desde la cabecera.
- No añade nuevas variables de entorno.

## Despliegue

Requiere ejecutar la migración `000024_cash_change_checkout` y reconstruir/redeployar API y Web. WhatsApp Bridge no requiere cambios para esta entrega.

---

# WAMERCIO 2.5.8 — Checkout limpio y métodos de pago refinados

- Elimina del carrito los textos redundantes **Finalizar pedido / Entrega y forma de pago** y la tarjeta duplicada con la identidad del cliente.
- Elimina el selector manual **Zona de delivery** del checkout; el backend deja de exigir una zona explícita y conserva compatibilidad con clientes antiguos que todavía envíen `shipping_zone_id`.
- Sustituye la etiqueta **Pago al recibir** por **Tarjeta en terminal** en storefront, pedidos, POS, conversaciones y configuración, manteniendo el identificador interno existente para no requerir migraciones.
- Renombra **Transferencia manual** como **Transferencia electrónica** y unifica esa denominación en las superficies de compra.
- Convierte **Tipo de cuenta** en un selector restringido a **Ahorros** o **Corriente** para evitar valores inconsistentes.
- No añade migraciones ni variables de entorno.

---

# WAMERCIO 2.5.8 — Carrito full-page simplificado

- Editar un producto desde **Mi pedido** abre su ficha directamente sobre la página del carrito; el catálogo ya no reaparece detrás del modal.
- Elimina el paso intermedio **Continuar con mi pedido**: modalidad, dirección, zona, forma de pago, notas y total están visibles desde el primer momento.
- Elimina la acción duplicada **Volver al catálogo** y conserva una sola acción **Seguir comprando** en la cabecera del pedido.
- Reorganiza el carrito al patrón de **Mi Funda** de ColmaPro: cabecera propia, productos como tarjetas independientes y checkout completo en una columna lateral `sticky` en escritorio.
- En móvil conserva un flujo vertical de una sola columna y mantiene oculto el menú inferior mientras se revisa el pedido.
- Añade eliminación directa de líneas del carrito y mantiene edición de variantes, adicionales, cantidades y productos por peso/monto.
- Los clientes sin sesión pueden ver las opciones del checkout y reciben una invitación contextual para identificarse cuando necesitan sus direcciones guardadas.
- No requiere migraciones, cambios de API ni nuevas variables de entorno.

---

# WAMERCIO 2.5.8 — Carrito como página completa

- Sustituye el carrito lateral por una página completa dedicada, inspirada en la experiencia de compra de ColmaPro.
- En escritorio organiza productos a la izquierda y resumen/checkout a la derecha; en móvil el flujo pasa a una sola columna.
- Mantiene edición de productos, cantidades, venta por libra/monto, delivery/recogida, zonas, pagos, notas y resumen total.
- El panel de resumen permanece visible con `sticky` en escritorio sin bloquear el desplazamiento natural de la página.
- Oculta la navegación móvil inferior mientras el cliente está en la página del pedido para evitar controles duplicados.
- Elimina por completo el drawer lateral y su overlay móvil.
- Mantiene la corrección que oculta la tarjeta de una dirección mientras esa misma dirección se está editando.
- Actualiza las regresiones de storefront para exigir la nueva experiencia full-page.

# WAMERCIO 2.5.8 — Dirección sin duplicar y carrito simplificado

- Al editar una dirección guardada en **Mi perfil**, la tarjeta de esa misma dirección se oculta mientras el formulario está abierto, evitando la sensación de que se están editando dos registros distintos.
- El carrito adopta una estructura más clara inspirada en el flujo de ColmaPro: productos en tarjetas, modalidad de pedido, dirección/resumen de recogida, método de pago con selección directa, notas y resumen final.
- La dirección seleccionada se muestra como una tarjeta compacta con acción **Cambiar**, en lugar de mantener siempre un selector largo visible.
- Los métodos de pago se muestran como opciones visuales seleccionables y la transferencia conserva sus datos bancarios cuando corresponde.
- El resumen de subtotal, delivery y total queda agrupado en una única zona fija antes de **Confirmar pedido**, evitando duplicidades visuales.
- El panel del carrito en escritorio se amplía para mejorar lectura y jerarquía sin alterar el comportamiento móvil.
- No requiere migraciones, cambios de API ni nuevas variables de entorno.

---

# WAMERCIO 2.5.8 — Perfiles WhatsApp e identidad completa de usuarios

- Las sesiones WhatsApp vinculadas de cada negocio y la sesión global del SuperAdmin muestran ahora nombre de WhatsApp, número e imagen de perfil, conservando el estado de conexión existente.
- El nombre de la cuenta vinculada prioriza `BusinessName`/`PushName` del dispositivo whatsmeow y conserva el fallback al caché de contactos.
- **Propietarios**, **Clientes globales** y **Mi cuenta** muestran la foto y el nombre de WhatsApp sin reemplazar el nombre legal/registrado de la persona.
- **Mi cuenta** incorpora Cédula, nombre, apellido, fecha de nacimiento y género; los datos de identidad permanecen protegidos cuando la Cédula ya fue verificada.
- El formulario **Nuevo usuario** se reorganiza como WhatsApp → Cédula → Nombre → Apellido → Fecha de nacimiento → Género → Rol/Panel/PIN, valida WhatsApp e identidad y bloquea los datos verificados.
- Los campos de WhatsApp reutilizan el componente `PhoneInput` basado en `intl-tel-input`, con prefijo internacional, bandera y validación.
- Los usuarios internos del negocio pueden conservar nombre/foto de WhatsApp e información de identidad para mostrarlos en el listado.
- Añade la migración `000023_whatsapp_identity_user_profiles` y pruebas de regresión para las nuevas superficies.

## Despliegue

Requiere ejecutar la migración `000023_whatsapp_identity_user_profiles` y reconstruir/redeployar API, Web y WhatsApp Bridge. No añade nuevas variables de entorno.

---

# WAMERCIO 2.5.8 — Acceso del propietario y perfil WhatsApp del cliente

- El botón **Entrar** de cada tienda distingue ahora al propietario del negocio antes de iniciar el flujo de cliente. Si el WhatsApp corresponde al propietario de esa tienda, muestra su PIN y abre el panel administrativo en `wamercio.com`.
- Se incorpora un handoff SSO de un solo uso y corta duración para trasladar de forma segura la sesión del propietario desde el dominio/subdominio de la tienda al panel central, sin compartir cookies entre dominios.
- Después de validar la Cédula durante el registro del cliente quedan bloqueados Cédula, nombre, apellido, fecha de nacimiento y género; el backend continúa tomando como autoritativos los datos devueltos por Identidad Dominicana.
- Los clientes globales guardan el nombre y la foto de perfil de WhatsApp. La sincronización utiliza primero la sesión WhatsApp global de plataforma y, cuando corresponde, la sesión del negocio como fallback.
- La foto sincronizada se muestra en el botón de cuenta de la tienda, navegación móvil, cabecera del panel del cliente y dentro de **Mi perfil**.
- La implementación reutiliza `GetProfilePictureInfo` de whatsmeow y copia la imagen al volumen compartido de medios de WAMERCIO para no depender de URLs temporales de WhatsApp.
- Añade la migración `000022_owner_access_customer_profiles` y una prueba de regresión específica para acceso por rol, bloqueo de identidad, SSO del propietario y foto de perfil.

## Despliegue

Requiere ejecutar la migración `000022_owner_access_customer_profiles` y reconstruir/redeployar API, Web y WhatsApp Bridge. No añade nuevas variables de entorno.

---

# WAMERCIO 2.5.8 — Hotfix de compilación Next.js de Página comercial

- Corrige el fallo de `next build` provocado por exportar `landingDefaults` desde `app/admin/landing/page.tsx`.
- `landingDefaults` permanece como constante interna del módulo y conserva exactamente el mismo comportamiento del editor y del botón **Restaurar valores base**.
- Añade una prueba de regresión para impedir que un export no permitido vuelva a romper una página del App Router.
- Sin cambios de interfaz, API, base de datos, migraciones ni variables de entorno.

---

# WAMERCIO 2.5.8 — Identidad protegida y landing editable completa

- Después de verificar una Cédula, los campos de identidad recuperados (Cédula, nombre, apellido, fecha de nacimiento y género) quedan bloqueados para evitar modificaciones manuales.
- El **WhatsApp comercial** se hereda automáticamente del WhatsApp del propietario al crear un negocio; continúa siendo editable si el negocio utiliza otro número.
- La sección **Página comercial** separa el desplazamiento del editor y de **Vista previa** en escritorio, evitando que el visor se mueva junto con el lienzo.
- Se amplía el editor de la landing para administrar navegación, hero, beneficios, cómo funciona, planes, demo, bloque final, footer y mantenimiento, incluyendo los textos de las simulaciones visuales.
- No requiere migraciones, cambios de API ni variables de entorno.

---

# WAMERCIO 2.5.8 — Scroll independiente en Configuración SaaS

- En escritorio, el menú interno de **Configuración** y el lienzo de contenido quedan limitados al alto disponible de la ventana.
- El menú lateral de secciones ahora desplaza su propio contenido sin arrastrar verticalmente el lienzo de la sección activa.
- El lienzo solo obtiene desplazamiento vertical cuando su contenido realmente supera el espacio disponible; las secciones cortas permanecen visualmente estables.
- En móvil y tablet se conserva el flujo vertical natural existente.
- No requiere migraciones, cambios de API ni nuevas variables de entorno.

---

# WAMERCIO 2.5.8 — Hotfix de compilación Dokploy

- Corrige el `sid` no utilizado en `saveConversationCustomer`, detectado por el compilador Go durante el build de la API.
- Corrige el uso de `pgx`/`pgconn.CommandTag.RowsAffected()`: devuelve un único `int64`, no `(valor, error)`.
- Añade una prueba de regresión específica para ambos errores y la integra en `verify-2.5.8.sh`.
- No cambia base de datos, migraciones, variables de entorno, estilo visual ni comportamiento funcional.

---

# WAMERCIO 2.5.8 — Clientes, contactos y perfiles de WhatsApp

- La sección **Clientes** separa ahora compradores reales de contactos de WhatsApp mediante las pestañas **Clientes | Contactos**.
- Un contacto se considera **Cliente** únicamente después de registrar al menos un pedido no cancelado; los chats de personas que todavía no han comprado permanecen como **Contacto**.
- La bandeja de conversaciones incorpora filtros tipo chip para **Todos**, **Clientes**, **Contactos** y **No leídos**, manteniendo el mismo patrón visual de WAMERCIO.
- Se sincronizan y muestran el nombre y la foto de perfil de WhatsApp en la bandeja, el encabezado del chat, el panel lateral y los listados de clientes/contactos.
- La API deja de crear clientes automáticamente al recibir un mensaje de WhatsApp y mantiene los datos CRM básicos del contacto en la conversación hasta que exista una compra.
- La migración `000021_customer_contact_profiles` preserva datos de contactos heredados, desvincula falsos clientes, reconcilia por teléfono los compradores reales y recalcula estadísticas ignorando pedidos cancelados.
- Las compras Web, POS y las creadas desde el chat enlazan automáticamente la conversación correspondiente con el cliente real por WhatsApp/teléfono.
- La obtención de perfiles desde WhatsApp se limita a cuatro solicitudes concurrentes durante sincronizaciones grandes para evitar sobrecargar la sesión.

## Despliegue

Requiere ejecutar la migración `000021_customer_contact_profiles` y reconstruir/redeployar API, Web y WhatsApp Bridge. No añade nuevas variables de entorno.

---

# WAMERCIO 2.5.8 — Higiene de WhatsApp y sesión vinculada

- La bandeja de WhatsApp ahora admite únicamente conversaciones directas con personas; grupos, estados, listas de difusión, canales/newsletters y otros JID no directos se descartan tanto en tiempo real como durante `HistorySync`.
- La API aplica una segunda barrera para impedir que conversaciones no directas entren o vuelvan a mostrarse aunque el bridge envíe un evento inesperado.
- La migración `000020_whatsapp_direct_chat_hygiene` elimina conversaciones no directas ya importadas; sus mensajes asociados se eliminan mediante las relaciones existentes.
- El flujo QR queda ligado a la instancia concreta de sesión: un QR anterior ya no puede marcar como `timeout` una vinculación nueva.
- Se separa **vinculado** de **conectado**. Una caída temporal del socket se muestra como **Reconectando** sin obligar a escanear otro QR.
- `LoggedOut` representa la desvinculación real y limpia la asociación persistente; `Disconnected` conserva la sesión para la reconexión automática.
- Los paneles de tienda y SuperAdmin mantienen visible la sesión vinculada durante una reconexión y conservan la misma estructura visual.

---

# WAMERCIO 2.5.8 — Corrección de compilación API

## 2.5.8 - Tarjeta de producto en dos columnas y cantidades unitarias

- Reestructura el detalle del producto en dos columnas en tablet/escritorio: imagen a la izquierda y datos/opciones/acciones a la derecha; en móvil conserva el apilado vertical.
- Corrige la cantidad inicial de productos unitarios para que comience en 1 y reserve incrementos fraccionarios para productos vendidos por peso.
- Migra automáticamente carritos locales antiguos que hayan guardado cantidades fraccionarias erróneas en productos unitarios.


- Corrige `undefined: strconv` en `services/api/internal/httpapi/server.go` agregando el import requerido por `formatOrderQuantity`.
- Sin cambios de base de datos, ENV, routing ni funcionalidad.

# WAMERCIO 2.5.6 — Flujo natural de compra

## Storefront

- Agregar o actualizar un producto ya no abre el carrito automáticamente; el cliente continúa recorriendo el catálogo y recibe una confirmación breve.
- Las tarjetas muestran cuánta cantidad del producto ya está en el pedido.
- Cuando un producto tiene una sola configuración en el carrito, abrirlo carga esa selección y permite **Actualizar mi pedido**.
- Las líneas del carrito pueden editarse con el mismo detalle del producto; si al cambiar opciones una línea coincide con otra, WAMERCIO las fusiona en lugar de duplicarlas.
- Los productos con variantes/adicionales permiten **Agregar otra combinación** sin perder la configuración existente.
- Se incorpora venta por libra: el comercio puede activar **Vender por libra**, definir incremento/mínimo y permitir compra por **Monto**.
- Las cantidades decimales se conservan hasta el checkout y se formatean correctamente en notificaciones de pedido.
- Se mantiene el patrón mobile-first: detalle como bottom sheet en móvil, modal centrado en escritorio; carrito modal en móvil/tablet y panel estructural en escritorio.

## Despliegue

No requiere migraciones ni variables nuevas. Rebuild + Redeploy.

---

# WAMERCIO 2.5.5 — Storefront progresivo y carrito estructural

## Experiencia del cliente

- El número de WhatsApp se resuelve automáticamente al quedar válido; ya no existe un botón **Continuar** en el primer paso.
- Si la cuenta existe, WAMERCIO muestra inmediatamente el PIN. Si no existe, valida WhatsApp y abre el formulario de registro.
- La búsqueda se mueve a la barra superior y funciona como menú contextual predictivo: no filtra ni altera el catálogo visible.
- Al seleccionar un resultado de búsqueda se abre directamente la ficha del producto.
- La barra superior deja de mostrar la dirección del negocio y conserva una jerarquía más limpia.
- Las tarjetas de producto se refinan con alturas consistentes, mejor jerarquía, estados de foco y precio inicial calculado desde variantes cuando corresponde.
- En escritorio el carrito deja de usar un overlay: se integra como panel lateral y el catálogo se reajusta para seguir agregando productos.
- En móvil y tablet el carrito conserva la interacción modal adecuada al espacio disponible.

## Despliegue

No requiere migraciones ni variables nuevas. Conserva el ENV de WAMERCIO 2.5.4 y realiza Rebuild + Redeploy.

---

# WAMERCIO 2.5.4 — Routing exacto de tiendas `*.ltd.do`

## Corrección

- Las tiendas activas ya no dependen de un router Traefik `HostRegexp` genérico.
- `domain-router` consulta `stores.slug` y publica un router `Host(...)` exacto para cada `https://{slug}.ltd.do`.
- Cada router HTTPS usa `certResolver: letsencrypt`, permitiendo certificado TLS individual por tienda sin depender de un certificado wildcard del origen.
- Los dominios personalizados activos continúan publicándose por el mismo mecanismo exacto.
- Se elimina el router wildcard HTTP/HTTPS de la configuración base de Traefik; el wildcard se mantiene donde corresponde: DNS `*.ltd.do`.
- `domain-router` respeta los subdominios reservados configurados en Centro SaaS y nunca publica una tienda sobre `cliente.ltd.do`, `proyecto.ltd.do`, `geo.ltd.do`, etc.
- Se elimina automáticamente el archivo dinámico heredado `wamercio-custom-domains.yml` al publicar la nueva configuración `wamercio-store-hosts.yml`.

## Despliegue

No requiere migraciones ni variables nuevas. Conserva `TENANT_ROOT_DOMAIN=ltd.do`, el DNS wildcard `*.ltd.do` y realiza Rebuild + Redeploy.

### 2.5.8 hotfix — conflicto de ruta dinámica compacta
- Se elimina la ruta raíz duplicada `[storeSlug]`.
- Se reutiliza `[slug]` como único segmento dinámico raíz para `wamercio.com/{slug}`.
- `[slug]` actúa solamente como acceso corto de la plataforma y redirige a `https://{slug}.ltd.do`.
- Se agrega una regresión que impide volver a introducir dos nombres distintos de slug al mismo nivel del App Router.

---

## WAMERCIO 2.5.8 — POS estructural, menú contextual de WhatsApp y Gestión de mesas

### Punto de Venta

- **Venta actual** pasa a ser un rail estructural fijo del lado derecho, desde la misma línea superior de la cabecera hasta el pie de la ventana.
- La cabecera reserva el ancho del rail para evitar solapamientos con el selector de negocio y las acciones del panel.
- Las tarjetas del catálogo se compactan para aprovechar el espacio: en escritorios amplios se muestran **5 columnas con el menú desplegado** y **6 columnas con el menú plegado**.
- Se conserva la barra de búsqueda y los chips de categorías fijos durante el desplazamiento del catálogo.

### WhatsApp

- Se elimina la cabecera genérica de WAMERCIO dentro del Centro de conversaciones para que el chat utilice toda la altura disponible.
- El selector de negocio se integra en la propia bandeja de conversaciones.
- Se agrega menú contextual `⋮` por conversación con **Vaciar chat**, **Exportar chat**, **Cerrar chat**, **Bloquear/Desbloquear** y **Eliminar chat**.
- Bloquear un contacto impide que nuevos mensajes entrantes se incorporen a WAMERCIO hasta desbloquearlo y deshabilita el compositor local durante el bloqueo.
- Vaciar elimina el historial local de mensajes sin borrar el contacto; eliminar borra la conversación local completa y conserva pedidos históricos mediante la relación existente `ON DELETE SET NULL`.

### Gestión de mesas

- La administración de mesas sale de **Configuración → Ventas y entrega** y pasa a una sección propia **Gestión de mesas**.
- La opción aparece dinámicamente en la barra lateral únicamente cuando **Mesas y reservas** está habilitado para el negocio activo.
- La nueva pantalla permite crear, editar y archivar mesas, administrar capacidad y configurar la duración estándar de las reservas.

No se agregan migraciones ni variables de entorno nuevas en esta revisión.
