# WAMERCIO 4.0.1 — Hotfix de compilación Web

## Error corregido

Dokploy detenía `next build` en `apps/web/app/quote/[token]/page.tsx` porque se pasaba directamente a `useEffect` una función `load` que retorna `Promise<void>`.

Antes:

```tsx
const load=()=>api(`/public/quotes/${token}`).then(setQ).catch((e:any)=>setErr(e.message));
useEffect(load,[token])
```

Corregido:

```tsx
const load=()=>api(`/public/quotes/${token}`).then(setQ).catch((e:any)=>setErr(e.message));
useEffect(()=>{void load()},[token])
```

React exige que el callback de `useEffect` retorne `void` o una función de limpieza, no una promesa.

## Prevención

Se agregó `scripts/test_4_0_1_web_build_hotfix.py`, que falla si detecta el patrón `load => api/fetch(...)` pasado directamente a `useEffect(load, ...)`.

También se agregó `scripts/verify-4.0.1.sh` y se actualizó el cache PWA a `wamercio-store-v4.0.1`.

## Validación realizada

- 47/47 migraciones con `up/down`.
- 340 handlers HTTP registrados, 0 faltantes.
- 107 archivos TypeScript: 0 errores de sintaxis.
- Revisión semántica local del frontend con firmas de hooks React: 0 errores después del hotfix.
- 49 archivos Go: 0 errores de parseo.
- `gofmt`: OK.
- Scripts shell: OK.
- El log real de Dokploy ya confirmó que API, WhatsApp Bridge y Domain Router compilan; el único fallo era Web.

## Despliegue

Sube el contenido de esta versión al repositorio y ejecuta un nuevo Redeploy en Dokploy. No hay migraciones nuevas respecto a 4.0.0.
