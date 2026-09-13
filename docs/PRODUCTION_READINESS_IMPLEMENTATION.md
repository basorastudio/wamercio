# Business production-readiness implementation

This release applies the production-readiness work to tenant business operations. The incomplete SaaS superadministrator panel remains outside the scope.

## Implemented

- Bcrypt access credentials with transparent legacy SHA-256 migration.
- Secure cookie sessions and legacy bearer-token compatibility.
- Per-route/IP throttling and per-account lockout with Redis and local fallback.
- Backend and Nginx browser security headers.
- OTP account recovery through the configured global WhatsApp session.
- Versioned legal acceptance for terms, privacy, and data processing.
- Bounded bootstrap payloads and paginated business lists.
- Sale voids, partial/full returns, stock restoration, and audit records.
- Inventory ledger with actor, reason, source, and before/after stock.
- Cash sessions, deposits, withdrawals, expenses, reconciliation, and differences.
- Linked store-credit balances and partial payment allocation.
- Durable outbox events and in-app/WhatsApp business notifications.
- Backend-generated business reports by date range.
- Explicit cashier and delivery-driver permissions enforced by the API.
- Scheduled per-database backups, checksums, retention, verification, and controlled restoration.
- Source checks, Go tests, staging smoke checks, and k6 scenarios.

## Payment boundary

Business payments are offline only: cash, manual bank transfer, external card terminal, and store credit. No card data is captured and no gateway authorization or automatic bank reconciliation is implemented.

## Removed from the production surface

- The non-persistent accounting mock.
- Simulated inventory expiration and purchase-order functions.
- Multi-branch claims not supported by the tenant data model.
- Wording that implied an integrated business payment gateway.

## Required staging acceptance

Before production traffic, run the locked dependency build with Go 1.26 and Node 22, apply every migration in staging, restore a verified backup, run the business smoke/load tests, validate two-tenant isolation, and complete a real pilot shift including sales, cash, credit, inventory, and delivery.
