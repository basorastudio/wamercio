# Actualización a WAMERCIO 2.3.0

WAMERCIO 2.3.0 convierte **SuperAdmin → Configuración → Centro SaaS** en un panel funcional con persistencia por sección, secretos cifrados, pruebas de integraciones y políticas de acceso dinámicas.

## Variable nueva obligatoria

Añade en Dokploy una clave larga y permanente:

```env
PLATFORM_CONFIG_SECRET=<secreto-aleatorio-largo>
```

Esta clave cifra las credenciales privadas guardadas desde el Centro SaaS (GEO RD MAP, Identidad Dominicana y R2). **No la cambies después de guardar secretos**, porque una clave distinta no podrá descifrar los valores existentes.

## Despliegue

1. Añade `PLATFORM_CONFIG_SECRET` al entorno de Dokploy.
2. Sube WAMERCIO 2.3.0 al repositorio.
3. Ejecuta **Rebuild + Redeploy**.
4. El API aplicará la migración `000015_platform_settings_functional` durante el arranque normal.
5. Entra a **SuperAdmin → Configuración** y guarda/probar cada integración necesaria.

## Compatibilidad

- No cambia la arquitectura de negocios ni las URLs `wamercio.com/{slug}`.
- No requiere borrar PostgreSQL ni Redis.
- Mantiene compatibilidad con PIN anteriores cuando cambia la longitud configurada para propietarios.
- Los secretos no regresan al navegador; la UI solo recibe indicadores `*_configured`.
