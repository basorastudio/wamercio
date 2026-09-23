# HOTFIX V4.5.5 — Landing + identidad visual WAMERCIO

## Problema reportado
La landing pública se percibía recargada, incoherente visualmente y no estaba utilizando el logo oficial de WAMERCIO adjuntado por el cliente.

## Correcciones aplicadas
1. **Se reemplazó la identidad visual improvisada por el logo oficial de WAMERCIO**.
   - Se agregaron los assets reales en `apps/web/public/brand/`.
   - `apps/web/components/wamercio-logo.tsx` ahora usa el logo real horizontal y el isotipo real.

2. **Se rehizo la landing principal** (`apps/web/components/platform-landing.tsx`) con una estructura más limpia:
   - Hero más claro y con mejor jerarquía visual.
   - Sección “Cómo funciona” más directa.
   - Sección de plantillas adaptativas mejor organizada.
   - Sección de funcionalidades relevantes según el negocio.
   - Se conservaron planes, demo y footer, pero con mejor orden visual.

3. **Se redujo el ruido visual**:
   - Menos microtarjetas irrelevantes.
   - Menos bloques repetitivos.
   - Mejor espaciado y lectura.
   - Mayor coherencia entre landing, panel y propuesta de valor.

4. **Ajuste del footer**:
   - El logo oficial se presenta sobre fondo blanco para conservar legibilidad sobre el fondo verde.

## Archivos tocados
- `apps/web/components/platform-landing.tsx`
- `apps/web/components/wamercio-logo.tsx`
- `apps/web/public/brand/wamercio-logo-full.webp`
- `apps/web/public/brand/wamercio-logo-icon.webp`

## Verificación técnica
Se validó la sintaxis TypeScript/TSX de los componentes modificados con un chequeo aislado exitoso.
