# Despliegue WAMERCIO 2.4.0 en Dokploy

Esta versión agrega identidad global, autenticación y panel de clientes sobre la infraestructura existente de WAMERCIO.

## Actualización

1. Sustituye el código por WAMERCIO 2.4.0.
2. Conserva el `.env` actual; esta versión no necesita variables nuevas.
3. Haz commit/push al repositorio usado por Dokploy.
4. En Dokploy ejecuta **Rebuild** y después **Redeploy**.
5. No uses **Fresh Volumes** y no elimines PostgreSQL, Redis ni uploads.

## Migración

El API aplicará `000018_customer_global_auth` mediante el mecanismo normal de migraciones. La migración amplía `global_customers`, crea `customer_addresses` y enlaza pedidos históricos mediante `orders.global_customer_id` cuando existe una relación previa.

## Pruebas recomendadas

1. Abre una tienda sin sesión, agrega productos y pulsa **Completar pedido**.
2. Usa un WhatsApp nuevo: confirma que se valide mediante whatsmeow y aparezca el registro.
3. Introduce una Cédula válida: confirma formato y autocompletado desde Identidad Dominicana.
4. Completa Provincia → Municipio/Distrito → Barrio → Calle → Número y crea el PIN.
5. Confirma el pedido con una dirección guardada.
6. Cierra sesión y vuelve a entrar usando solamente WhatsApp + PIN.
7. Abre `/cliente/pedidos` y `/cliente/perfil`.
8. Desde otra tienda, confirma que la misma sesión global sigue activa y que no pide registrarse otra vez.
9. En Superadmin → Clientes globales, verifica la identidad y los indicadores agregados.
10. En Centro SaaS → Acceso, confirma el selector **PIN clientes**.
