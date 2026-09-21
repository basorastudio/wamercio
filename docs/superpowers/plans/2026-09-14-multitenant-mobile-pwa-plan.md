# WAMERCIO 2.5.0 Multi-tenant Mobile/PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish each business at `{slug}.ltd.do` or a verified custom domain, make the public/customer experience tenant-aware and mobile-first, and generate a PWA per business while keeping administration on `wamercio.com`.

**Architecture:** Host resolution moves into the API and web request boundary; stores are looked up by tenant subdomain or `store_domains`. Exact custom-domain routers are generated into Dokploy Traefik by a sync sidecar. The public storefront is hosted at `/` on tenant hosts and the platform landing remains `/` on `wamercio.com`.

**Tech Stack:** Next.js App Router, React, TypeScript, Go/Chi, PostgreSQL/pgx, Docker Compose, Nginx, Traefik, PWA/Service Worker.

**Spec:** `docs/superpowers/specs/2026-09-14-multitenant-mobile-pwa-design.md`

## Global Constraints
- `wamercio.com` remains the only merchant/SaaS administration host.
- Canonical tenant URL is `https://{slug}.ltd.do`; no path compatibility route is retained.
- Custom domains must be verified before routing.
- Mobile storefront navigation must use safe-area-aware bottom navigation.
- Existing store and customer data must migrate without destructive resets.

---

### Task 1: Regression guard and domain schema
**Files:**
- Create: `scripts/test_2_5_0_multitenant_hosts.py`
- Create: `services/api/migrations/000019_multitenant_domains.up.sql`
- Create: `services/api/migrations/000019_multitenant_domains.down.sql`

**Interfaces:** Produces `store_domains` and host-mode platform settings.

- [ ] Write a failing regression script requiring host-mode settings, `store_domains`, wildcard Traefik router, dynamic manifest, removal of `[slug]` public route and mobile storefront nav.
- [ ] Run it and confirm failure on 2.4.0.
- [ ] Add migration for `store_domains` plus domain settings defaults.
- [ ] Re-run the relevant migration/static assertions.

### Task 2: Host resolution and host-based public API
**Files:**
- Create: `services/api/internal/httpapi/store_hosts.go`
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `services/api/internal/config/config.go`
- Test: `services/api/internal/httpapi/server_test.go`

**Interfaces:** Produces `requestHostname`, `resolveStoreHost`, `storePublicURL` and host-based `/public/store` + `/public/store/checkout`.

- [ ] Add failing Go tests for tenant host normalization/resolution helpers.
- [ ] Implement host helpers and new config values.
- [ ] Replace slug public endpoints with host-based endpoints.
- [ ] Generate tracking URLs from the effective tenant host.

### Task 3: Domain management API and custom-domain sync
**Files:**
- Create: `services/api/internal/httpapi/store_domains.go`
- Modify: `services/api/internal/httpapi/server.go`
- Create: `services/domain-router/go.mod`
- Create: `services/domain-router/Dockerfile`
- Create: `services/domain-router/cmd/router/main.go`
- Modify: `docker-compose.yml`
- Modify: `infra/traefik/wamercio.yml`

**Interfaces:** Produces CRUD/verify/primary endpoints and Traefik exact routers for verified custom domains.

- [ ] Add regression assertions for CRUD routes and sync service.
- [ ] Implement domain validation and DNS verification.
- [ ] Implement polling renderer using PostgreSQL.
- [ ] Add wildcard tenant routing and sidecar to Compose.

### Task 4: Web host boundary and clean public route
**Files:**
- Create: `apps/web/lib/host.ts`
- Create: `apps/web/components/platform-landing.tsx`
- Create: `apps/web/components/storefront.tsx`
- Modify: `apps/web/app/page.tsx`
- Delete: `apps/web/app/[slug]/page.tsx`
- Delete: `apps/web/app/store/[slug]/page.tsx`
- Modify: `apps/web/lib/api.ts`

**Interfaces:** `app/page.tsx` chooses platform vs tenant by host; storefront consumes `/public/store`.

- [ ] Add static regression requiring no public `[slug]` route.
- [ ] Split landing/storefront into focused components.
- [ ] Make root page host-aware.
- [ ] Send effective host through API helper and use host-based checkout.

### Task 5: Tenant PWA
**Files:**
- Create: `apps/web/app/manifest.webmanifest/route.ts`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/pwa-register.tsx`
- Modify: `apps/web/public/sw.js`
- Delete: `apps/web/public/manifest.webmanifest`

**Interfaces:** Dynamic manifest and host-scoped service-worker cache.

- [ ] Add failing regression for dynamic manifest.
- [ ] Return platform manifest on platform host and store manifest on tenant host.
- [ ] Host-scope the cache and tenant navigation fallback.

### Task 6: Mobile-first tenant/customer UX
**Files:**
- Modify: `apps/web/components/storefront.tsx`
- Create: `apps/web/components/storefront-mobile-nav.tsx`
- Modify: `apps/web/components/customer-shell.tsx`
- Modify: `apps/web/app/cliente/pedidos/page.tsx`
- Modify: `apps/web/app/cliente/perfil/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:** Safe-area bottom navigation across storefront and customer portal.

- [ ] Add regression assertions for four-item mobile nav and safe-area handling.
- [ ] Implement storefront mobile nav and responsive spacing.
- [ ] Normalize customer portal mobile navigation and links to current tenant root.

### Task 7: Backoffice public URLs and domain UI
**Files:**
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `apps/web/components/store-shell.tsx`
- Modify: `apps/web/app/admin/owners/page.tsx`
- Modify: `apps/web/app/admin/settings/page.tsx`
- Modify: `apps/web/app/settings/store/page.tsx`
- Modify: `apps/web/components/settings-nav.tsx`

**Interfaces:** Store responses include `public_url`; business settings manage custom domains.

- [ ] Add public URL fields to store/admin responses.
- [ ] Replace path-built links with `public_url`.
- [ ] Update Centro SaaS domains screen to host mode.
- [ ] Add store-domain management UI.

### Task 8: Customer cookie scope and custom-domain SSO
**Files:**
- Modify: `services/api/internal/httpapi/server.go`
- Create: `services/api/internal/httpapi/customer_sso.go`
- Modify: `services/api/internal/httpapi/customer_auth.go`
- Create: `apps/web/app/customer-sso/page.tsx`
- Create: `apps/web/app/auth/customer/callback/page.tsx`

**Interfaces:** `.ltd.do` customer cookie plus one-time custom-domain handoff.

- [ ] Add tests for cookie domain decision and one-time token behavior.
- [ ] Scope customer cookies to `.ltd.do` on tenant hosts.
- [ ] Add one-time SSO exchange for custom domains.

### Task 9: Versioning, docs and final verification
**Files:**
- Modify: `VERSION`, `apps/web/package.json`, `apps/web/public/sw.js`, `README.md`, `CHANGELOG.md`, `DEPLOY_DOKPLOY.md`, `.env.example`
- Create: `scripts/verify-2.5.0.sh`

**Interfaces:** Deployable WAMERCIO 2.5.0 package.

- [ ] Set version/cache to 2.5.0.
- [ ] Document DNS/TLS/custom-domain flow and new env variables.
- [ ] Run legacy regressions plus 2.5.0 verification.
- [ ] Package, extract cleanly and run verification again on the extracted artifact.
