# Validación — PIN administrativo / cliente y recuperación sin scroll

Fecha: 2026-08-31

## Cambios implementados

- Política administrativa independiente (`admin_pin_length`).
- Política de clientes independiente (`customer_pin_length`).
- Valores predeterminados: administración 6, clientes 4.
- Compatibilidad con PIN históricos por grupo.
- Registro y login de clientes adaptados a la política de clientes.
- Propietarios, usuarios SaaS, administradores, cajeros y repartidores adaptados a la política administrativa.
- El login desde la tienda detecta el rol antes de decidir qué longitud mostrar/aceptar.
- Recuperación OTP y CTA utiliza la longitud correspondiente al sujeto recuperado.
- Cambio de PIN del cliente sincronizado con la identidad global y tenants vinculados.
- `#/recover-account` convertido en capa `fixed inset-0`, con bloqueo temporal del overflow de `html` y `body` para eliminar la franja blanca y la barra de desplazamiento.

## Validaciones ejecutadas

- `gofmt` sobre todos los archivos Go modificados.
- Parseo sintáctico de 105 archivos TypeScript/TSX con TypeScript 5.8.3: sin errores sintácticos.
- `frontend/scripts/verify-production-surface.mjs`: correcto.
- Se intentó ejecutar `go test ./internal/httpapi` en una copia temporal adaptada al Go disponible; la ejecución no pudo continuar porque el entorno no puede descargar dependencias desde `proxy.golang.org`. El `go.mod` original se restauró a Go 1.26.

## Persistencia

No se necesita una nueva migración SQL. La política continúa almacenándose como JSONB bajo `platform_settings.key = 'access_policy'`.
