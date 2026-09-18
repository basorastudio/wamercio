# Despliegue WAMERCIO 2.9.0 en Dokploy

## Orden recomendado

1. Haz respaldo de PostgreSQL y del volumen de uploads.
2. Sustituye el código por **WAMERCIO 2.9.0** conservando volúmenes y secretos actuales.
3. Ejecuta `sh scripts/verify-2.9.0.sh` antes del despliegue.
4. Despliega primero **API** para aplicar las migraciones `000038`, `000039` y `000040`.
5. Despliega **Web** y después reconstruye el resto del Compose si Dokploy lo administra como una sola aplicación.
6. Comprueba `/health`, una tienda pública, WhatsApp, Publicaciones, Redes sociales, Evaluaciones y Métodos de pago.

## Migraciones nuevas

- `000038_social_google_evaluations`: conexiones sociales, OAuth temporal, multimedia, publicaciones, Google Business y evaluaciones.
- `000039_store_bank_accounts`: múltiples cuentas bancarias, cuenta elegida por pedido, cheque global, cuenta de transferencia/terminal y comisiones.
- `000040_customer_cheque_authorization`: autorización de cheque individual por cliente y negocio.

Las migraciones son reversibles y tienen su archivo `.down.sql` correspondiente.

## Proxy Auth administrado

Los comercios **no configuran Client ID, Client Secret ni tokens**. En producción se recomienda:

```env
WAMERCIO_SOCIAL_AUTH_PROXY_ENABLED=true
WAMERCIO_SOCIAL_AUTH_PROXY_BASE_URL=https://auth-apps.bitapps.pro/apps
WAMERCIO_SOCIAL_AUTH_PROXY_REDIRECT_URI=https://auth-apps.bitapps.pro/redirect/v2
WAMERCIO_SOCIAL_PUBLISH_POLL_SECONDS=30
```

`PLATFORM_CONFIG_SECRET` debe conservar un valor largo y estable porque se utiliza para cifrar secretos/tokens almacenados.

Las variables `WAMERCIO_SOCIAL_*_CLIENT_ID/CLIENT_SECRET/REDIRECT_URI` son únicamente un fallback administrado por la plataforma y no deben exponerse a tiendas ni al frontend.

## Encuestas nativas de WhatsApp

No requieren variables nuevas. El `whatsapp-bridge` debe desplegarse junto con el API porque V2.9.0 añade el endpoint interno de encuestas y el descifrado/correlación de votos (`BuildPollCreation` / `DecryptPollVote`).

## Validaciones después del despliegue

- En **Configuración → Redes sociales**, prueba la apertura OAuth para Facebook/Instagram/LinkedIn/Google Business.
- Conecta una cuenta de prueba y verifica que aparezca solamente en la tienda correspondiente.
- Crea una publicación como borrador, prográmala y valida el estado por destino.
- En Google Business valida Perfil, Reseñas, Rendimiento y Multimedia.
- Activa Evaluaciones, cierra una conversación WhatsApp y comprueba que llegue una **encuesta nativa** con cinco opciones 1–5; vota desde el teléfono y confirma que el panel registre la puntuación correcta.
- Registra dos cuentas bancarias y confirma la selección en checkout/seguimiento.
- Activa Cheque globalmente, autoriza a un cliente desde su ficha y comprueba que otro cliente no autorizado no pueda utilizarlo.

## Rollback

Si necesitas volver al código 2.8.12, ejecuta los `.down.sql` en orden inverso (`000040`, `000039`, `000038`) antes de levantar la versión antigua. Conserva siempre un respaldo previo del esquema y de los datos.
