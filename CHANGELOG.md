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
