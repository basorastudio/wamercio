# Despliegue WAMERCIO 2.8.12 en Dokploy

1. Conserva los volúmenes de PostgreSQL, Redis y uploads.
2. Sustituye el código por **WAMERCIO 2.8.12**.
3. Ejecuta `sh scripts/verify-2.8.12.sh` antes del despliegue.
4. No hay migraciones nuevas en 2.8.12; la última continúa siendo `000036_customer_address_geolocation`.
5. Ejecuta **Rebuild + Redeploy** de Web. El API puede reconstruirse junto con el stack sin cambios de esquema.
6. El frontend incorpora `leaflet` y `@types/leaflet`; `npm install` del Dockerfile instalará ambas dependencias automáticamente.

## Validación postdeploy

- Abre Superadmin > Clientes globales > Detalles.
- Haz zoom con los controles o la rueda del ratón y desplaza el mapa con drag.
- Comprueba que la foto de WhatsApp permanece anclada a la ubicación mientras el mapa se mueve.
- Confirma que pulsar el mapa o el marcador no abre una pestaña externa.
- Repite la prueba en Clientes > Detalles del cliente y en Mi perfil > Editar dirección.


### Migración 2.8.12

El API debe aplicar `000037_store_customer_blocking` antes de usar los controles Bloquear/Desbloquear. No se requieren nuevas variables de entorno.
