# Despliegue WAMERCIO 2.0.0 en Dokploy

Esta versión actualiza WAMERCIO 1.9.0 y conserva la infraestructura actual de Cloudflare, Traefik, gateway, PostgreSQL, Redis y WhatsApp.

## Actualización

1. Reemplaza el contenido del repositorio por WAMERCIO 2.0.0.
2. Commit y push:

```bash
git add .
git commit -m "feat: WAMERCIO 2.0 business templates"
git push
```

3. En Dokploy pulsa **Rebuild**.
4. **No uses Fresh Volumes**.

No requiere nuevas variables `.env`.

## Base de datos

El API ejecutará después de la migración 1.9:

```text
000010_commerce_flow
000011_business_templates
```

`000011_business_templates` crea el catálogo maestro de plantillas y añade a tiendas/productos los campos necesarios para clonar configuraciones sectoriales. No borra pedidos, clientes, conversaciones ni productos existentes.

## Pruebas recomendadas

Después del Rebuild:

1. Abre `https://wamercio.com` con un WhatsApp que no tenga cuenta.
2. Verifica que aparezca **¿Qué tipo de negocio tienes?**.
3. Crea una tienda usando, por ejemplo, `Boutique` o `Pizzería`.
4. Comprueba categorías, productos demo y respuestas rápidas en WhatsApp.
5. Crea una segunda tienda desde **Mis tiendas** y confirma que también permite elegir plantilla.
6. Entra como SuperAdmin y abre `/admin/templates`.
7. Edita una plantilla maestra y confirma que una tienda ya creada no cambia automáticamente.

## Persistencia

No elimines:

```text
postgres_data
redis_data
uploads_data
```
