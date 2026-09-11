# Despliegue WAMERCIO 1.4.0 en Dokploy

Esta versión es una actualización visual sobre la infraestructura ya estable.

## Actualizar

1. Sustituye el contenido del repositorio por WAMERCIO 1.4.0.
2. Commit y push:

```bash
git add .
git commit -m "feat: WAMERCIO 1.4 WhatsApp Food visual system"
git push
```

3. En Dokploy pulsa **Rebuild**.
4. **No uses Fresh Volumes**.
5. No cambies el `.env`.

## Migración automática

El API aplicará:

```text
000006_whatsapp_food_brand
```

La migración cambia a `#36B385` el color por defecto de las tiendas y actualiza únicamente tiendas que conservaban colores por defecto históricos.

## Routing

Se mantiene sin cambios:

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000
```

## Pruebas recomendadas

- `https://wamercio.com/`
- modal de acceso/registro;
- `/dashboard` desde móvil y escritorio;
- `/admin/login` y `/admin`;
- catálogo público `/store/<slug>`;
- instalación PWA;
- creación de nueva tienda y verificación de color `#36B385`.
