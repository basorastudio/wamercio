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
