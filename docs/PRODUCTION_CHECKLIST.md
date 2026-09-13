# WAMERCIO production checklist

This checklist applies to each business panel and operation. The incomplete SaaS superadministrator panel is outside this release scope.

## 1. Security

- Configure unique, long platform, administrator, and session secrets.
- Use `APP_ENV=production` and serve only through HTTPS.
- Confirm `Secure`, `HttpOnly`, and `SameSite=Lax` cookies.
- Confirm that no PIN, token, or password appears in logs.
- Verify per-IP throttling and per-account temporary lockout for every role.
- Test account recovery through the real platform WhatsApp session.
- Review cashier and driver permissions before enabling each account.

## 2. Data and migrations

- Apply central, global-customer, and tenant migrations in staging first.
- Create two test businesses and verify isolation across products, customers, sales, cash, credit, delivery, cache, and SSE.
- Verify automatic migration of legacy SHA-256 access hashes to bcrypt after successful login.
- Never edit an applied migration; add a new migration for later corrections.

## 3. Business operation

- Complete sales using cash, manual transfer, external terminal, and store credit.
- Open and close a cash session; record a withdrawal, deposit, and expense; verify the reconciliation difference.
- Void a sale and confirm stock restoration.
- Process partial and full returns and verify audit and inventory movements.
- Record a partial credit installment and verify the remaining balance.
- Initialize the accounting opening balance once and verify that the journal entry is balanced.
- Create a supplier, configure a product reorder policy, recalculate suggestions, create and submit a purchase order, and receive it into inventory.
- Receive a batch with an expiration date and verify FEFO allocation, quarantine, expiration, return restoration, and the batch movement history.
- Register an accounts-payable purchase and a manual supplier payment; verify the payable balance, cash movement when applicable, and both accounting entries.
- Review the inventory ledger, accounting journal, general ledger, trial balance, audit log, notifications, and date-based reports.

## 4. Delivery

- Test assignment, acceptance, departure, location, incident, and completion.
- Test temporary Redis loss and SSE reconnection.
- Confirm that a driver never receives orders from another tenant.
- Perform a real street test on Android and iPhone, both foreground and background.

## 5. Backup and recovery

- Enable `colmapro-backup.timer`.
- Verify at least one backup with checksums and `pg_restore --list`.
- Copy the verified backup to encrypted external storage.
- Restore the complete backup in staging and document the outcome.
- Alert on timer failures and missing recent backups.

## 6. Performance

- Run catalog, authentication, POS/order, and SSE tests separately.
- Record p50, p95, p99, errors, CPU, memory, goroutines, and PostgreSQL waits.
- Do not increase PostgreSQL pools without recalculating the global connection budget.
- Confirm bounded bootstrap responses and paginated lists.

## 7. Deployment

- Set backend CPU and memory limits and keep `GOMEMLIMIT` near 90% of the container memory limit.
- Expose `pprof` only on loopback or an internal network.
- Validate `/health/live` and `/health/ready` through Traefik or Dokploy.
- Deploy gradually and preserve the previous image for rollback.
- Run `tests/e2e/business-smoke.sh` against staging after deployment.

## Authorization criterion

Production is authorized only after critical tests complete without data loss, duplication, or tenant leakage; a backup has been restored successfully; and the pilot business completes a real shift covering sales, cash, credit, and inventory without blockers.
