# WAMERCIO 2.6.0 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir vigencia de cupones, promociones automáticas, analítica, reservaciones administrativas, QR por mesa y KDS a WAMERCIO sin duplicar los subsistemas existentes.

**Architecture:** El backend Go conserva `orders`, `store_tables` y `table_reservations` como fuente de verdad. Una migración nueva añade promociones y trazabilidad en pedidos; nuevos handlers exponen promociones, analítica, reservaciones y KDS. El frontend Next.js añade páginas que reutilizan `StoreShell`, `StoreSelector`, `Modal`, `Status` y el patrón actual de formularios.

**Tech Stack:** Go + Chi + PostgreSQL + Next.js 14 + React 18 + TypeScript + Tailwind + qrcode.react.

**Spec:** `docs/superpowers/specs/2026-09-15-wamercio-phase-1-design.md`

## Global Constraints

- Sin dependencias nuevas.
- Sin variables de entorno nuevas.
- UI en español y patrón visual actual de WAMERCIO.
- Reservaciones/KDS visibles solo con `dine_in_enabled`.
- Mantener compatibilidad con V2.5.8.

---

### Task 1: Regresiones y versión

**Files:**
- Create: `scripts/test_2_6_0_phase1_features.py`
- Create: `scripts/verify-2.6.0.sh`
- Modify: `VERSION`
- Modify: `apps/web/package.json`
- Modify: `apps/web/public/sw.js`

- [ ] Escribir regresiones estáticas que exijan migración, endpoints, páginas y navegación.
- [ ] Ejecutarlas y verificar que fallen antes de producción.
- [ ] Al finalizar, integrar las regresiones en `verify-2.6.0.sh`.

### Task 2: Vigencia de cupones

**Files:**
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/app/coupons/page.tsx`

- [ ] Aceptar y persistir `starts_at`/`ends_at` en POST/PUT.
- [ ] Mostrar fecha inicial/final y estado temporal en UI.
- [ ] Mantener fechas opcionales.

### Task 3: Promociones automáticas

**Files:**
- Create: `services/api/migrations/000031_promotions_phase1.up.sql`
- Create: `services/api/migrations/000031_promotions_phase1.down.sql`
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/app/promotions/page.tsx`

**Interfaces:**
- `GET /promotions?store_id=`
- `POST /promotions`
- `PUT /promotions/{id}`
- `DELETE /promotions/{id}`

- [ ] Añadir esquema y trazabilidad en `orders`.
- [ ] Añadir CRUD propietario con objetivos de productos/categorías.
- [ ] Aplicar automáticamente la mejor promoción vigente durante checkout.
- [ ] Evitar apilar cupón+promoción: usar el descuento más alto.

### Task 4: Analítica

**Files:**
- Modify: `services/api/internal/httpapi/server.go`
- Create: `apps/web/app/analytics/page.tsx`

**Interfaces:**
- `GET /analytics?store_id=&range=7d|30d|90d`

- [ ] Añadir métricas, serie diaria, modalidades, pagos y top productos.
- [ ] Añadir selector de período y tarjetas/gráficos simples sin dependencia externa.

### Task 5: Reservaciones administrativas

**Files:**
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `apps/web/components/ui.tsx`
- Create: `apps/web/app/reservations/page.tsx`

**Interfaces:**
- `GET /reservations?store_id=`
- `POST /reservations`
- `PATCH /reservations/{id}/status`

- [ ] Listar agenda con área, mesa, cliente, personas y estado.
- [ ] Crear reserva manual con validación de capacidad/conflicto.
- [ ] Actualizar estados administrativos.

### Task 6: QR por mesa y storefront

**Files:**
- Modify: `apps/web/app/tables/page.tsx`
- Modify: `apps/web/components/storefront.tsx`

- [ ] Añadir QR/copia de URL por mesa.
- [ ] Leer `?table=` y preseleccionar modalidad/mesa en tienda pública.
- [ ] Validar que la mesa exista y esté activa en la respuesta pública.

### Task 7: KDS

**Files:**
- Modify: `services/api/internal/httpapi/server.go`
- Create: `apps/web/app/kds/page.tsx`

**Interfaces:**
- `GET /kds?store_id=`

- [ ] Devolver pedidos activos con items y notas.
- [ ] Mostrar columnas Nuevos / Preparando / Listos.
- [ ] Avanzar estados usando `PATCH /orders/{id}/status`.
- [ ] Actualizar automáticamente la pantalla mediante polling ligero.

### Task 8: Navegación, documentación y verificación

**Files:**
- Modify: `apps/web/components/store-shell.tsx`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `scripts/verify-2.6.0.sh`

- [ ] Añadir navegación coherente y condicional para food.
- [ ] Documentar WAMERCIO 2.6.0.
- [ ] Ejecutar regresiones estáticas, parser TypeScript, `gofmt`, sintaxis shell y validación de migraciones.
