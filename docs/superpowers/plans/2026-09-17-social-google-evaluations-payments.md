# WAMERCIO V2.9.0 Social + Google + Evaluations + Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Añadir conexiones sociales por Proxy Auth, publicación multicanal, Google Business, evaluaciones CSAT y cuentas bancarias múltiples por tienda.

**Architecture:** Todo se integra en el API Go existente y en el panel Next.js existente. Los dominios nuevos se mantienen en archivos dedicados y tablas con `store_id`; los workers de publicaciones/evaluaciones se disparan desde el `Server` existente y reutilizan el bridge WhatsApp.

**Tech Stack:** Go 1.26+, Chi, pgx, PostgreSQL, Next.js 14/React/TypeScript/Tailwind, WhatsApp bridge existente.

**Spec:** `docs/superpowers/specs/2026-09-17-social-google-evaluations-payments-design.md`

## Global Constraints
- Multi-tenant estricto por `store_id`.
- Proxy Auth por defecto: `https://auth-apps.bitapps.pro/apps` y `https://auth-apps.bitapps.pro/redirect/v2`.
- Tokens cifrados con `PLATFORM_CONFIG_SECRET`.
- UI en español y consistente con StoreShell.
- Zona horaria por defecto: `America/Santo_Domingo`.
- No introducir dependencias externas de frontend salvo que sean imprescindibles.

---

### Task 1: Persistencia V2.9.0
**Files:** Create migrations `000038` y `000039`; Test `scripts/test_2_9_0_social_commerce.py`.
- [x] Escribir test RED que exija tablas/columnas e índices.
- [x] Ejecutar y confirmar FAIL.
- [x] Crear migraciones reversibles con ownership e índices.
- [x] Ejecutar y confirmar PASS.

### Task 2: Proxy Auth y conexiones sociales
**Files:** Create `services/api/internal/httpapi/social_proxy.go`, `social_connections.go`; modify `server.go`, `.env.example`.
- [x] Test RED para rutas, proveedores, broker, cifrado y ownership.
- [x] Implementar resolución Proxy Auth/fallback, transacciones state/PKCE, callbacks y conexiones.
- [x] Verificar PASS.

### Task 3: Multimedia y publicaciones
**Files:** Create `social_posts.go`; modify `server.go`, `New`; create pages `/media` y `/social-publishing`.
- [x] Test RED para CRUD, estados, deliveries y worker.
- [x] Implementar assets, publicaciones, publish-now, schedule/retry y adaptadores de proveedor.
- [x] Implementar UI StoreShell con filtros/compositor/vistas previas.
- [x] Verificar PASS.

### Task 4: Google Business workspace
**Files:** Create `google_business.go`; create page `/settings/social` / workspace components.
- [x] Test RED para settings, profile sync, reviews, performance y media endpoints.
- [x] Implementar settings y endpoints con manejo explícito de proveedor no disponible.
- [x] Implementar UI de conexión y workspace.
- [x] Verificar PASS.

### Task 5: Evaluaciones CSAT
**Files:** Create `evaluations.go`; modify `updateConversationStatus`; create `/evaluations`.
- [x] Test RED para configuración, cierre, primera respuesta, feedback e invitación neutral.
- [x] Implementar persistencia, disparo al cerrar conversación y captura de respuesta vía evento WhatsApp.
- [x] Implementar dashboard/filtros/configuración.
- [x] Verificar PASS.

### Task 6: Cuentas bancarias y liquidación
**Files:** Create `bank_accounts.go`; modify checkout/store settings/payment-methods page.
- [x] Test RED para múltiples cuentas, migración legacy, primary/terminal y cheque.
- [x] Implementar CRUD y lectura pública segura.
- [x] Rehacer UI Métodos/Cuentas manteniendo políticas por fulfillment.
- [x] Verificar PASS.

### Task 7: Navegación, promociones y release
**Files:** Modify `store-shell.tsx`, `settings-nav.tsx`, `promotions/page.tsx`, `README.md`, `CHANGELOG.md`, `DEPLOY_DOKPLOY.md`, `VERSION`; create `verify-2.9.0.sh`.
- [x] Test RED para nuevas rutas/navegación/CTA de promoción.
- [x] Implementar navegación y prefill de publicación desde promoción.
- [x] Ejecutar regresión completa, syntax/type/build disponibles.
- [x] Empaquetar ZIP y verificar desde extracción limpia.
