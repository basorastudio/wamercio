# Natural Purchase Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que seleccionar, editar y actualizar productos en el storefront sea progresivo y natural, incluyendo venta por libra/monto.

**Architecture:** Mantener `Storefront` como orquestador visual, extraer operaciones deterministas de carrito/venta ponderada a `lib/storefront-cart.ts`, y persistir la configuración de venta por libra dentro de `products.attributes`. El backend ya acepta `quantity numeric(12,3)`, por lo que no se necesita migración.

**Tech Stack:** Next.js/React/TypeScript, Go/Chi/PostgreSQL existente, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-14-natural-purchase-flow-design.md`

## Global Constraints

- Base: WAMERCIO 2.5.5.
- Mantener storefront mobile-first, SPA/PWA y multi-tenant por host.
- No abrir el carrito automáticamente después de agregar/actualizar.
- No crear migraciones nuevas.
- No romper variantes, extras, stock, checkout autenticado ni dominios.

---

### Task 1: Helpers deterministas del carrito
**Files:** Create `apps/web/lib/storefront-cart.ts`; Test `scripts/test_2_5_6_cart_helpers.js`.
- [ ] Escribir pruebas RED para claves, merge, replace y configuración ponderada.
- [ ] Ejecutar y comprobar fallo.
- [ ] Implementar helpers mínimos.
- [ ] Ejecutar y comprobar PASS.

### Task 2: Storefront progresivo
**Files:** Modify `apps/web/components/storefront.tsx`; Test `scripts/test_2_5_6_natural_purchase.py`.
- [ ] Escribir regresión RED para edición de líneas, CTA actualizar, resumen en tarjetas y ausencia de auto-open del carrito.
- [ ] Ejecutar y comprobar fallo.
- [ ] Implementar editor reutilizable y feedback no disruptivo.
- [ ] Ejecutar y comprobar PASS.

### Task 3: Venta por libra/monto
**Files:** Modify `apps/web/components/storefront.tsx`, `apps/web/app/catalog/products/page.tsx`.
- [ ] Extender regresión RED para `Libra`, `Monto` y configuración del producto.
- [ ] Implementar UI WAMERCIO para venta ponderada usando attributes.
- [ ] Verificar cantidades decimales y stock.

### Task 4: Mensajería y versión
**Files:** Modify `services/api/internal/httpapi/server.go`, `VERSION`, `apps/web/package.json`, `apps/web/public/sw.js`, `CHANGELOG.md`, `README.md`; Create `scripts/verify-2.5.6.sh`.
- [ ] Añadir formateo de cantidad decimal en notificaciones.
- [ ] Actualizar versión 2.5.6.
- [ ] Ejecutar verificación completa sobre árbol de trabajo.
- [ ] Empaquetar, extraer ZIP limpio y repetir verificación.
