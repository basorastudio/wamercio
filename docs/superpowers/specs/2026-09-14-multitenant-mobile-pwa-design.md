# WAMERCIO 2.5.0 Multi-tenant Mobile/PWA Design

## Goal
Move public business experiences from `wamercio.com/{slug}` to canonical tenant hosts `https://{slug}.ltd.do`, add verified custom business domains, and make every business storefront/customer experience mobile-first with a bottom navigation and a tenant-specific PWA, while keeping all merchant/SaaS administration centralized on `wamercio.com`.

## Architecture
- `wamercio.com` and `www.wamercio.com`: platform landing, Superadmin, merchant backoffice and SaaS operations only.
- `*.ltd.do`: public business storefront, customer authentication, cart/checkout, customer orders/profile and per-business PWA.
- Verified custom domains map to the same store through `store_domains` and are routed by a small domain-router sync service that generates exact Traefik routers with ACME TLS.
- The store slug remains the stable tenant key but is no longer a public path on `wamercio.com`.
- No compatibility redirect is kept for `wamercio.com/{slug}` because the product is still in development.

## Tenant Resolution
- API normalizes the effective request host from `X-Wamercio-Host`, `X-Forwarded-Host`, then `Host`.
- `{slug}.ltd.do` resolves directly to `stores.slug`.
- Other hosts resolve through active, verified records in `store_domains`.
- Platform/reserved hosts are never treated as tenants.
- Public store and checkout endpoints become host based: `GET /public/store`, `POST /public/store/checkout`.

## Custom Domains
- New table `store_domains`: `id`, `store_id`, `hostname`, `verification_token`, `status`, `is_primary`, `verified_at`, timestamps.
- Store owners can add, verify, set primary and remove a custom domain from their business settings.
- Verification accepts either a CNAME to the configured domain target or a TXT token under `_wamercio.<hostname>`.
- A domain router sync service polls verified domains and writes a Traefik dynamic file with one exact HTTPS router per custom domain using the existing `letsencrypt` resolver.
- Wildcard tenant routing continues through `*.ltd.do` and excludes infrastructure-reserved names.

## Canonical URLs
- Default business URL: `https://{slug}.ltd.do`.
- If a verified custom domain is marked primary, it becomes the canonical public URL.
- API store/admin responses include `public_url`; UI must use it instead of constructing path URLs.
- Order tracking URLs use the current store host.

## Customer Sessions
- Customer cookies on `*.ltd.do` use `Domain=.ltd.do`, keeping one customer login across WAMERCIO tenant subdomains.
- Custom domains cannot share `.ltd.do` cookies. They use a one-time SSO handoff through `wamercio.com/customer-sso` to mint a first-party customer cookie on the custom domain.
- Merchant and Superadmin sessions remain only on `wamercio.com`.

## Mobile-first Storefront
- Storefront is one-column first, safe-area aware, and usable down to 320px.
- Fixed bottom navigation on mobile: `Inicio`, `Buscar`/`Pedidos`, `Carrito`, `Cuenta`; authenticated customers see `Pedidos` and `Cuenta`.
- Desktop keeps the current header/catalog experience.
- Cart and key actions remain thumb reachable; mobile sheets use full-width/bottom-oriented behavior.

## Merchant Backoffice
- Remains centralized at `wamercio.com`.
- Existing mobile bottom navigation remains the primary mobile navigation and is normalized to five items: Inicio, Pedidos, WhatsApp, Catálogo, Más.
- Public-store links open the store's `public_url`.

## Tenant PWA
- `manifest.webmanifest` becomes a dynamic route generated from the request host/store.
- Tenant manifest: business name, business theme color, root `start_url`/`scope`, store logo when available, fallback WAMERCIO icon.
- Platform manifest remains WAMERCIO-specific.
- Service worker cache namespace includes the request host to avoid cross-tenant cache identity mistakes.
- Install prompt and installed PWA on a tenant host represent that business, not the platform.

## Central Domains Settings
- Centro SaaS → Dominios becomes host-based and shows platform domain, tenant root `ltd.do`, wildcard format `https://{slug}.ltd.do`, custom-domain CNAME target and reserved subdomains.
- Domain settings are persisted and no longer forced back to path mode.

## Clean-code Constraints
- Remove `app/[slug]/page.tsx` and legacy `/store/[slug]` route.
- Remove UI strings that present `wamercio.com/{slug}` as the store format.
- Keep host parsing/resolution in focused helpers rather than duplicating it across handlers.
- Do not expose database credentials or Traefik internals in the browser.

## Deployment
- Existing wildcard DNS/TLS configuration for `*.ltd.do` is reused.
- Traefik dynamic config adds wildcard tenant routers and exact custom-domain routers.
- New runtime variables: `PLATFORM_DOMAIN=wamercio.com`, `TENANT_ROOT_DOMAIN=ltd.do`, `CUSTOM_DOMAIN_CNAME_TARGET=domains.ltd.do`.
- Existing app secrets remain unchanged.
