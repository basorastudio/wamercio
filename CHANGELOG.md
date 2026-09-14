# WAMERCIO 2.5.3 — Corrección de prerender SSO de clientes

## Corrección

- `/auth/customer/callback` y `/customer-sso` ahora renderizan `useSearchParams()` dentro de límites `Suspense` explícitos, como exige Next.js 14 durante `next build`.
- Se mantienen intactos el flujo SSO, intercambio del token, autenticación del cliente y routing multi-tenant de WAMERCIO 2.5.x.
- Se añade una regresión específica para impedir que estas páginas vuelvan a usar `useSearchParams()` sin `Suspense`.

## Despliegue

No requiere migraciones ni cambios de `.env`. Basta con Rebuild + Redeploy.
