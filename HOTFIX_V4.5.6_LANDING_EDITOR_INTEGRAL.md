# WAMERCIO 4.5.6 — Landing comercial adaptable y editor integrado

## Objetivo
Rediseñar la página comercial sin alterar los módulos empresariales existentes, utilizando el patrón visual minimalista de WAMERCIO/WhatsApp (verde profundo, blanco, fondos suaves y botones redondeados).

## Hallazgos corregidos
1. El editor de portada guardaba `hero_subtitle`, mientras la web mostraba `hero_text`. Ahora se usa `hero_subtitle` de manera uniforme.
2. Los campos de `process_*`, `hero_mock_*`, `closing_*` y otros elementos del editor no se reflejaban en la web. Ahora aparecen en sus secciones.
3. El catálogo del editor tenía seis tarjetas de beneficios y la landing solo mostraba cuatro tarjetas que cambiaban con la plantilla. Ahora las seis tarjetas son administrables y visibles. Las características de cada plantilla permanecen en su sección.
4. La sección **Cierre comercial** existía en el editor, pero no se renderizaba. Ahora se publica con tres tarjetas y CTA.
5. La navegación reutilizaba incorrectamente `nav_prices_label` para el enlace de funciones; se separó la configuración de Cómo funciona, Plantillas, Funciones y Precios.
6. Se corrigieron las proporciones del hero, métricas ilustrativas, chat de ejemplo, tarjetas y layout responsive, empleando grids fluidas, `min-w-0` y tamaños tipográficos adaptativos.
7. El QR de demostración ya no usa una dirección fija: se construye desde el origen real de la página.

## Editor «Página comercial»
- **Estructura:** permitir mostrar u ocultar y subir o bajar las siete secciones, además de la visibilidad de mockups, franja, QR, footer y textos legales.
- **Portada:** marca, logo por URL opcional, navegación, titular, subtítulo, botones, tres beneficios y todos los textos y valores de las estadísticas ilustrativas.
- **Cómo funciona:** títulos y párrafos, tres pasos, dos bloques de beneficios y todos los mensajes del chat demostrativo.
- **Plantillas:** textos y métricas de la sección, además de nombre, descripción y etiquetas específicas para la landing por ID de plantilla. La configuración real de módulos permanece en **Plantillas**.
- **Funciones:** seis beneficios completos, con título, descripción y etiquetas editables, más la franja final.
- **Planes:** título, subtítulo, beneficios y etiquetas generales, y nombres/descripciones comerciales por ID de plan. Los precios, periodicidades y límites reales se siguen gestionando en **Planes**.
- **Demo, Cierre y Footer:** textos visibles, CTA, tarjetas y enlaces con nombres editables.
- **Mantenimiento:** conserva la función previa y los textos configurables.
- Vista previa inmediata para el hero mientras se edita. Los cambios se publican al guardar, y se pueden deshacer los no guardados.

## Persistencia y compatibilidad
- API: se mantienen `GET /public/platform`, `GET /admin/platform/landing`, `PUT /admin/platform/landing`.
- Base de datos: las nuevas propiedades se persisten en el JSONB existente de `platform_settings` (`key = 'landing'`); **no se necesitan migraciones**.
- Los valores predeterminados se resuelven desde una única fuente `apps/web/lib/landing-config.ts` tanto en la web pública como en el editor, para evitar nuevas divergencias.
- Los textos actuales almacenados en la base de datos se conservan (se mezclan con los campos nuevos predeterminados).
- Las configuraciones de visibilidad y orden (`section_order`) solo modifican la portada comercial, no tiendas, pedidos, suscripciones o plantillas reales.
- `apps/web/public/sw.js` usa nueva clave de caché para evitar mostrar versiones anteriores en PWAs.

## Archivos modificados
- `apps/web/components/platform-landing.tsx` (rehecho)
- `apps/web/app/admin/landing/page.tsx` (editor reorganizado)
- `apps/web/lib/landing-config.ts` (nuevo)
- `apps/web/package.json`
- `apps/web/public/sw.js`
- `VERSION`

## Despliegue en Dokploy
1. Usar el ZIP completo 4.5.6 como código fuente del proyecto y desplegar/reconstruir los servicios según el Docker Compose o flujo de Dokploy existente.
2. No es necesario eliminar ni reiniciar la base de datos; los nuevos ajustes se conservan bajo la misma clave `landing`.
3. Entrar a **SuperAdmin → Página comercial**. Abrir «Estructura» para activar/reordenar secciones y las pestañas restantes para gestionar contenidos.
4. Guardar los cambios. Abrir «Vista pública» y comprobar pantalla móvil, tablet y desktop (375, 768, 1024 y 1440 píxeles).
5. Si se usaba como PWA, recargar la portada y permitir que el Service Worker adopte la caché nueva.

## Verificación y limitaciones
- Análisis estático de sintaxis de archivos `.ts` y `.tsx` modificados mediante el parser de TypeScript: sin errores de parseo.
- Comprobación de claves entre configuración compartida y componentes: realizada.
- **Pendiente en entorno desplegado:** compilación Next.js completa (no se instalaron dependencias npm en esta sesión), pruebas E2E con PostgreSQL, interacción real con `/public/platform`, vistas responsivas reales y comprobación manual de todos los botones.
