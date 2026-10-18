# WAMERCIO 4.5.8 — Corrección TS2802 / Dokploy

## Diagnóstico

Dokploy llega a `✓ Compiled successfully` para Next.js 14.2.35, pero el control de tipos falla en `apps/web/lib/landing-config.ts:16:14`:

```text
Type error: Type 'Set<...>' can only be iterated through when using
'--downlevelIteration' or with a '--target' of 'es2015' or higher.
```

`apps/web/tsconfig.json` utiliza `"target": "es5"`. El código de 4.5.7 contiene:

```ts
return [...new Set<LandingSectionId>([...list,...defaultSectionOrder])]
```

Esta sintaxis genera el error `TS2802` al compilar con el objetivo ES5.

## Solución

`apps/web/lib/landing-config.ts` utiliza ahora:

```ts
return Array.from(new Set<LandingSectionId>([...list, ...defaultSectionOrder]))
```

`Array.from` conserva el orden y devuelve todos los identificadores únicos. La validación y los valores predeterminados de `Página comercial` permanecen intactos. No se desactiva la comprobación de tipos ni se altera la configuración general del compilador.

## Verificaciones

- Reproducido `TS2802` con `tsc --strict --target es5 --lib esnext,dom --noEmit` antes de la corrección.
- Misma prueba para el archivo corregido: **sin errores**.
- Probado el comportamiento de `normalizeLandingSections()` ante orden personalizado, valores inválidos y duplicados.
- Integridad del ZIP: verificada.
- **Pendiente:** `npm run build` completo (el entorno de preparación no tiene DNS al registro de NPM). La prueba completa debe finalizar antes de desplegar.

## Actualización desde GitHub

Dokploy clona `github.com/basorastudio/wamercio.git`, por lo que debe subir estos cambios a la rama usada por Dokploy. Puede incorporar el ZIP completo o aplicar solo el hotfix encima de la **misma versión 4.5.7**; no combinar con archivos antiguos o distintas ramas.

Para probar en la carpeta `apps/web` con Node.js 20 y acceso a NPM:

```bash
npm install --no-audit --no-fund
npm run build
```

Desplegar con Dokploy solo después de que la comprobación de tipos finalice satisfactoriamente. Sin migraciones de base de datos ni cambios en el `.env`.
