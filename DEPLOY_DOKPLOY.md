# WAMERCIO 3.0.0 — Despliegue

V3.0.0 incorpora el Centro Conversacional PRO. Agrega la migración `000041_conversation_center_pro` y no requiere variables de entorno nuevas. Despliega API antes que Web para que las nuevas tablas/campos existan cuando la interfaz consulte colas, etiquetas, SLA y seguimientos.

# Despliegue WAMERCIO 3.0.0 en Dokploy

## Orden recomendado

1. Haz respaldo de PostgreSQL y del volumen de uploads.
2. Sustituye el código por **WAMERCIO 3.0.0** conservando volúmenes y secretos actuales.
3. Ejecuta `sh scripts/verify-3.0.0.sh` antes del despliegue.
4. Despliega primero **API** para aplicar `000041` (además de cualquier migración 2.9.x aún pendiente).
5. Despliega **Web** y después reconstruye el resto del Compose si Dokploy lo administra como una sola aplicación.
6. Comprueba `/health`, una tienda pública, WhatsApp, Publicaciones, Redes sociales, Evaluaciones y Métodos de pago.

## Migraciones nuevas

- `000038_social_google_evaluations`: conexiones sociales, OAuth temporal, multimedia, publicaciones, Google Business y evaluaciones.
- `000039_store_bank_accounts`: múltiples cuentas bancarias, cuenta elegida por pedido, cheque global, cuenta de transferencia/terminal y comisiones.
- `000040_customer_cheque_authorization`: autorización de cheque individual por cliente y negocio.
- `000041_conversation_center_pro`: colas, miembros, asignación multiagente, prioridades, SLA, etiquetas, eventos operativos y seguimientos programados.

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

No requieren variables nuevas. El `whatsapp-bridge` debe desplegarse junto con el API porque V2.9.2 conserva el endpoint interno de encuestas y el descifrado/correlación de votos (`BuildPollCreation` / `DecryptPollVote`).

## Validaciones después del despliegue

- En **Configuración → Redes sociales**, prueba la apertura OAuth para Facebook/Instagram/LinkedIn/Google Business.
- Conecta una cuenta de prueba y verifica que aparezca solamente en la tienda correspondiente.
- Crea una publicación como borrador, prográmala y valida el estado por destino.
- En Google Business valida Perfil, Reseñas, Rendimiento y Multimedia.
- Activa Evaluaciones, cierra una conversación WhatsApp y comprueba que llegue una **encuesta nativa** con cinco opciones 1–5; vota desde el teléfono y confirma que el panel registre la puntuación correcta.
- Registra dos cuentas bancarias y confirma la selección en checkout/seguimiento.
- Activa Cheque globalmente, autoriza a un cliente desde su ficha y comprueba que otro cliente no autorizado no pueda utilizarlo.


- En **Conversaciones → Registros de atención**, crea una cola, selecciona agentes, configura estrategia/SLA y transfiere una conversación.
- Programa un seguimiento con “Cancelar si el cliente responde”, responde desde el teléfono y verifica que quede Cancelado.
- Envía una encuesta manual desde el nuevo botón del compositor.
- Comprueba los filtros Sin asignar, Urgentes y SLA.

## Rollback

Si necesitas volver al código 2.8.12, ejecuta primero `000041_conversation_center_pro.down.sql` y después, si también retrocedes toda la línea 2.9.x, los `.down.sql` `000040`, `000039`, `000038` antes de levantar la versión antigua. Conserva siempre un respaldo previo del esquema y de los datos.

## Hotfix 2.9.1

V2.9.1 corrige errores de compilación del API detectados por el build real de Dokploy en V2.9.0. No agrega migraciones ni variables de entorno.

Antes de hacer `Redeploy`, ejecuta `sh scripts/verify-2.9.3.sh`. En CI/Dokploy deben completar sin error estos pasos equivalentes a producción:

- API: `go build -mod=readonly ... ./cmd/api`
- WhatsApp bridge: `go build -mod=readonly ... ./cmd/bridge`
- Domain router: `go build -mod=readonly ... ./cmd/router`
- Web: `npm run build`
- Compose: `docker compose config`

## Hotfix 2.9.2

V2.9.2 corrige los dos fallos frontend que aparecen después de que API y WhatsApp ya compilan en Dokploy: el icono `MessageSquareStar` no disponible en `lucide-react` 0.468.0 y la pérdida del tipo `Fulfillment` en Métodos de pago. No agrega migraciones ni variables de entorno.
