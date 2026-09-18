# WAMERCIO 4.1.14 — Hotfix de compilación TypeScript

## Error corregido

Dokploy compiló correctamente API y WhatsApp Bridge, pero `next build` falló en `components/calls-softphone.tsx` porque TypeScript no considera que `bc?.id === x.id` garantice que `bc` deje de ser `null` al evaluar después `bc.stopVideo()`.

Se corrigieron los dos lugares con el mismo patrón:

```tsx
const bc = browserCall.current
if (bc && bc.id === x.id) await bc.stopVideo().catch(() => {})
```

y:

```tsx
const bc = browserCall.current
if (bc && bc.id === x.id) await bc.stopVideo()
```

No hay cambios de base de datos, API ni protocolo de llamadas respecto a V4.1.13.
