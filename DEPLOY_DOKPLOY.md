# Despliegue WAMERCIO 1.7.0 en Dokploy

Esta actualización es compatible con la instalación 1.6.1 existente y no requiere nuevas variables de entorno.

## Actualización

1. Reemplaza el contenido del repositorio por WAMERCIO 1.7.0.
2. Commit y push:

```bash
git add .
git commit -m "feat: WAMERCIO 1.7 full WhatsApp and SaaS support chat"
git push
```

3. En Dokploy pulsa **Rebuild**.
4. **No uses Fresh Volumes.**

El API ejecutará automáticamente `000009_whatsapp_full_support` antes de quedar saludable.

## Pruebas después del Rebuild

Comprueba primero:

```text
https://wamercio.com/
https://wamercio.com/settings/store
https://wamercio.com/settings/whatsapp
https://wamercio.com/conversations
https://wamercio.com/support
https://wamercio.com/admin/whatsapp
```

En el chat de una tienda envía desde el móvil una imagen, video, audio y PDF y confirma que se rendericen. Luego envía esos mismos tipos desde WAMERCIO.

En `/admin/whatsapp`, vincula un **número independiente de soporte WAMERCIO**. Después abre `/support` como comerciante y utiliza **Abrir WhatsApp** para iniciar la conversación. Debe aparecer en el centro de soporte del SuperAdmin.

## Sesión vinculada

Después del Rebuild el servicio reconecta las sesiones existentes y registra actividad. Si una sesión antigua continúa mostrando una advertencia de inactividad en la aplicación móvil, desvincúlala y vuelve a escanear el QR una vez para iniciar una vinculación limpia con esta versión.

La advertencia de inactividad es emitida por los servidores de WhatsApp; WAMERCIO puede reforzar actividad, keep-alive y estado del dispositivo, pero no puede suprimir por fuerza una advertencia que WhatsApp decida mostrar.

## Persistencia

No se borran:

```text
postgres_data
redis_data
uploads_data
```

Los medios de WhatsApp se almacenan bajo el volumen `uploads_data` y permanecen entre redeploys.


## Hotfix 1.7.1

No requiere cambios de `.env`, migraciones nuevas ni Fresh Volumes. Corrige exclusivamente la compilación del endpoint de registro de comercios. Realiza **Rebuild** normal en Dokploy.
