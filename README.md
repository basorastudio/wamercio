# WAMERCIO 1.6.1

WAMERCIO es una plataforma SaaS de comercio conversacional para República Dominicana, construida con Next.js + Go + PostgreSQL + Redis y un servicio WhatsApp propio, desplegable en Dokploy.

## Novedades 1.6.1

Esta versión convierte la bandeja de conversaciones en un verdadero centro de atención comercial inspirado en WhatsApp Web y refuerza la identidad WAMERCIO en las vinculaciones de WhatsApp.

### Centro de Conversaciones

- lista de conversaciones con búsqueda y no leídos;
- chat con diseño tipo WhatsApp Web;
- clasificación de imágenes, videos, audios, documentos, ubicación, sticker y reacción;
- panel derecho inline para datos del contacto, sin overlay ni blur en escritorio;
- panel de **Registros de atención** en la misma estructura;
- estado de atención: abierta, pendiente o cerrada;
- notas internas cronológicas;
- métricas de mensajes recibidos/enviados y archivos;
- primera y última interacción;
- enlace automático del número de WhatsApp con el CRM de Clientes;
- edición de nombre, dirección, notas y estado del cliente desde el chat;
- pedidos recientes y total comprado dentro de la ficha del contacto;
- actualización del nombre/contacto en la interfaz sin refrescar el navegador.

### Dispositivo WAMERCIO

Las nuevas vinculaciones se presentan a WhatsApp con el nombre **WAMERCIO**. El servicio mantiene reconexión automática, supervisión del canal y actividad periódica de la sesión sin forzar el estado visible “en línea”.

Las vinculaciones creadas antes de 1.6.1 conservan el nombre con el que fueron emparejadas. Para actualizar una sesión antigua, desvincúlala una vez desde WAMERCIO y vuelve a escanear el QR.

### Sin referencias técnicas en la experiencia

La interfaz, documentación comercial y estados muestran únicamente la identidad **WAMERCIO**. Los nombres internos de librerías de transporte quedan limitados al código del servicio y no forman parte de la experiencia del comerciante.

## Acceso comercial

El comerciante utiliza:

```text
WhatsApp + PIN de 4 dígitos
```

El SuperAdmin utiliza exclusivamente:

```text
/admin/login → correo + contraseña
```

## Teléfonos internacionales

Los campos de WhatsApp usan selector internacional con bandera, código de marcación, búsqueda de país y formato E.164. El país inicial usa Cloudflare `CF-IPCountry`, locale del navegador y República Dominicana como respaldo.

## Infraestructura

Se conserva la ruta estable de producción:

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000
```

No se modifican los volúmenes persistentes ni las variables `.env` actuales.

## Migraciones nuevas

```text
000008_conversation_center
```

Añade vínculo conversación-cliente, estado operativo de conversación y registros internos de atención.

Consulta:

- `docs/CENTRO_CONVERSACIONES.md`
- `docs/SESION_WHATSAPP.md`
- `docs/ARQUITECTURA.md`
- `DEPLOY_DOKPLOY.md`
