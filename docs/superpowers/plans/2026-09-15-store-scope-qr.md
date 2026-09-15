# Store Scope and QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add store QR sharing and territorial service-scope controls that constrain customer address selection and validation.

**Architecture:** Persist `service_scope` on `stores`, expose it and the store territory anchor through settings/public APIs, centralize backend address normalization in a pure helper, and centralize frontend scope/visibility logic in a TypeScript helper. Keep the existing store settings and customer address flows, changing only the territory controls that vary by scope.

**Tech Stack:** Go 1.x, Chi, PostgreSQL migrations, Next.js 14, React 18, TypeScript, Tailwind, qrcode.react.

**Spec:** `docs/superpowers/specs/2026-09-15-store-scope-qr-design.md`

## Global Constraints

- Existing stores default to `national`.
- Scope values are exactly `national`, `provincial`, `municipal`.
- Provincial scope fixes the store province; municipal fixes store province and municipality/district.
- Do not add a new QR dependency; use `qrcode.react`.
- Preserve WAMERCIO visual patterns and existing global customer identity behavior.

---

### Task 1: Regression contracts

**Files:**
- Create: `scripts/test_2_5_8_store_scope_qr.py`
- Create: `services/api/internal/httpapi/store_service_scope_test.go`
- Modify: `scripts/verify-2.5.8.sh`

- [ ] Write failing source-contract and Go tests for QR, settings UI, migration, public API fields, selector scope behavior, and address normalization.
- [ ] Run them and verify they fail for missing implementation.

### Task 2: Persistence and API scope enforcement

**Files:**
- Create: `services/api/migrations/000029_store_service_scope.up.sql`
- Create: `services/api/migrations/000029_store_service_scope.down.sql`
- Create: `services/api/internal/httpapi/store_service_scope.go`
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `services/api/internal/httpapi/customer_auth.go`
- Modify: `services/api/internal/httpapi/customer_portal.go`

- [ ] Add `service_scope` migration and pure normalization helper.
- [ ] Expose scope and store anchor in settings/public APIs and persist settings updates.
- [ ] Normalize registration and address create/update requests against tenant scope.
- [ ] Validate selected checkout addresses against current store scope.
- [ ] Run Go tests and static regression test until green.

### Task 3: Merchant settings and QR

**Files:**
- Modify: `apps/web/app/settings/store/page.tsx`
- Modify: `apps/web/lib/types.ts`

- [ ] Add three service-scope cards to `Mi negocio` with disabled states when territory anchors are missing.
- [ ] Add the store QR beneath the mobile preview.
- [ ] Remove the redundant tables-management callout.
- [ ] Run the regression test and TypeScript syntax/build checks.

### Task 4: Customer territory UX

**Files:**
- Create: `apps/web/lib/store-service-scope.ts`
- Modify: `apps/web/components/customer-access-modal.tsx`
- Modify: `apps/web/components/customer-address-form.tsx`

- [ ] Add frontend scope helpers for fixed territory seed and selector visibility.
- [ ] Load `/public/store` in customer registration/address flows.
- [ ] Render only the variable territory selectors required by the active store scope while fixing the hidden anchor fields.
- [ ] Run regression/static tests and build.

### Task 5: Release verification and packaging

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Document the change.
- [ ] Run `./scripts/verify-2.5.8.sh`.
- [ ] Run API Go tests and web production build.
- [ ] Package the verified source as `WAMERCIO-2.5.8-QR-ALCANCE-TERRITORIAL-CORREGIDO.zip`.
