# Despliegue WAMERCIO 1.9.0 en Dokploy

WAMERCIO 1.9.0 consolida el flujo de comercio conversacional. La actualización mantiene los volúmenes y la infraestructura de la rama 1.8.x y añade la migración `000010_commerce_flow`.

## Antes del Rebuild

Conserva tu `.env` actual. Verifica especialmente:

```env
APP_URL=https://wamercio.com
NEXT_PUBLIC_APP_URL=https://wamercio.com
CORS_ALLOWED_ORIGINS=https://wamercio.com,https://www.wamercio.com
REDIS_URL=redis://redis:6379/0
```

No es necesario crear nuevas variables para las funciones incluidas en 1.9.0.

## Actualización

Reemplaza el contenido del repositorio por esta versión y ejecuta:

```bash
git add .
git commit -m "feat: WAMERCIO 1.9 close conversational commerce flow"
git push
```

En Dokploy pulsa **Rebuild**.

**No uses Fresh Volumes.**

El API aplicará automáticamente:

```text
000010_commerce_flow
```

La migración conserva pedidos, productos, clientes, conversaciones y sesiones existentes. Las tiendas eliminadas desde la interfaz pasan a archivarse en lugar de perder su historial.

## Pruebas recomendadas

Después del despliegue comprueba:

```text
https://wamercio.com/
https://wamercio.com/dashboard
https://wamercio.com/conversations
https://wamercio.com/orders
https://wamercio.com/catalog/products
https://wamercio.com/settings/store
https://wamercio.com/settings/whatsapp
https://wamercio.com/admin/login
```

### Flujo principal

1. Abre una conversación de WhatsApp.
2. Pulsa el carrito y agrega uno o más productos.
3. Selecciona delivery o recogida, método de pago y crea el pedido.
4. Verifica que el pedido aparezca en **Pedidos** y que el cliente reciba el resumen con su enlace de seguimiento.
5. Abre el enlace público `/order/<token>` sin iniciar sesión.
6. Para transferencia bancaria, sube una imagen o PDF como comprobante y confirma que aparezca en el detalle del pedido del comercio.
7. Cambia el estado del pedido y confirma la notificación por WhatsApp.

### Tiempo real

Envía un mensaje desde el teléfono al WhatsApp conectado y confirma que la bandeja se actualice sin recargar manualmente. Redis/SSE se utiliza para el evento inmediato y existe un refresco de respaldo.

### Horarios y pausa

En **Ajustes → Ventas y cobro** desactiva **Aceptar pedidos** y confirma que el catálogo público continúe visible pero el checkout no permita finalizar la compra. Reactiva la opción y valida también el horario comercial.

## Persistencia

No se borran los volúmenes:

```text
postgres_data
redis_data
uploads_data
```

El Service Worker utiliza la caché `wamercio-store-v1.9`, por lo que después del despliegue una recarga completa del navegador/PWA puede ser necesaria si quedara una versión visual anterior en caché.
