# Despliegue WAMERCIO 2.8.10 en Dokploy

## Actualización desde 2.8.9

1. Conserva PostgreSQL, Redis, uploads y las variables actuales. **No uses Fresh Volumes.**
2. Sustituye el código por **WAMERCIO 2.8.10**.
3. Ejecuta `sh scripts/verify-2.8.10.sh`.
4. No hay migraciones nuevas en 2.8.10; la última continúa siendo `000036_customer_address_geolocation`.
5. Ejecuta **Rebuild + Redeploy** de Web. API puede reconstruirse normalmente, pero no requiere cambio de esquema.
6. Comprueba: **Mi perfil → Editar dirección → Obtener/Actualizar ubicación**. Debe aparecer el mapa debajo de las coordenadas.
7. Pulsa el mapa/avatar: debe abrir Google Maps externo en las coordenadas exactas.
8. Abre **Clientes → Detalles del cliente** y **Superadmin → Clientes globales → Detalle**: el avatar debe permanecer alineado porque el preview no admite pan/zoom interno.

## Importante

La Geolocation API sigue requiriendo HTTPS y permiso explícito del usuario. No hay variables de entorno nuevas ni dependencia de una API Key adicional de Google Maps.
