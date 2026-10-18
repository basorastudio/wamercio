# WAMERCIO 4.5.7 — Hotfix del build de Dokploy

## Error del despliegue 4.5.6

La construcción de Next.js muestra `✓ Compiled successfully` y después, al validar los tipos, falla:

```text
./components/platform-landing.tsx:212:1719
Type error: Parameter 'signal' implicitly has an 'any' type.
```

**Causa:** La función `templateTags` leía `landing.template_overrides` (JSON dinámico tipado `any`). La rama de etiquetas personalizadas podía devolver `any` y el callback que representaba las etiquetas no recibía una inferencia de tipo segura.

## Corrección

`templateTags(item: LandingTemplate): string[]` devuelve siempre cadenas; las etiquetas sobreescritas se tratan primero como `unknown` y se usan solo cuando se confirma que son texto. Si no hay etiquetas válidas, utiliza `templateSignals(item)`.

La corrección preserva el contenido actual del editor comercial y los casos con etiquetas personalizadas.

## Archivos

- `apps/web/components/platform-landing.tsx` (tipado y normalización)
- `apps/web/package.json` (versión 4.5.7)
- `apps/web/public/sw.js` (caché 4.5.7)
- `VERSION`, `CHANGELOG.md` y esta nota

## Verificación y alcance

- Reproducción/validación del tipo con TypeScript en modo estricto, usando el helper extraído del código: OK.
- Sintaxis TypeScript/TSX inspeccionada con compilador TypeScript global: OK.
- Integridad del ZIP: OK.
- **Compilación completa de Next.js dentro de Docker: pendiente** (el entorno de preparación no tiene acceso al registro de paquetes NPM). Si aparece un error adicional de TypeScript, comparte el nuevo log.

## Instrucciones para Dokploy (GitHub)

La instancia indicada en el log clona `github.com/basorastudio/wamercio.git`. **Subir o fusionar esta versión al repositorio y a la rama que usa Dokploy** antes de pulsar Deploy. Subir el ZIP a una ubicación local, sin actualizar GitHub, no cambia lo que construye Dokploy.

A continuación, reconstruir normalmente con Docker Compose desde Dokploy. No se requiere borrar servicios, reinicializar PostgreSQL, crear migraciones ni modificar las variables `.env`.

Como validación opcional, ejecutar `npm install --no-audit --no-fund && npm run build` dentro de `apps/web` en un entorno con acceso a NPM, o esperar a que el job `Frontend production build` de GitHub Actions finalice correctamente antes de desplegar.
