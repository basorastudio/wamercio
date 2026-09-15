# WAMERCIO Platform Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing WAMERCIO modules consistently adapt to the business template and preserve business-specific checkout information end to end.

**Architecture:** Centralize business-type interpretation in a frontend capability resolver, use it in merchant/storefront surfaces, validate the same template-defined checkout contract in the Go API, and persist dynamic checkout values in the existing `orders.custom_fields` JSONB column.

**Tech Stack:** Next.js 14 + React 18 + TypeScript, Go + Chi + pgx/PostgreSQL, existing WAMERCIO static regression harness.

**Spec:** `docs/superpowers/specs/2026-09-14-platform-coherence-design.md`

## Global Constraints

- Keep WAMERCIO 2.5.8 visual language and mobile-first behavior.
- Do not introduce a second business-type system; use `business_engine` and `template_config`.
- Preserve the legacy internal `cash_on_delivery` key for compatibility while displaying “Tarjeta en terminal”.
- Reuse the existing `orders.custom_fields` and `flow_type` columns.
- No new external dependency or environment variable.

---

### Task 1: Business capability resolver

**Files:**
- Create: `apps/web/lib/business-capabilities.ts`
- Test: `scripts/test_2_5_8_business_capabilities.js`

**Interfaces:**
- Produces: `resolveBusinessCapabilities(store)` and `normalizeCheckoutFields(config)`.

- [ ] Write a failing behavior test for food, service, quotation and generic stores.
- [ ] Run the test and confirm it fails because the resolver does not exist.
- [ ] Implement the resolver with safe defaults and normalized checkout fields.
- [ ] Run the test and confirm all capability cases pass.

### Task 2: Context-aware catalog and sales settings

**Files:**
- Modify: `apps/web/app/catalog/products/page.tsx`
- Modify: `apps/web/app/settings/store/page.tsx`
- Test: `scripts/test_2_5_8_platform_coherence.py`

- [ ] Add failing regression assertions for stock defaults, variant/extra capability gating and dine-in gating.
- [ ] Update the product editor to use capabilities and template defaults.
- [ ] Update Sales & delivery to show tables only when the business supports dine-in and show contextual guidance for service businesses.
- [ ] Run regressions.

### Task 3: Dynamic storefront checkout

**Files:**
- Modify: `apps/web/components/storefront.tsx`
- Modify: `apps/web/lib/types.ts`
- Test: `scripts/test_2_5_8_platform_coherence.py`

- [ ] Add failing assertions for “Mi compra”, contextual CTA and dynamic checkout fields.
- [ ] Render normalized checkout fields and keep their values in checkout state.
- [ ] Validate required fields before checkout and include `custom_fields` in payload.
- [ ] Use contextual modality labels and primary action.
- [ ] Run regressions.

### Task 4: API validation and persistence

**Files:**
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `services/api/internal/httpapi/customer_portal.go`
- Test: `scripts/test_2_5_8_platform_coherence.py`

- [ ] Add failing assertions for `custom_fields` input, template validation and order detail exposure.
- [ ] Load template configuration during checkout.
- [ ] Sanitize configured custom fields, enforce required values, persist JSONB and contextual `flow_type`.
- [ ] Return `custom_fields` and `flow_type` in merchant/customer order detail responses.
- [ ] Run API compile guards and regression tests.

### Task 5: Template administration and seed capabilities

**Files:**
- Modify: `apps/web/app/admin/templates/page.tsx`
- Create: `services/api/migrations/000026_business_capabilities_coherence.up.sql`
- Create: `services/api/migrations/000026_business_capabilities_coherence.down.sql`
- Test: `scripts/test_2_5_8_platform_coherence.py`

- [ ] Add failing assertions for capability controls and checkout-field editor.
- [ ] Expose supported capability switches and checkout-field editing in SuperAdmin.
- [ ] Add explicit dine-in capability to suitable food templates and safe capability defaults to existing seeds.
- [ ] Add reversible migration.
- [ ] Run migration-pair and regression checks.

### Task 6: Terminology and documentation convergence

**Files:**
- Modify: `apps/web/app/admin/landing/page.tsx`
- Modify: `apps/web/components/platform-landing.tsx`
- Modify: `apps/web/components/store-theme-preview.tsx`
- Modify: `docs/PLANTILLAS_NEGOCIOS_RD.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `scripts/verify-2.5.8.sh`

- [ ] Replace stale “pago al recibir” copy with canonical payment terminology.
- [ ] Use “Mi compra” for cart/pre-order surfaces while keeping “Pedidos” for submitted orders.
- [ ] Document capability-driven commerce and legacy internal payment-key compatibility.
- [ ] Register new tests in `verify-2.5.8.sh`.
- [ ] Run the full verification suite.

### Task 7: Release verification

**Files:**
- Package the complete project ZIP.

- [ ] Run `./scripts/verify-2.5.8.sh` on the working tree.
- [ ] Confirm migration up/down counts match.
- [ ] Package the release ZIP.
- [ ] Extract the ZIP into a fresh directory.
- [ ] Run `./scripts/verify-2.5.8.sh` from the extracted release.
- [ ] Run `unzip -t` on the final archive.
