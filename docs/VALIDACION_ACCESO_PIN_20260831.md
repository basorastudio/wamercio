# Validación — Acceso, PIN configurable y recuperación

Fecha: 31/08/2026

## Alcance validado

- Nueva sección **Configuración → Seguridad y cumplimiento → Acceso**.
- Pestaña **PIN de acceso** con dos longitudes independientes configurables entre 4 y 8 dígitos: administración y clientes.
- Pestaña **Recuperación** con activación, vigencia del código e intentos máximos.
- Formularios de alta de propietarios, clientes, usuarios SaaS y usuarios de negocio adaptados a la longitud vigente.
- Inicio de sesión adaptado a la política correspondiente: clientes usan su longitud propia y administradores, propietarios, cajeros, repartidores y usuarios SaaS usan la longitud administrativa.
- Compatibilidad con longitudes históricas para no bloquear credenciales ya existentes al cambiar la política.
- Recuperación simplificada: WhatsApp previamente verificado → envío de código → casillas OTP → un solo PIN nuevo.
- Eliminados del formulario de recuperación el selector de tipo de cuenta, el campo editable de WhatsApp y la confirmación del nuevo PIN.
- Recuperación central para propietarios y usuarios SaaS sin depender de la base de datos de un negocio.
- Cuando recuperación está desactivada, los accesos dejan de ofrecer el enlace **¿Olvidaste tu PIN?**.

## Comprobaciones realizadas

- `gofmt` aplicado a los archivos Go modificados.
- `npm run test:source`: **correcto**.
- Transpilación sintáctica de 104 archivos TypeScript/TSX con TypeScript 5.8.3: **correcta**.
- Búsqueda de validaciones fijas de PIN de 6 dígitos en los flujos de acceso: **sin dependencias fijas restantes**; el código OTP de recuperación permanece intencionalmente en 6 dígitos.
- La confirmación de PIN se conserva únicamente en cambios voluntarios de PIN desde perfiles, no en el flujo de recuperación solicitado.

## Limitación del entorno de validación

No fue posible ejecutar la suite Go completa. El proyecto declara Go 1.26 y el entorno disponible tiene Go 1.23.2; la descarga automática del toolchain y dependencias desde `proxy.golang.org` está bloqueada por falta de acceso de red. El código Go modificado sí fue procesado correctamente por `gofmt`, lo que valida su sintaxis estructural básica.

## Migración nueva

`backend/db/core_migrations/000026_platform_access_recovery.up.sql`

Crea el almacenamiento central de desafíos de recuperación para usuarios SaaS y propietarios. La migración se ejecuta con el mecanismo normal de migraciones del backend durante el despliegue.
