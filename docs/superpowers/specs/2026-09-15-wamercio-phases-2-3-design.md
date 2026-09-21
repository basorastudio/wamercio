# WAMERCIO Phases 2–3 Design

## Scope

Continue from WAMERCIO V2.6.0 and complete the roadmap previously approved in this conversation, preserving current visual patterns, store scoping, multi-tenant rules, WhatsApp-first positioning, and backward compatibility.

## Phase 2 — Operational depth

1. **Reusable modifier groups** for food/service products. A group belongs to a store, contains reusable options, defines min/max selection, and can be assigned to multiple products. Existing per-product `extras` JSON remains supported.
2. **Structured bundles/combos** composed from existing products. A bundle is still a product in the catalog and stores component quantities so inventory and order detail can resolve composition without introducing a second catalog.
3. **Allergens and dietary attributes** as store-scoped reusable labels assignable to products. These capabilities are surfaced primarily for food-enabled stores.
4. **WhatsApp automation rules** driven by commercial events (promotion, reservation, order status, post-sale). Rules are store-scoped, optional, templated, and enqueue messages through the existing WhatsApp integration rather than introducing another transport.
5. **Advanced metrics** extend analytics with promotion conversion, repeat customers, order-source distribution, cancellation rate, and period comparison.

## Phase 3 — Experience and growth

1. **Verified reviews** can only be attached to a completed order/customer combination and are moderated by the store.
2. **QR designer** stores per-store/per-table visual presets (logo toggle, foreground/background color, label) while keeping the same QR destination semantics introduced in V2.6.0.
3. **Product media gallery** extends `image_url` with ordered media records while preserving `image_url` as the primary backward-compatible image.
4. **Optional product translations** add localized name/description records; Spanish remains canonical and fallback.
5. **Advanced KDS stations** define store-scoped stations and assign products/categories so KDS can filter by kitchen/bar/prep station without duplicating orders.
6. **Loyalty** provides configurable points accrual, customer balances, ledger entries, and optional redemption against an order. The initial version is intentionally points-based and store-scoped; no tiers, wallets, or gift cards.

## Architecture

- PostgreSQL migrations are additive and reversible; no destructive conversion of existing `products.extras`, `products.image_url`, orders, or reservations.
- New Go handlers live in focused files under `services/api/internal/httpapi/`, matching the Phase 1 separation pattern.
- Next.js pages use the current `StoreShell`, shared inputs/cards/tables/modals, responsive behavior, and Spanish copy.
- Public storefront changes are progressive: existing stores continue working when none of the new data exists.
- Food-only navigation is capability-aware. Horizontal modules (loyalty, reviews, media/translations) remain broadly usable.
- Automation rules call the existing WhatsApp sending path and record execution attempts for observability/idempotency.

## Data flow

- Modifier selections and bundle components are resolved at order creation and copied into order item JSON so historical orders remain immutable if catalog configuration changes later.
- Allergens/media/translations are queried with product details and returned as empty arrays/objects for older products.
- KDS station filtering occurs server-side from order item product IDs and station assignments.
- Loyalty points are awarded only for completed, non-quote orders; redemption is recorded in the ledger and order metadata so balances are auditable.
- Reviews require an eligible completed order and are returned publicly only when approved.

## Error handling and compatibility

- Every create/update endpoint validates store ownership and cross-store references.
- Additive schema keeps all V2.6.0 endpoints valid.
- If WhatsApp is disconnected, automation execution is logged as skipped/failed without blocking the originating commercial action.
- If a product has no gallery/translation/modifier/allergen records, current UI and checkout behavior is unchanged.

## Testing

- Add Phase 2 and Phase 3 contract scripts with explicit RED/GREEN checks.
- Run all existing `verify-2.6.0.sh` regressions from the final tree.
- Parse all TypeScript/TSX files, validate JSON/YAML, run `gofmt` checks, and compile Go when the required toolchain is available.
- Re-extract the final ZIP and rerun static verification from the packaged artifact.
