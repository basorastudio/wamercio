# Áreas de mesas y métodos de pago por modalidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir áreas para agrupar mesas, eliminar el parpadeo de navegación y permitir métodos de pago distintos por Delivery, Recoger y Mesa.

**Architecture:** Extender el esquema PostgreSQL con áreas de mesas y una matriz JSONB de reglas de pago; exponer CRUD y configuración desde la API Go; consumirlos desde Next.js manteniendo la API como fuente de verdad y filtrando métodos en el storefront. La navegación obtiene `dine_in_enabled` desde la carga inicial de tiendas para evitar renders intermedios inconsistentes.

**Tech Stack:** Go, PostgreSQL, Next.js App Router, React, TypeScript, Tailwind, Docker.

**Spec:** `docs/superpowers/specs/2026-09-15-table-areas-payment-rules-design.md`

## Global Constraints
- Mantener el patrón visual, diseño y funcionalidad actual de WAMERCIO.
- Preservar mesas y reservas existentes.
- No agregar variables de entorno nuevas.
- El backend debe validar las mismas reglas que muestra el frontend.

---

### Task 1: Persistencia de áreas y reglas de pago

**Files:**
- Create: `services/api/migrations/000030_table_areas_payment_rules.up.sql`
- Create: `services/api/migrations/000030_table_areas_payment_rules.down.sql`
- Test: `scripts/test_2_5_8_table_areas_payment_rules.py`

**Interfaces:**
- Produces: `store_table_areas`, `store_tables.area_id`, `stores.payment_methods_by_fulfillment`.

- [x] **Step 1: Escribir regresión estructural de migración.**
- [x] **Step 2: Ejecutar la regresión y confirmar que falla sin la migración.**
- [x] **Step 3: Crear migración que genere `Área principal`, reasigne mesas existentes y preserve reglas globales como política inicial.**
- [x] **Step 4: Ejecutar regresión y confirmar que pasa.**

### Task 2: API de áreas y mesas

**Files:**
- Modify: `services/api/internal/httpapi/server.go`
- Test: `scripts/test_2_5_8_table_areas_payment_rules.py`

**Interfaces:**
- Produces: listado/creación/edición/archivo de áreas y mesas con `area_id` + `area_name`.

- [x] **Step 1: Añadir pruebas de contratos de áreas y asociación de mesas.**
- [x] **Step 2: Implementar CRUD y validación de pertenencia al negocio.**
- [x] **Step 3: Verificar que mesas archivadas/áreas inactivas no aparecen como reservables.**

### Task 3: Gestión de mesas por área

**Files:**
- Modify: `apps/web/app/tables/page.tsx`

**Interfaces:**
- Consumes: endpoints de áreas y mesas.
- Produces: UI Área → Mesas y selector obligatorio de área al crear/editar mesa.

- [x] **Step 1: Cargar áreas y mesas en paralelo.**
- [x] **Step 2: Añadir creación/edición/archivo de áreas.**
- [x] **Step 3: Requerir área en creación/edición de mesa.**
- [x] **Step 4: Agrupar listado por área con conteos y capacidad acumulada.**

### Task 4: Navegación estable

**Files:**
- Modify: `apps/web/components/app-shell.tsx`
- Test: `scripts/test_2_5_8_tables_management_nav.py`

**Interfaces:**
- Consumes: `dine_in_enabled` del payload inicial de tiendas.
- Produces: elemento `Gestión de mesas` sin parpadeo visual.

- [x] **Step 1: Cubrir la presencia condicional en regresión.**
- [x] **Step 2: Eliminar consulta tardía específica de navegación.**
- [x] **Step 3: Usar el estado inicial/persistido de capacidad al construir el menú.**

### Task 5: Métodos de pago por modalidad

**Files:**
- Modify: `apps/web/app/payment-methods/page.tsx`
- Modify: `apps/web/components/storefront.tsx`
- Modify: `services/api/internal/httpapi/server.go`
- Test: `scripts/test_2_5_8_table_areas_payment_rules.py`

**Interfaces:**
- Produces: `payment_methods_by_fulfillment.delivery|pickup|dine_in` con claves `cash`, `card_terminal`, `bank_transfer`.

- [x] **Step 1: Añadir matriz de disponibilidad a Métodos de pago.**
- [x] **Step 2: Impedir habilitar por modalidad un método globalmente desactivado.**
- [x] **Step 3: Filtrar métodos en storefront según modalidad seleccionada.**
- [x] **Step 4: Validar combinación modalidad+método en API al confirmar.**

### Task 6: Verificación y publicación

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `scripts/verify-2.5.8.sh`

**Interfaces:**
- Produces: release verificable y documentación de despliegue.

- [x] **Step 1: Ejecutar regresiones específicas.**
- [x] **Step 2: Ejecutar `scripts/verify-2.5.8.sh` por bloques equivalentes cuando la suite completa excede la ventana del runner.**
- [ ] **Step 3: Ejecutar builds de API y Web.** Bloqueado en este entorno sin acceso a Internet: Go intenta descargar toolchain 1.26 y `apps/web/node_modules` no está instalado.
- [x] **Step 4: Empaquetar ZIP final excluyendo dependencias y artefactos temporales.**
