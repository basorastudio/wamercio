# Despliegue WAMERCIO 2.8.9 en Dokploy

## Actualización desde 2.8.8

1. Conserva PostgreSQL, Redis, uploads y las variables actuales. **No uses Fresh Volumes.**
2. Sustituye el código por **WAMERCIO 2.8.9**.
3. Ejecuta `sh scripts/verify-2.8.9.sh`.
4. Despliega primero API para aplicar `000036_customer_address_geolocation`.
5. Despliega Web después del API.
6. Comprueba desde un móvil HTTPS: **Mi perfil → Editar dirección → Obtener mi ubicación → Guardar**.
7. Abre el cliente desde **Clientes → Detalles del cliente** o desde Superadmin y confirma que Google Maps se centra en la ubicación guardada y que el pin visual usa la imagen de WhatsApp.

## Requisitos del navegador

La Geolocation API requiere HTTPS (o localhost) y permiso explícito del usuario. Si el usuario deniega el permiso, la dirección se puede guardar sin coordenadas y el mapa conserva el fallback por dirección escrita.

## Base de datos

Nueva migración reversible:

- `000036_customer_address_geolocation.up.sql`
- `000036_customer_address_geolocation.down.sql`

No hay variables de entorno nuevas.
