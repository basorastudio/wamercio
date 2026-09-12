# WAMERCIO 1.7.2

WAMERCIO es una plataforma SaaS de comercio conversacional construida con Next.js, Go, PostgreSQL, Redis y un servicio WhatsApp multisesión propio. Esta versión amplía el Centro de Conversaciones para trabajar con medios reales y añade un WhatsApp independiente para soporte del SuperAdmin.

## WhatsApp como único canal comercial

La tienda ya no muestra un campo separado de teléfono. El único canal de contacto del comercio es **WhatsApp**, con selector internacional, bandera y número normalizado. Los campos internos heredados se conservan únicamente cuando son necesarios para compatibilidad de datos, pero no forman parte de la experiencia de usuario.

## WhatsApp completo en conversaciones

La bandeja comercial y el centro de soporte SaaS ahora procesan y muestran:

- texto y texto extendido;
- imágenes y stickers;
- videos, incluidos videos circulares/PTV;
- audios/notas de voz;
- documentos;
- ubicación y ubicación en vivo;
- contactos;
- reacciones;
- encuestas como evento de conversación;
- estados de entrega/lectura y marcado como leído.

Las imágenes, videos, audios y documentos recibidos se descargan al volumen persistente de WAMERCIO y se renderizan dentro del chat. También se pueden enviar imágenes, videos, audios y documentos desde el panel.

## Sesión vinculada

El dispositivo se presenta a WhatsApp como **WAMERCIO**. Al conectar o reconectar se refuerza el estado no pasivo, se registra una actividad breve y se mantienen recibos de entrega activos sin dejar al comerciante permanentemente “en línea”. El cliente mantiene reconexión automática y supervisa los keep-alives.

La advertencia de inactividad que decide mostrar WhatsApp es controlada por el propio servicio de WhatsApp. WAMERCIO implementa las señales de actividad disponibles en la API multidevice, pero no puede garantizar que el servidor de WhatsApp nunca muestre una advertencia de inactividad.

## Soporte por WhatsApp para SuperAdmin

El SuperAdmin dispone de una sesión WhatsApp independiente en:

```text
/admin/whatsapp
```

Desde allí puede vincular el número oficial de soporte WAMERCIO, ver todos los comerciantes, iniciar conversaciones, responder mensajes y enviar/recibir medios. El panel comercial muestra un botón **Abrir WhatsApp** en Centro de soporte cuando el número oficial está conectado.

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

No se cambian las variables `.env` ni los volúmenes existentes.

## Migración nueva

```text
000009_whatsapp_full_support
```

Añade metadatos de medios a los mensajes, crea el Centro WhatsApp de soporte SaaS y deja `stores.whatsapp` como canal comercial visible/canónico.

Consulta también:

- `docs/WHATSAPP_COMPLETO_Y_SOPORTE.md`
- `docs/CENTRO_CONVERSACIONES.md`
- `docs/SESION_WHATSAPP.md`
- `DEPLOY_DOKPLOY.md`


## Hotfix 1.7.1

Corrige el contrato de registro de comercios: el backend vuelve a aceptar el campo interno `phone`, que representa el número de WhatsApp normalizado enviado por el onboarding. Este campo no reaparece como campo visual de “Teléfono”; la interfaz sigue mostrando únicamente WhatsApp.
