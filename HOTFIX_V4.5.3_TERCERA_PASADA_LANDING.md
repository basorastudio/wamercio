# HOTFIX V4.5.3 — Tercera pasada de landing

## Objetivo
Pulir todavía más la landing para mejorar:
- microcopy
- jerarquía visual
- CTA
- coherencia entre landing, dashboard y plantillas

## Cambios aplicados

### 1) Hero más útil y menos estático
- Se agregó una banda de contexto debajo del hero.
- Ahora comunica mejor la relación entre página, plantilla y panel.
- Se muestran módulos relevantes del tipo de negocio activo.
- Se añadió CTA intermedio `Ver experiencia` y CTA contextual hacia `Explorar plantilla`.

### 2) Sección de funciones adaptativa
- La sección `Funciones` ahora cambia su titular y descripción según la plantilla activa.
- Las tarjetas funcionales dejan de ser completamente genéricas y pasan a reflejar mejor el tipo de negocio:
  - servicios/citas
  - cotizaciones
  - mayoreo
  - comida / restaurantes
  - moda
  - casos generales

### 3) Mejor continuidad entre plantilla y operación
- Se añadieron chips de módulos activos.
- Se refuerza visualmente qué funciones sí son coherentes para cada negocio.
- La narrativa comercial ahora conecta mejor la landing con el panel real.

### 4) Navegación hacia plantillas
- Se añadió el ancla `#plantillas`.
- Se mejoró el acceso visual a la sección de plantillas desde el hero y desde funciones.

## Archivo principal modificado
- `apps/web/components/platform-landing.tsx`
