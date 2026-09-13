#!/bin/sh
set -eu
fail(){ echo "FAIL: $1" >&2; exit 1; }
pass(){ echo "PASS: $1"; }

[ -f services/api/migrations/000015_platform_settings_functional.up.sql ] || fail "falta migración 000015"
grep -q "CREATE TABLE IF NOT EXISTS platform_secrets" services/api/migrations/000015_platform_settings_functional.up.sql || fail "falta platform_secrets"
grep -q "PlatformConfigSecret" services/api/internal/config/config.go || fail "falta PlatformConfigSecret"
grep -q 'PLATFORM_CONFIG_SECRET' docker-compose.yml || fail "falta PLATFORM_CONFIG_SECRET en compose"
grep -q 'Put("/admin/platform/settings/{key}"' services/api/internal/httpapi/server.go || fail "falta guardado por sección"
grep -q 'Get("/admin/platform/database/status"' services/api/internal/httpapi/server.go || fail "falta estado de base"
grep -q 'Post("/admin/platform/test/{kind}"' services/api/internal/httpapi/server.go || fail "falta prueba de integraciones"
grep -q 'Get("/public/legal"' services/api/internal/httpapi/server.go || fail "falta legal público"
grep -q 'configured' services/api/internal/httpapi/server.go || fail "falta máscara de secretos"
grep -q 'validPINFor' services/api/internal/httpapi/server.go || fail "falta PIN dinámico"

grep -q "legacy_owner_pin_lengths" services/api/migrations/000015_platform_settings_functional.up.sql || fail "falta compatibilidad de PIN heredado"
grep -q "accepted_owner_pin_lengths" services/api/internal/httpapi/server.go || fail "falta compatibilidad de login con PIN anterior"
grep -q "signR2Request" services/api/internal/httpapi/server.go || fail "prueba R2 no valida credenciales de forma autenticada"
grep -q '"terminos"' services/api/internal/httpapi/server.go || fail "terminos no está reservado como slug"
grep -q '"privacidad"' services/api/internal/httpapi/server.go || fail "privacidad no está reservado como slug"
grep -q "api<any\[\]>('/plans')" apps/web/app/admin/settings/page.tsx || fail "Centro SaaS debe leer planes públicos sin exigir permiso de Planes"
if grep -q 'data.general?.tenant_domain' apps/web/app/admin/settings/page.tsx; then fail "dominio duplicado en General y Dominios"; fi
grep -q "acceptedPinLengths" apps/web/components/access-modal.tsx || fail "login no contempla PINs heredados"
grep -q "Guardar .*" apps/web/app/admin/settings/page.tsx || fail "falta guardado contextual"
grep -q '/admin/platform/settings/${active}' apps/web/app/admin/settings/page.tsx || fail "UI no guarda por sección"
grep -q 'Probar conexión' apps/web/app/admin/settings/page.tsx || fail "faltan pruebas de conexión"
grep -q 'QRCodeSVG' apps/web/app/admin/settings/page.tsx || fail "WhatsApp no muestra QR"
grep -q 'platform/templates' apps/web/app/admin/settings/page.tsx && fail "ruta incorrecta inesperada"
[ -f apps/web/app/terminos/page.tsx ] || fail "falta página términos"
[ -f apps/web/app/privacidad/page.tsx ] || fail "falta página privacidad"
case "$(cat VERSION)" in 2.3.*) ;; *) fail "VERSION no pertenece a la serie 2.3.x" ;; esac
pass "Centro SaaS 2.3.x"
grep -q '"route_mode":"path"' services/api/migrations/000015_platform_settings_functional.up.sql || fail "Dominios debe reflejar el routing real por ruta"
grep -q 'wamercio.com/{slug}' apps/web/app/admin/settings/page.tsx || fail "Dominios debe mostrar el formato público real"
if grep -q 'custom_domains_enabled' apps/web/app/admin/settings/page.tsx; then fail "UI no debe prometer dominios propios no implementados"; fi
if grep -q 'data.domains?.tenant_domain' apps/web/app/admin/settings/page.tsx; then fail "UI no debe presentar wildcard como arquitectura activa"; fi
grep -q '/api/v1/identidad/verificar' services/api/internal/httpapi/server.go || fail "Identidad debe hacer verificación real"
grep -q 'renderPlatformNotification' services/api/internal/httpapi/server.go || fail "Notificaciones debe aplicar plantillas guardadas a mensajes reales"
grep -q 'order_on_the_way' services/api/internal/httpapi/server.go || fail "falta plantilla operacional de pedido en camino"
grep -q '{seguimiento}' services/api/migrations/000015_platform_settings_functional.up.sql || fail "plantilla de nuevo pedido debe conservar seguimiento"
grep -q 'verifyIdentityDocument' services/api/internal/httpapi/server.go || fail "Identidad requerida debe reutilizar verificación real"
grep -q 'require_owner_verification' apps/web/components/access-modal.tsx || fail "Registro debe leer política de verificación de propietarios"
grep -q 'cedula' apps/web/components/access-modal.tsx || fail "Registro debe solicitar Cédula al propietario"
grep -q '"identity"' services/api/internal/httpapi/server.go || fail "configuración pública debe exponer política de identidad"
grep -q 'puede_registrarse' services/api/internal/httpapi/server.go || fail "la verificación de identidad debe respetar puede_registrarse"
grep -q 'encontrada' services/api/internal/httpapi/server.go || fail "la verificación de identidad debe exigir documento encontrado"
grep -q '/api/v1/territories/health' services/api/migrations/000015_platform_settings_functional.up.sql || fail "Territorio debe usar el health real de GEO RD MAP"
if grep -R -i -q 'subdominios' apps/web; then fail "WAMERCIO 2.x usa rutas /{slug}; no debe presentar tiendas por subdominio"; fi
