# WAMERCIO 4.2.2 — Hotfix de compilación

## Problema detectado

El despliegue en Dokploy completaba correctamente la compilación de la API Go, pero el build de Next.js fallaba durante la validación de tipos en:

`apps/web/app/admin/landing/page.tsx`

El código importaba `Storefront` desde `lucide-react`:

```tsx
import { ..., Storefront } from 'lucide-react'
```

La versión instalada de `lucide-react` no exporta ese miembro, por lo que `next build` terminaba con:

```text
Type error: Module '"lucide-react"' has no exported member 'Storefront'.
```

## Corrección aplicada

Se sustituyó únicamente ese icono por `Store`, que es compatible con la dependencia del proyecto:

```tsx
import { ..., Store } from 'lucide-react'

<Store className="h-5 w-5" />
```

No se cambió la lógica de publicación, mantenimiento, vista previa, guardado ni conexión con `/admin/platform/landing`.

## Impacto

- Frontend: corrige el bloqueo de compilación.
- Backend: sin cambios funcionales.
- Base de datos: sin migraciones nuevas.
- Docker Compose: sin cambios requeridos.
- PWA: caché actualizada a `wamercio-store-v4.2.2`.

## Despliegue

Reemplaza el código por V4.2.2 y vuelve a ejecutar el deployment normal de Dokploy. No necesitas reiniciar ni recrear PostgreSQL.
