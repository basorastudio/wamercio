# Despliegue WAMERCIO 1.5.0 en Dokploy

Esta versión agrega dependencias frontend y una nueva migración de base de datos.

## Actualizar

1. Sustituye el contenido del repositorio por WAMERCIO 1.5.0.
2. Commit y push:

```bash
git add .
git commit -m "feat: international WhatsApp inputs and progressive PIN UX"
git push
```

3. En Dokploy pulsa **Rebuild** para que `npm install` instale `@intl-tel-input/react` e `intl-tel-input`.
4. **No uses Fresh Volumes**.
5. No cambies el `.env`.

## Migración automática

El API aplicará:

```text
000007_no_merchant_email
```

La migración reserva el correo exclusivamente al SuperAdmin SaaS y elimina los campos heredados de correo de tiendas, clientes y pedidos. También pone en `NULL` el email de usuarios comerciales antiguos.

## País automático

No hace falta configurar una API externa. El frontend consulta:

```text
GET /api/v1/meta/country
```

El backend lee `CF-IPCountry`, que Cloudflare envía al origen. Si no está disponible, el componente usa el locale del navegador y finalmente `DO` como respaldo.

## Routing

Se mantiene:

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000
```

## Pruebas recomendadas

- Abrir `https://wamercio.com/` y verificar bandera/código de país en el acceso.
- Probar un número dominicano y cambiar manualmente a otro país.
- Confirmar que un WhatsApp existente conduce directamente al PIN.
- Confirmar que el PIN usa 4 casillas y accede automáticamente al cuarto dígito.
- Probar un número nuevo y confirmar que el registro no muestra Correo ni Repetir PIN.
- Revisar `/settings/profile`, `/stores`, `/settings/store` y un checkout público `/store/<slug>`.
- Revisar `/admin/users`: WhatsApp + PIN, sin correo comercial.
- Confirmar que `/admin/login` conserva correo + contraseña para SuperAdmin.
