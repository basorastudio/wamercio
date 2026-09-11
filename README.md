# WAMERCIO 1.5.0

WAMERCIO es una plataforma SaaS de comercio conversacional para República Dominicana, construida con Next.js + Go + PostgreSQL + Redis + whatsmeow y desplegable en Dokploy.

## WhatsApp-first 1.5.0

Esta versión simplifica el acceso y todos los flujos telefónicos de la plataforma:

- integración oficial `intl-tel-input` mediante su wrapper React;
- bandera y código de marcación visibles automáticamente;
- selección automática del país usando `CF-IPCountry` de Cloudflare, con respaldo por locale del navegador y República Dominicana;
- formato internacional progresivo y envío del número completo en formato E.164 desde los formularios; el backend mantiene una representación canónica para autenticación;
- buscador de países en español;
- selector adaptativo: desplegable en escritorio y experiencia optimizada para móvil;
- validación de longitud/número antes de enviar formularios;
- PIN de acceso representado por 4 campos numéricos independientes con avance automático, retroceso y pegado de código;
- eliminado el campo de repetir PIN del alta comercial;
- eliminado el correo de comerciantes, tiendas, clientes y pedidos. El correo queda reservado exclusivamente al SuperAdmin SaaS.

## Acceso comercial

En `https://wamercio.com/` el usuario introduce su WhatsApp una sola vez:

1. si ya existe, WAMERCIO muestra los 4 campos del PIN y accede al completar el cuarto dígito;
2. si no existe, muestra el registro corto: nombre, negocio y un único PIN de 4 dígitos;
3. el código de país y la bandera se determinan automáticamente, pero el usuario puede cambiarlos desde el selector.

El mismo componente internacional de teléfono se utiliza en los campos de WhatsApp del perfil, comercios, ajustes, checkout público y gestión de acceso desde SuperAdmin.

## SuperAdmin

El SuperAdmin continúa separado en:

`https://wamercio.com/admin/login`

Solo el SuperAdmin utiliza correo + contraseña. Los comerciantes no utilizan correo para autenticación ni gestión comercial.

## Migración 000007

`000007_no_merchant_email` elimina de la base de datos los campos de correo heredados de tiendas, clientes y pedidos, y limpia el correo de usuarios que no sean SuperAdmin. Los valores anteriores no se restauran porque WAMERCIO pasa a operar de forma WhatsApp-first.

## Infraestructura

Se conserva sin cambios la ruta estable de producción:

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000
```

No se modifican volúmenes, secretos ni la arquitectura de Dokploy.
