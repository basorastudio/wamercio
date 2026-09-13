# Centro SaaS Funcional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el Centro SaaS de WAMERCIO 2.2.2 en configuración persistente, segura y operativa sin alterar el patrón visual actual.

**Architecture:** `platform_settings` continúa almacenando configuración pública por sección; una nueva `platform_secrets` almacena secretos cifrados. El backend expone guardado por sección, estado PostgreSQL y pruebas de conectividad. El frontend usa los mismos componentes visuales actuales y guarda cada sección de forma independiente.

**Tech Stack:** Go 1.27.1, Chi, pgx/PostgreSQL, Next.js 14, React, TypeScript, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-13-centro-saas-functional-design.md`

## Global Constraints
- Mantener la UI actual de WAMERCIO.
- No exponer secretos al navegador después de guardarlos.
- No modificar la arquitectura de tenants.
- No añadir dependencias frontend.
- Mantener compatibilidad con Dokploy Compose.

---

### Task 1: Persistencia segura y contratos del Centro SaaS
**Files:** migration 000015, config.go, server.go, scripts/test.
- [ ] Crear regresión que exija `platform_secrets`, `PLATFORM_CONFIG_SECRET` y guardado por sección.
- [ ] Ejecutar y confirmar fallo.
- [ ] Añadir migración, cifrado AES-GCM, helpers de secreto y rutas.
- [ ] Ejecutar regresión y confirmar paso.

### Task 2: Estado y pruebas de integraciones
**Files:** server.go.
- [ ] Crear regresión para endpoints database/status y test de territorio/identidad/backups.
- [ ] Ejecutar y confirmar fallo.
- [ ] Implementar endpoints con timeout y mensajes seguros.
- [ ] Ejecutar regresión y confirmar paso.

### Task 3: Políticas de acceso reales
**Files:** server.go.
- [ ] Crear regresión para longitud dinámica de PIN de propietario/personal.
- [ ] Ejecutar y confirmar fallo.
- [ ] Reemplazar validación fija en los flujos afectados.
- [ ] Ejecutar regresión y confirmar paso.

### Task 4: Centro SaaS UI funcional
**Files:** `apps/web/app/admin/settings/page.tsx`.
- [ ] Crear regresión que compruebe campos y guardado por sección.
- [ ] Ejecutar y confirmar fallo.
- [ ] Implementar vistas General, Territorio, Tipos, Dominios, DB, Bancos, WhatsApp, Notificaciones, Acceso, Identidad, Legal, Backups y Auditoría.
- [ ] Ejecutar regresión y confirmar paso.

### Task 5: Legal público y versión 2.3.0
**Files:** rutas API, páginas Next, VERSION/package/CHANGELOG.
- [ ] Crear regresión para `/terminos`, `/privacidad` y versión 2.3.0.
- [ ] Ejecutar y confirmar fallo.
- [ ] Implementar endpoint público/legal, páginas y actualización de versión.
- [ ] Ejecutar regresión y confirmar paso.

### Task 6: Verificación integral
- [ ] gofmt.
- [ ] Validar JSON/YAML/shell.
- [ ] Ejecutar regresiones.
- [ ] Intentar `go test ./...` y `npm run build` si el entorno lo permite.
- [ ] Empaquetar desde copia limpia y verificar el ZIP.
