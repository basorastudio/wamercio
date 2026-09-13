#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }
pass(){ echo "PASS: $1"; }

SERVER=services/api/internal/httpapi/server.go
MIG=services/api/migrations/000014_saas_operations_convergence.up.sql
SHELL=apps/web/components/store-shell.tsx
SUPER=apps/web/components/superadmin-shell.tsx

for f in "$SERVER" "$MIG" "$SHELL" "$SUPER"; do [ -f "$f" ] || fail "missing $f"; done

grep -q '"/admin/owners"' "$SERVER" || fail 'owners route'
grep -q '"/admin/global-customers"' "$SERVER" || fail 'global customers route'
grep -q '"/admin/platform-users"' "$SERVER" || fail 'platform users route'
grep -q '"/admin/platform/settings"' "$SERVER" || fail 'platform settings route'
grep -q '"/pos/sales"' "$SERVER" || fail 'POS route'
grep -q 'platform_audit_log' "$SERVER" || fail 'audit writer usage'
grep -q 'panel varchar(30)' "$MIG" || fail 'staff panel assignment persistence'
grep -q 'auditPlatform' "$SERVER" || fail 'central audit helper'

grep -q "Punto de Venta" "$SHELL" || fail 'POS navigation'
grep -q "Usuarios" "$SHELL" || fail 'staff navigation'
grep -q "Entregas" "$SHELL" || fail 'delivery navigation'
grep -q "Métodos de pago" "$SHELL" || fail 'payment navigation'

grep -q "Página comercial" "$SUPER" || fail 'landing nav'
grep -q "Propietarios" "$SUPER" || fail 'owners nav'
grep -q "Clientes globales" "$SUPER" || fail 'global customers nav'
grep -q "Usuarios SaaS" "$SUPER" || fail 'platform users nav'

[ -f apps/web/app/admin/landing/page.tsx ] || fail 'commercial landing editor'
[ -f apps/web/app/admin/owners/page.tsx ] || fail 'owners page'
[ -f apps/web/app/admin/global-customers/page.tsx ] || fail 'global customers page'
[ -f apps/web/app/admin/users/page.tsx ] || fail 'platform users page'
[ -f apps/web/app/admin/settings/page.tsx ] || fail 'central settings page'
[ -f apps/web/app/pos/page.tsx ] || fail 'POS page'
[ -f apps/web/app/staff/page.tsx ] || fail 'staff page'
[ -f apps/web/app/delivery/page.tsx ] || fail 'delivery page'
[ -f apps/web/app/payment-methods/page.tsx ] || fail 'payment methods page'

pass 'convergence surface'
for action in owner.status.updated owner.plan.updated platform_user.created bank.created; do
  grep -q "$action" "$SERVER" || fail "missing audit action $action"
done
grep -q 'Post("/admin/owners"' "$SERVER" || fail 'owner creation route'
grep -q 'func (s \*Server) adminCreateOwner' "$SERVER" || fail 'owner creation handler'
grep -q 'Nuevo propietario' apps/web/app/admin/owners/page.tsx || fail 'owner creation UI'
