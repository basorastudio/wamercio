# Customer Global Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar identidad global, registro/login, direcciones, checkout autenticado y panel de clientes en WAMERCIO 2.4.0.

**Architecture:** `global_customers` será la identidad global y `customers` la relación por tienda. Se usará una cookie JWT HTTP-only específica de cliente y los pedidos se asociarán también directamente a `global_customer_id`.

**Tech Stack:** Go + Chi + PostgreSQL + pgx, Next.js 14 + React + TypeScript + Tailwind, Redis, whatsmeow bridge, Identidad Dominicana, GEO RD MAP.

**Spec:** `docs/superpowers/specs/2026-09-13-customer-global-auth-design.md`

## Global Constraints
- Mantener estilo visual actual de WAMERCIO.
- WhatsApp + PIN, sin correo/contraseña para clientes.
- Cédula obligatoria y verificada cuando Identidad está habilitada.
- PIN cliente configurable e independiente.
- No exponer credenciales de integraciones al frontend.
- Mantener compatibilidad con pedidos/clientes históricos.

---

### Task 1: Migración de identidad global y direcciones
**Files:**
- Create: `services/api/migrations/000018_customer_global_auth.up.sql`
- Create: `services/api/migrations/000018_customer_global_auth.down.sql`
- Test: `scripts/test_2_4_0_customer_global_auth.py`

**Interfaces:**
- Produces: columnas enriquecidas en `global_customers`, tabla `customer_addresses`, `orders.global_customer_id`, índice único de Cédula.

- [ ] Escribir prueba estática que exija las estructuras nuevas y falle en 2.3.3.
- [ ] Ejecutarla y confirmar fallo.
- [ ] Crear migración UP/DOWN con backfill desde `customers` y `orders`.
- [ ] Ejecutar la prueba y confirmar éxito.

### Task 2: Autenticación global de cliente en API
**Files:**
- Create: `services/api/internal/httpapi/customer_auth.go`
- Modify: `services/api/internal/httpapi/server.go`
- Test: `scripts/test_2_4_0_customer_global_auth.py`

**Interfaces:**
- Produces: endpoints `/auth/customer/*`, middleware `requireCustomerAuth`, cookie `wamercio_customer_token`, `customer_pin_length`.

- [ ] Añadir pruebas de rutas y política de PIN cliente.
- [ ] Verificar que fallen.
- [ ] Implementar lookup, validación WhatsApp, verificación Cédula, register/login/logout y middleware.
- [ ] Exponer `customer_pin_length` en `/public/platform` y conservar longitudes legacy.
- [ ] Ejecutar pruebas.

### Task 3: Perfil, direcciones y pedidos del cliente
**Files:**
- Create: `services/api/internal/httpapi/customer_portal.go`
- Modify: `services/api/internal/httpapi/server.go`
- Test: `scripts/test_2_4_0_customer_global_auth.py`

**Interfaces:**
- Produces: `/customer/me`, CRUD direcciones, `/customer/orders` y detalle.

- [ ] Añadir pruebas de rutas autenticadas.
- [ ] Implementar handlers con aislamiento por `global_customer_id`.
- [ ] Ejecutar pruebas.

### Task 4: Checkout autenticado y relación local por negocio
**Files:**
- Modify: `services/api/internal/httpapi/server.go`
- Test: `scripts/test_2_4_0_customer_global_auth.py`

**Interfaces:**
- Consumes: claims de cliente y `customer_addresses`.
- Produces: pedidos con `customer_id` local + `global_customer_id` global.

- [ ] Añadir pruebas que exijan sesión cliente y uso de identidad de servidor.
- [ ] Modificar checkout para rechazar sesión ausente y resolver/create `customers` por tienda.
- [ ] Guardar snapshot de nombre/teléfono/dirección y `orders.global_customer_id`.
- [ ] Ejecutar pruebas.

### Task 5: Modal público de acceso/registro de cliente
**Files:**
- Create: `apps/web/components/customer-access-modal.tsx`
- Modify: `apps/web/app/[slug]/page.tsx`
- Test: `scripts/test_2_4_0_customer_global_auth.py`

**Interfaces:**
- Produces: flujo WhatsApp → PIN o registro con Cédula/dirección/PIN.

- [ ] Añadir pruebas estáticas de campos, endpoints y flujo.
- [ ] Implementar modal con PhoneInput, PinInput, Identidad y GEO RD MAP.
- [ ] Integrar en storefront y refrescar sesión tras login/registro.
- [ ] Ejecutar pruebas.

### Task 6: Checkout con sesión y direcciones guardadas
**Files:**
- Modify: `apps/web/app/[slug]/page.tsx`
- Test: `scripts/test_2_4_0_customer_global_auth.py`

**Interfaces:**
- Consumes: `/customer/me`, `/customer/addresses`.
- Produces: selección de dirección y checkout sin reintroducir identidad.

- [ ] Añadir prueba que rechace inputs manuales de identidad en checkout autenticado.
- [ ] Implementar prefill/selector de dirección y apertura de login antes del checkout.
- [ ] Ejecutar pruebas.

### Task 7: Panel del cliente
**Files:**
- Create: `apps/web/components/customer-shell.tsx`
- Create: `apps/web/app/cliente/pedidos/page.tsx`
- Create: `apps/web/app/cliente/perfil/page.tsx`
- Test: `scripts/test_2_4_0_customer_global_auth.py`

**Interfaces:**
- Produces: panel de pedidos, perfil, direcciones y logout.

- [ ] Añadir pruebas de rutas/componentes.
- [ ] Implementar shell y ambas páginas responsive.
- [ ] Integrar enlaces desde storefront.
- [ ] Ejecutar pruebas.

### Task 8: Centro SaaS y Clientes globales
**Files:**
- Modify: `apps/web/app/admin/settings/page.tsx`
- Modify: `apps/web/app/admin/global-customers/page.tsx`
- Modify: `services/api/internal/httpapi/server.go`
- Test: `scripts/test_2_4_0_customer_global_auth.py`

**Interfaces:**
- Produces: `customer_pin_length`, legacy customer PINs, datos enriquecidos de cliente global en Superadmin.

- [ ] Añadir prueba de configuración y columnas visibles.
- [ ] Implementar ajustes y endpoint global enriquecido.
- [ ] Ejecutar pruebas.

### Task 9: Versión, docs y verificación final
**Files:**
- Modify: `VERSION`, `apps/web/package.json`, `apps/web/public/sw.js`, `CHANGELOG.md`, `README.md`
- Create: `scripts/verify-2.4.0.sh`

**Interfaces:**
- Produces: WAMERCIO 2.4.0 listo para empaquetar.

- [ ] Actualizar versión a 2.4.0.
- [ ] Añadir verificador 2.4.0 que ejecute regresiones anteriores + nuevas.
- [ ] Ejecutar verificación estática completa.
- [ ] Empaquetar ZIP, extraerlo limpio y ejecutar verificación otra vez.
