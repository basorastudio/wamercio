# WAMERCIO 1.4.0

WAMERCIO es una plataforma SaaS de comercio conversacional para República Dominicana, construida con Next.js + Go + PostgreSQL + Redis + whatsmeow y desplegable en Dokploy.

## Rediseño visual 1.4.0

La interfaz fue rediseñada tomando como referencia el lenguaje visual de WhatsApp Food/WhatsMenu: verde turquesa, blanco, fondos gris muy claro, tipografía ligera, tarjetas limpias y CTAs compactos.

Paleta principal:

- Verde principal: `#36B385`
- Verde oscuro: `#2B936D`
- Fondo: `#FAFBFE`
- Texto principal: `#2E3154`
- Texto secundario: `#8A8FA9`
- Blanco: `#FFFFFF`

El rediseño afecta:

- landing pública;
- modal unificado de acceso/registro;
- panel mobile-first de las tiendas;
- panel SuperAdmin SaaS;
- dashboard y componentes UI compartidos;
- catálogo público;
- icono, favicon, manifest y theme-color PWA;
- color por defecto de nuevas tiendas.

La migración `000006_whatsapp_food_brand` cambia el color por defecto de tienda a `#36B385` y actualiza tiendas que aún conservaban los colores por defecto históricos de WAMERCIO.

## Acceso

### Comerciantes

`https://wamercio.com/`

El botón de acceso abre el flujo unificado:

1. WhatsApp.
2. Si la cuenta existe: PIN de 4 dígitos.
3. Si no existe: formulario corto de registro dentro del mismo modal.

### SuperAdmin

`https://wamercio.com/admin/login`

El SuperAdmin continúa utilizando correo + contraseña y una sesión totalmente separada.

## Infraestructura

Se conserva la ruta estable de producción:

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000
```

No se modifican volúmenes, secretos ni el modelo de despliegue de Dokploy.
