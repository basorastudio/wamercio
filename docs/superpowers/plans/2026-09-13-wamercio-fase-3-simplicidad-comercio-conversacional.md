# WAMERCIO Fase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar WAMERCIO a los tipos de negocio dominicanos más comunes sin perder simplicidad, preservando diseño, dominios, multi-tenant y funcionalidad existente.

**Architecture:** Mantener `platform_business_types` sin nuevas relaciones ni dependencias. Añadir tipos mediante migración idempotente, ordenar los más frecuentes primero, ofrecer búsqueda ligera en las dos interfaces donde se seleccionan/administran tipos y ajustar el contenido comercial para reflejar comercio conversacional por WhatsApp sin convertir capacidades (delivery, fiado, cajeros) en tipos de negocio.

**Tech Stack:** PostgreSQL migrations, Go/Chi, Next.js 14, React 18, TypeScript, Tailwind.

**Spec:** Alcance aprobado en conversación: Fase 3 conservadora, simple por fuera y potente por dentro.

## Global Constraints

- No cambiar diseño visual ni navegación general.
- No añadir dependencias npm ni nuevas tecnologías.
- No cambiar dominios: `wamercio.com`, `ltd.do`, `*.ltd.do`; `proyecto.ltd.do` sigue reservado a Dokploy.
- No cambiar modelo multi-tenant, bases tenant, autenticación, pedidos, catálogo, POS, WhatsApp, delivery ni integraciones.
- Mantener compatibilidad de los tipos existentes por `slug`.
- No usar CIIU ni exponer taxonomías complejas al usuario.
- Mantener “Otro tipo de negocio” como salida sencilla para actividades no predefinidas.

---

### Task 1: Prueba de regresión de Fase 3

**Files:**
- Create: `scripts/verify-phase3-business-types.py`

**Interfaces:**
- Consumes: migraciones, `SuperAdmin.tsx`, `Branches.tsx`, `SaasLanding.tsx`.
- Produces: verificación automática del catálogo, búsqueda, copy y restricciones de alcance.

- [ ] Escribir verificación que falle mientras no exista migración `000028`, catálogo ampliado, búsqueda en Superadmin y selector de creación.
- [ ] Ejecutarla y confirmar fallo esperado.

### Task 2: Catálogo dominicano simple e idempotente

**Files:**
- Create: `backend/db/core_migrations/000028_business_types_conversational_commerce.up.sql`
- Create: `backend/db/core_migrations/000028_business_types_conversational_commerce.down.sql`

**Interfaces:**
- Consumes: `platform_business_types(slug, name, emoji, sort_order, active)`.
- Produces: catálogo ampliado compatible por `slug`, con tipos frecuentes primero y `otro` al final.

- [ ] Insertar/actualizar tipos por `slug` sin borrar IDs existentes.
- [ ] Actualizar `landing_page.business_types`, `audience_title`, FAQ y textos de enfoque conversacional.
- [ ] Mantener `down` no destructivo para tenants existentes: retirar solo tipos nuevos sin asignaciones y restaurar copy previo.

### Task 3: Búsqueda sencilla en Tipos de negocio

**Files:**
- Modify: `frontend/src/screens/SuperAdmin.tsx`

**Interfaces:**
- Consumes: array `types` existente.
- Produces: filtro local por nombre/slug sin llamadas extra ni cambios API.

- [ ] Añadir búsqueda local con contador visible.
- [ ] Mantener botones editar/eliminar, badges y diseño actual.
- [ ] Actualizar empty states y ayudas para comercio general.

### Task 4: Selector intuitivo al crear negocio

**Files:**
- Modify: `frontend/src/screens/Branches.tsx`
- Modify: `frontend/src/screens/SuperAdmin.tsx` (modal de crear negocio compartido/duplicado existente).

**Interfaces:**
- Consumes: `activeBusinessTypes` existente.
- Produces: búsqueda opcional de tipo + select filtrado; mismo `business_type_id` y payload.

- [ ] Añadir búsqueda sin alterar el contrato del backend.
- [ ] Etiquetar claramente “Tipo de negocio” y “Nombre comercial”.
- [ ] Conservar `buildBusinessDisplayName` y generación de dominio actuales.

### Task 5: Copy coherente con comercio conversacional

**Files:**
- Modify: `frontend/src/screens/SaasLanding.tsx`
- Modify: `backend/internal/httpapi/server.go`
- Modify: `backend/db/core_migrations/000006_commercial_landing_default.up.sql` solo para instalaciones nuevas.

**Interfaces:**
- Consumes: landing configurable existente.
- Produces: valores por defecto coherentes con WhatsApp-first y tipos de negocio reales.

- [ ] Sustituir lista que mezcla capacidades por lista de tipos frecuentes.
- [ ] Actualizar FAQ y audiencia sin prometer módulos nuevos.
- [ ] Mantener funciones actuales como inventario, fiado, POS y delivery sin presentarlas como obligatorias para todos.

### Task 6: Verificación final y empaquetado

**Files:**
- Modify: `scripts/verify-wamercio-identity.py` solo si la nueva terminología requiere ajuste.
- Package: `WAMERCIO-Fase-3-COMERCIO-CONVERSACIONAL-SIMPLE.zip`

**Interfaces:**
- Consumes: código final.
- Produces: ZIP desplegable y ENV compatible sin variables nuevas obligatorias.

- [ ] Ejecutar `verify-phase3-business-types.py`.
- [ ] Ejecutar validadores de identidad, branding y routing existentes.
- [ ] Validar JSON/YAML, pares de migraciones y sintaxis de TS/TSX/Go en la medida disponible.
- [ ] Empaquetar desde una extracción limpia y calcular SHA-256.
