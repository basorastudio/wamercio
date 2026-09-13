# Copias de seguridad y recuperación de WAMERCIO

## Arquitectura

```text
Bases PostgreSQL de WAMERCIO
          │
          ▼
pg_dump personalizado (-Fc, sin compresión interna)
          │
          ▼
Compresión Zstandard nivel 19
          │
          ▼
Cifrado autenticado de Restic
          │
          ├── Contabo Object Storage
          │      └── Copia principal
          │
          └── Cloudflare R2
                 └── Copia crítica secundaria
```

Cada ejecución incluye la base central, la base global de clientes, todas las bases de negocios, los objetos globales de PostgreSQL sin contraseñas, un manifiesto y sumas SHA-256. Redis no se respalda porque no constituye la fuente de verdad de pedidos, inventario, caja o fiado.

## Configuración

El superadministrador configura la pestaña **Configuración → Backups**. La configuración queda en `platform_settings.backups` y es leída por el script del host. Deben completarse:

- Contraseña fuerte de Restic.
- Endpoint, región, bucket y credenciales S3 de Contabo.
- Account ID, endpoint, bucket y credenciales S3 de Cloudflare R2.
- Retención diaria, semanal y mensual.

La contraseña de Restic debe conservarse además en un gestor de secretos externo. Perderla hace imposible restaurar los repositorios cifrados.

## Dependencias del host

El instalador agrega `jq`, `zstd` y `restic`. Docker Compose y PostgreSQL continúan ejecutándose en contenedores.

## Ejecución manual

```bash
sudo COLMAPRO_PROJECT_DIR=/opt/colmapro \
  COLMAPRO_BACKUP_ROOT=/opt/colmapro_backups \
  /opt/colmapro/scripts/backup/create-backup.sh
```

La ejecución:

1. Consulta la configuración guardada por el superadministrador.
2. Crea una exportación personalizada por base.
3. Comprime cada exportación con Zstandard.
4. Genera manifiesto y sumas SHA-256.
5. Verifica cada dump mediante `pg_restore --list`.
6. Inicializa, si es necesario, ambos repositorios Restic.
7. Envía la copia cifrada a Contabo y Cloudflare R2.
8. Aplica la retención en ambos destinos.
9. Ejecuta una comprobación parcial de integridad de Restic.
10. Actualiza `/var/lib/colmapro/backup-status.json` sin incluir secretos.

## Programación diaria

```bash
sudo cp deploy/systemd/colmapro-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now colmapro-backup.timer
sudo systemctl list-timers colmapro-backup.timer
```

El temporizador se ejecuta a las 03:15 en `America/Santo_Domingo` con retraso aleatorio. La retención exacta se obtiene desde la pestaña Backups.

## Verificación local

```bash
sudo /opt/colmapro/scripts/backup/verify-backup.sh /opt/colmapro_backups/latest
```

Una copia no se considera válida hasta superar sumas SHA-256, prueba Zstandard y validación estructural de todos los dumps.

## Restauración

La restauración detiene frontend, backend y PgBouncer para impedir escrituras concurrentes.

```bash
sudo COLMAPRO_RESTORE_CONFIRM=RESTORE_COLMAPRO \
  /opt/colmapro/scripts/backup/restore-backup.sh \
  /opt/colmapro_backups/20260716T071500Z all
```

Una sola base:

```bash
sudo COLMAPRO_RESTORE_CONFIRM=RESTORE_COLMAPRO \
  /opt/colmapro/scripts/backup/restore-backup.sh \
  /opt/colmapro_backups/20260716T071500Z cp_example_business
```

## Simulacro obligatorio

Antes del piloto y al menos trimestralmente:

1. Restaurar una copia de Contabo en staging.
2. Restaurar otra copia independiente desde Cloudflare R2.
3. Validar acceso, productos, ventas, inventario, caja, fiado y pedidos.
4. Bloquear notificaciones reales durante el simulacro.
5. Registrar duración, errores y acciones correctivas.
6. Confirmar que la contraseña de Restic puede recuperarse desde el gestor autorizado.
