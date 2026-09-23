# HOTFIX V4.5.1 — Landing comercial adaptativa + branding WAMERCIO + navegación por plantilla

## Objetivo
Corregir tres puntos clave:
1. Que la landing comercial represente mejor el tipo de plataforma y no se sienta como una página muerta.
2. Reemplazar el logo genérico por un logo consistente de WAMERCIO, usando variantes según el espacio disponible.
3. Reorganizar la navegación del panel del negocio según la plantilla/tipo de negocio para reducir ruido e incoherencias.

## Cambios aplicados

### 1) Branding unificado WAMERCIO
- Se agregó `apps/web/components/wamercio-logo.tsx`.
- Se definieron variantes de uso:
  - `icon`: para espacios compactos/colapsados.
  - `compact`: para sidebars y cabeceras.
  - `full`: para contextos amplios.
- Se sustituyó el bloque genérico tipo “W” por el logo compartido en:
  - Landing pública (`platform-landing.tsx`)
  - Shell del comerciante (`store-shell.tsx`)
  - Shell superadmin (`superadmin-shell.tsx`)

### 2) Landing comercial más coherente con WAMERCIO
- La landing pública ahora consulta `/templates` además de `/plans`.
- Se agregó una nueva sección de “Plantillas activas por negocio”.
- Se muestran tarjetas por plantilla con:
  - icono
  - familia
  - descripción
  - señales funcionales (delivery, reservas, cotizaciones, inventario, etc.)
  - resumen del panel priorizado por tipo de negocio
- También se añadió un bloque explicativo de adaptación por escenario:
  - comida/restaurantes
  - servicios con citas
  - cotización/mayoreo/catálogo técnico

### 3) Menú del comerciante adaptado por plantilla
- El `StoreShell` ahora usa `resolveBusinessCapabilities(store)` para construir la navegación.
- Se priorizan y ocultan módulos según el tipo de negocio seleccionado.
- Ejemplos:
  - **Comida**: mantiene combos, delivery y módulos de mesa/KDS si aplica.
  - **Servicios**: muestra “Servicios” y “Agenda”, y reduce módulos menos coherentes como combos o cupones.
  - **Cotización / mayoreo**: prioriza catálogo, cotizaciones y seguimiento comercial; reduce módulos promocionales innecesarios.
- El sidebar muestra además un bloque “Plantilla activa” con el nombre del negocio y el contexto de operación.
- La navegación inferior móvil también se adapta al negocio activo.

## Archivos tocados
- `apps/web/components/wamercio-logo.tsx` (nuevo)
- `apps/web/components/platform-landing.tsx`
- `apps/web/components/store-shell.tsx`
- `apps/web/components/superadmin-shell.tsx`

## Resultado esperado
- Una landing más alineada con el producto real.
- Menor sensación de sobrecarga para cada negocio.
- Mejor identidad visual y coherencia entre panel público, comerciante y superadmin.
