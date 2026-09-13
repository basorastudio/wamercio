#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }

[ -f services/api/migrations/000016_owner_profile_tabs.up.sql ] || fail 'migration 000016 up missing'
[ -f services/api/migrations/000016_owner_profile_tabs.down.sql ] || fail 'migration 000016 down missing'

grep -q 'last_name' services/api/migrations/000016_owner_profile_tabs.up.sql || fail 'last_name column missing'
grep -q 'document_number' services/api/migrations/000016_owner_profile_tabs.up.sql || fail 'document_number column missing'
grep -q 'birth_date' services/api/migrations/000016_owner_profile_tabs.up.sql || fail 'birth_date column missing'
grep -q 'identity_verified_at' services/api/migrations/000016_owner_profile_tabs.up.sql || fail 'identity verification timestamp missing'

grep -q 'Get("/admin/owners/{id}"' services/api/internal/httpapi/server.go || fail 'owner detail route missing'
grep -q 'Put("/admin/owners/{id}"' services/api/internal/httpapi/server.go || fail 'owner update route missing'
grep -q 'Post("/admin/owners/verify-identity"' services/api/internal/httpapi/server.go || fail 'owner identity route missing'
grep -q 'Post("/admin/owners/{id}/stores"' services/api/internal/httpapi/server.go || fail 'owner store create route missing'
grep -q 'Put("/admin/stores/{id}"' services/api/internal/httpapi/server.go || fail 'store update route missing'

grep -q "Propietario" apps/web/app/admin/owners/page.tsx || fail 'owner tab label missing'
grep -q "Negocio" apps/web/app/admin/owners/page.tsx || fail 'business tab label missing'
grep -q 'Fecha de nacimiento' apps/web/app/admin/owners/page.tsx || fail 'birth date field missing'
grep -q 'Cédula' apps/web/app/admin/owners/page.tsx || fail 'cedula field missing'
grep -q 'RNC del negocio' apps/web/app/admin/owners/page.tsx || fail 'business RNC field missing'
! grep -q 'Cédula / RNC' apps/web/app/admin/owners/page.tsx || fail 'owner/business documents must be separated'
grep -q 'Negocios asociados' apps/web/app/admin/owners/page.tsx || fail 'associated businesses UI missing'
grep -q '/admin/owners/verify-identity' apps/web/app/admin/owners/page.tsx || fail 'identity verification integration missing'

echo 'PASS: owner tabs regression'
