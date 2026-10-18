# WAMERCIO 4.6.0 — Perfiles operativos por plantilla

## Objetivo

Profesionalizar cada plantilla conservando la identidad minimalista de WAMERCIO y su razón de ser: vender, recibir solicitudes, administrar pedidos y atender al cliente en WhatsApp. No convertir el sistema en 16 aplicaciones diferentes ni repetir funcionalidades.

## Núcleo común, siempre disponible

Dashboard, Pedidos (o solicitudes), Clientes, Catálogo, Tienda online, Conversaciones de WhatsApp y acceso de cuenta. Esta base no depende de los interruptores de la plantilla. Se mantienen bases de datos, API, ventas y registros ya existentes.

## Análisis de las 16 plantillas

| Plantilla | Funciones prioritarias | Módulos no mostrados por defecto |
|---|---|---|
| **Comida rápida** | POS, caja, combos, pantalla de cocina y reparto | Agenda de profesionales, CRM pesado, cotizaciones por defecto |
| **Pizzería** | Pedidos con extras, POS, caja, combos, preparación y reparto | Agenda de profesionales y presupuestos genéricos |
| **Repostería** | Pedidos anticipados, personalización, presupuestos y seguimiento | Mesas, cocina en tiempo real y reservas de restaurante |
| **Boutique** | Tallas, stock, POS, promociones, imágenes y redes | Mesas, cocina y presupuestos de obras |
| **Cosméticos** | Inventario, variantes, catálogo visual, POS y promociones | Mesas, cocina y calendario de barbería |
| **Celulares y tecnología** | Modelos, inventario, presupuestos, CRM y consultas | Cocina, reservas de mesas y agenda de salón |
| **Ferretería** | Catálogo técnico, cotizaciones, CRM, tareas y entregas | Cocina, mesas y módulo de citas |
| **Repuestos** | Especificaciones, consultas de compatibilidad, cotizaciones y CRM | Cocina y gestión de mesas |
| **Salón de belleza** | Servicios, solicitudes de citas, WhatsApp, CRM y reseñas | KDS, mesas, delivery, caja y POS por defecto |
| **Barbería** | Servicios con fecha/hora, clientes, WhatsApp y CRM | KDS, mesas, delivery y POS por defecto |
| **Pet Shop** | Venta de productos, variantes, stock, caja y delivery | Reservas de mesas y cocina |
| **Floristería** | Pedidos personalizados, paquetes, presupuesto, fechas y entregas | Reservas de mesas y KDS |
| **Regalos personalizados** | Datos personalizados, cotizaciones, CRM y entregas | Mesas, cocina y caja por defecto |
| **Productos naturales y suplementos** | Catálogo, inventario, variantes, promociones y ventas | Agenda de salón, KDS y mesas |
| **Mayorista / distribuidor** | Clientes empresariales, presupuestos, lotes, POS, caja y sucursales | Restaurante, citas y fidelización minorista por defecto |
| **Otro tipo de negocio** | Catálogo base, pedidos, WhatsApp, clientes y analítica | Funciones especializadas desactivadas hasta configurarlas |

## Implementación técnica

- `apps/web/lib/merchant-modules.ts`: lista tipada de 26 módulos, valores por motor, ajustes de las 16 plantillas, sustitución de valores administrativos y compatibilidades estructurales.
- `apps/web/components/store-shell.tsx`: menú lateral, navegación móvil, botón del softphone y acceso visual coherentes con el perfil activo.
- `apps/web/app/dashboard/page.tsx`: indicadores y accesos directos condicionados por funciones activas.
- `apps/web/app/admin/templates/page.tsx`: editor agrupado de capacidades y módulos, vistas previas y recomendaciones por plantilla.
- `apps/web/components/platform-landing.tsx`: publicidad de módulos disponibles, no promesas de agendas inexistentes.
- `services/api/migrations/000052_template_module_profiles.up.sql`: inicialización no destructiva de perfiles.
- `scripts/test_4_6_0_template_modules.js`: prueba de correspondencia de perfiles, menú, compatibilidades y configuración; añadida a CI.

## Matices y límites reales

1. **Barberías y salones:** hoy WAMERCIO admite solicitudes de servicios con campos de fecha/hora. La ruta `/reservations` es de mesas de restaurantes, no una agenda de profesionales. No afirmar que existe una agenda profesional completa o disponibilidad por empleado.
2. **Pantalla KDS:** puede utilizarse para preparación de pedidos en restaurantes incluso sin mesas. Las mesas y reservaciones requieren que el establecimiento active consumo en salón.
3. **Datos comerciales:** al desactivar un módulo solo se oculta en el panel. No se borran pedidos, turnos, contactos ni registros; no se revocan permisos de los endpoints de backend. La autorización de API requiere una fase de seguridad separada si es necesaria.
4. **Configuración de tiendas existentes:** la migración pone la configuración inicial solo si no existía `module_features`. Los cambios administrativos en una plantilla se copian en **tiendas nuevas**; no se aplican automáticamente a tiendas ya creadas que tienen sus propias preferencias.
5. **Funcionalidades transversales:** WhatsApp, pedidos, clientes, catálogo y tienda siguen operativos para todos los perfiles.
6. **Módulos opcionales:** un negocio puede crecer y habilitar POS, caja, delivery, equipo, redes o CRM desde la plantilla, cuando correspondan. Se preserva el mismo patrón visual sin alterar el modelo de datos.
7. **Compilación:** las pruebas de perfiles y TypeScript del módulo central se ejecutaron localmente. La compilación Next.js completa deberá pasar en CI (NPM no disponible en el entorno de preparación). No se promete que el despliegue ya esté operativo.

## Despliegue Dokploy

1. Incorporar todos los archivos al repositorio utilizado por Dokploy (`basorastudio/wamercio`, rama `main`).
2. Verificar la ejecución en GitHub Actions de `Frontend production build` y la prueba de plantillas. No desplegar hasta que ambos terminen correctamente.
3. Con la CI verde, ejecutar **Deploy / Rebuild** en Dokploy. La migración `000052` se ejecuta con el arranque normal del servicio API si el despliegue ya tiene la ejecución de migraciones configurada.
4. Revisar cada perfil desde **SuperAdmin → Plantillas → Editar** y crear un comercio de prueba por familia de negocio para verificar WhatsApp, catálogo, checkout, pedidos y el menú.
5. No eliminar la base de datos, ni registros existentes ni credenciales `.env`.

## Pruebas de aceptación propuestas

- Restaurante con mesa desactivada: puede ver KDS si está habilitado, pero no gestión de mesas. Con mesa activada: permite mesas y reservaciones.
- Salón de belleza: no debe mostrar reservas de mesas ni KDS; conserva solicitudes de cita y WhatsApp.
- Ferretería: debe poder administrar presupuestos y seguimiento; no mostrar módulos gastronómicos.
- Mayorista: deberá mostrar cotizaciones, POS, caja, sucursales y CRM comercial.
- Plantilla personalizada: al modificar interruptores cambia el perfil copiado a un comercio nuevo sin eliminar datos anteriores.
- Tienda existente: conserva sus preferencias; el menú móvil y el Dashboard reflejan el mismo perfil.
