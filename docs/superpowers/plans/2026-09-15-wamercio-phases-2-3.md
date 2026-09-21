# WAMERCIO Phases 2–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete WAMERCIO roadmap Phases 2 and 3 on top of V2.6.0 while preserving the existing visual system, APIs, multi-tenant scoping, and WhatsApp-first workflow.

**Architecture:** Add two reversible schema migrations and focused HTTP handler files. Extend catalog/order APIs progressively so legacy product extras/images and current checkout remain valid. Add Next.js administration pages using existing StoreShell/components and enrich storefront/KDS without introducing a second design language.

**Tech Stack:** Go + Chi + pgx, PostgreSQL, Next.js App Router + React + TypeScript + Tailwind, existing WhatsApp bridge, shell/Python contract verification.

**Spec:** `docs/superpowers/specs/2026-09-15-wamercio-phases-2-3-design.md`

## Global Constraints

- Preserve V2.6.0 behavior and routes unless explicitly extended.
- Spanish remains the canonical UI language; translations are optional product data.
- New tables and columns must be additive and have matching down migrations.
- Store ownership must be validated for every referenced product/category/order/customer/table.
- Food-specific modules are capability-aware and must not turn WAMERCIO into a restaurant-only product.
- Existing `products.extras` and `products.image_url` remain backward-compatible.
- No new third-party frontend dependency solely for visual polish.

---

### Task 1: Phase 2 schema and contract test

**Files:**
- Create: `services/api/migrations/000032_phase2_operations.up.sql`
- Create: `services/api/migrations/000032_phase2_operations.down.sql`
- Create: `scripts/test_2_7_0_phase2_features.py`

**Interfaces:**
- Produces tables: `modifier_groups`, `modifier_options`, `product_modifier_groups`, `bundle_components`, `allergens`, `product_allergens`, `product_dietary_tags`, `automation_rules`, `automation_runs`.

- [ ] Write a contract test that asserts all Phase 2 tables, keys, route strings, and UI page files are absent/present as appropriate.
- [ ] Run `python scripts/test_2_7_0_phase2_features.py` and confirm RED because migration/routes do not exist yet.
- [ ] Add reversible additive SQL migration with store-scoped indexes and cascading references.
- [ ] Rerun the contract test until schema assertions pass and remaining failures point to handlers/UI.

### Task 2: Reusable modifiers and bundles backend

**Files:**
- Create: `services/api/internal/httpapi/catalog_composition.go`
- Modify: `services/api/internal/httpapi/server.go`
- Modify: order creation logic in `services/api/internal/httpapi/server.go` or its current checkout helper file.

**Interfaces:**
- Produces CRUD routes under `/modifier-groups` and `/bundles` scoped by store.
- Checkout accepts selected modifier option IDs and snapshots names/prices into order item `extras` JSON.
- Bundle components are resolvable by catalog/product ID without changing standard product routes.

- [ ] Extend the Phase 2 contract test with exact route/handler assertions and payload names.
- [ ] Run the test and confirm RED on missing handlers.
- [ ] Implement modifier group/option CRUD and product assignment with store ownership checks.
- [ ] Implement bundle component CRUD and component validation.
- [ ] Extend checkout normalization to resolve reusable modifiers and bundle composition while preserving legacy extras.
- [ ] Run Phase 2 test and existing checkout regressions.

### Task 3: Allergens and dietary attributes

**Files:**
- Extend: `services/api/internal/httpapi/catalog_composition.go`
- Modify: product/public catalog response code in `services/api/internal/httpapi/server.go`
- Create: `apps/web/app/product-attributes/page.tsx`

**Interfaces:**
- Produces `/allergens` CRUD and `/products/{id}/attributes` assignment route.
- Public product DTO includes `allergens` and `dietary_tags` with empty defaults.

- [ ] Add failing contract assertions for attributes endpoints/page.
- [ ] Implement store-scoped allergen CRUD and assignment.
- [ ] Extend catalog queries without changing existing required fields.
- [ ] Build admin page using existing cards/modals/table patterns and food capability gating.
- [ ] Run Phase 2 and catalog regressions.

### Task 4: WhatsApp automation rules

**Files:**
- Create: `services/api/internal/httpapi/commerce_automations.go`
- Modify: `services/api/internal/httpapi/server.go`
- Create: `apps/web/app/automations/page.tsx`

**Interfaces:**
- Produces CRUD `/automations`, execution helper `triggerAutomationEvent(ctx, storeID, event, data)` and execution log endpoint.
- Supported initial events: `promotion_started`, `reservation_created`, `reservation_reminder`, `order_confirmed`, `order_ready`, `order_completed`, `review_request`.

- [ ] Add RED assertions for route/event constants and UI.
- [ ] Implement rule CRUD with template validation and active toggle.
- [ ] Implement execution logging and call through the existing WhatsApp send mechanism; failures never roll back the originating order/reservation transaction.
- [ ] Wire order/reservation lifecycle events at safe post-commit points.
- [ ] Build rule management UI with event selector, template editor, preview, toggle, and recent runs.
- [ ] Run Phase 2 and WhatsApp regressions.

### Task 5: Advanced analytics

**Files:**
- Extend: `services/api/internal/httpapi/phase1_commerce.go`
- Modify: `apps/web/app/analytics/page.tsx`

**Interfaces:**
- Analytics response adds `repeat_customer_rate`, `cancellation_rate`, `source_breakdown`, `promotion_conversion`, `previous_period` comparison.

- [ ] Add RED assertions for new response keys/UI labels.
- [ ] Add aggregate SQL scoped to non-quote store orders and matching previous period.
- [ ] Extend analytics UI with comparison deltas and breakdown cards/tables without changing the current primary KPIs.
- [ ] Run Phase 2 analytics and V2.6.0 regressions.

### Task 6: Phase 3 schema and contract test

**Files:**
- Create: `services/api/migrations/000033_phase3_growth.up.sql`
- Create: `services/api/migrations/000033_phase3_growth.down.sql`
- Create: `scripts/test_2_8_0_phase3_features.py`

**Interfaces:**
- Produces tables: `product_media`, `product_translations`, `reviews`, `kds_stations`, `kds_station_products`, `kds_station_categories`, `loyalty_accounts`, `loyalty_ledger`; adds QR style fields/settings without invalidating existing table QR links.

- [ ] Write Phase 3 contract test and run RED.
- [ ] Add reversible migration and rerun until only handlers/UI remain RED.

### Task 7: Product gallery and translations

**Files:**
- Create: `services/api/internal/httpapi/product_enrichment.go`
- Modify: `services/api/internal/httpapi/server.go`
- Modify existing product admin modal/page.
- Modify public storefront product rendering.

**Interfaces:**
- Produces product media CRUD/order and product translation upsert/read.
- Public product response includes `media` and `translations`; canonical fields remain Spanish fallback.

- [ ] Add failing Phase 3 assertions.
- [ ] Implement backend with store/product ownership validation.
- [ ] Add gallery management inside existing product modal rather than creating a duplicate product editor.
- [ ] Add optional language selector only when translations exist; default Spanish.
- [ ] Run catalog/storefront regressions.

### Task 8: Verified reviews

**Files:**
- Create: `services/api/internal/httpapi/reviews.go`
- Create: `apps/web/app/reviews/page.tsx`
- Modify public storefront where product/store rating is rendered.

**Interfaces:**
- Review create requires completed eligible order; admin can approve/hide; public endpoint returns approved reviews only.

- [ ] Add RED contract assertions for eligibility and moderation routes.
- [ ] Implement create/list/moderate with completed-order verification and one review per order/product where applicable.
- [ ] Build moderation UI and public rating/review display.
- [ ] Run Phase 3/customer/order regressions.

### Task 9: QR visual designer

**Files:**
- Modify schema from Task 6.
- Extend table handlers in `services/api/internal/httpapi/phase1_commerce.go` or focused QR helper.
- Modify: `apps/web/app/tables/page.tsx`

**Interfaces:**
- Table/store QR style fields: foreground, background, logo toggle, label/template; destination remains `?table=<uuid>`.

- [ ] Add RED assertions for QR style fields and controls.
- [ ] Implement style persistence with safe hex validation.
- [ ] Add preview and SVG download using current QR generation path; no new QR destination logic.
- [ ] Run table/QR regressions.

### Task 10: Advanced KDS stations

**Files:**
- Create/extend: `services/api/internal/httpapi/kds_stations.go`
- Modify: `apps/web/app/kds/page.tsx`

**Interfaces:**
- Produces station CRUD and station-filtered KDS query. Orders remain single source of truth; products/categories map to zero or one/multiple stations.

- [ ] Add RED assertions for station endpoints and UI selector.
- [ ] Implement station CRUD/assignment with store ownership.
- [ ] Extend KDS endpoint and UI filter while keeping All stations as default.
- [ ] Run KDS/order regressions.

### Task 11: Loyalty points

**Files:**
- Create: `services/api/internal/httpapi/loyalty.go`
- Create: `apps/web/app/loyalty/page.tsx`
- Modify order-completion path and customer/profile responses.

**Interfaces:**
- Store config defines `points_per_currency` and optional `redemption_value`; completion awards points once; redemption creates immutable ledger debit.

- [ ] Add RED assertions for account/ledger/config routes and idempotent completion award.
- [ ] Implement balance/ledger/config backend and award-on-completion guard.
- [ ] Add admin loyalty overview/settings page and customer balance display where customer detail already exists.
- [ ] Run order/customer regressions.

### Task 12: Navigation, versioning, documentation and final verification

**Files:**
- Modify: shared StoreShell/navigation component(s)
- Modify: `VERSION`, `CHANGELOG.md`, `README.md`, `DEPLOY_DOKPLOY.md`
- Create: `scripts/verify-2.8.0.sh`

**Interfaces:**
- Version becomes `2.8.0`; Phase 2/3 pages use existing navigation/capability rules.

- [ ] Add navigation entries without exposing food-only pages to non-food stores.
- [ ] Update documentation and migrations section.
- [ ] Run `scripts/verify-2.6.0.sh`, Phase 2 test, Phase 3 test, TypeScript syntax parse, JSON/YAML validation, `gofmt` check, and Go tests when toolchain is available.
- [ ] Package `WAMERCIO V2.8.0.zip`, extract it into a clean directory, and rerun the static verification from the packaged artifact.
