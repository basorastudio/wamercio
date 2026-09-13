# Plantillas de notificaciones de WhatsApp

WAMERCIO administra las plantillas desde **Superadministración → Configuración → Notificaciones**.

## Alcances

- **Plataforma:** mensaje predeterminado para todos los negocios.
- **Negocio:** personalización para un tenant concreto. Tiene prioridad cuando la plantilla de plataforma permite personalización.

## Endpoints

```text
GET    /api/platform/notification-templates
POST   /api/platform/notification-templates
PATCH  /api/platform/notification-templates/{id}
DELETE /api/platform/notification-templates/{id}
```

Todos requieren sesión de plataforma y el permiso `settings.manage`.

## Variables disponibles

Las plantillas aceptan variables con el formato `{{variable}}`:

```text
{{cliente}}
{{negocio}}
{{pedido_id}}
{{total}}
{{estado}}
{{monto}}
{{saldo}}
{{metodo}}
{{titulo}}
{{mensaje}}
```

Los valores se resuelven al procesar la notificación. Si una plantilla está inactiva o no existe, WAMERCIO conserva el texto interno del evento.

## Eventos iniciales

```text
system.welcome
registration.client.completed
registration.owner.created
order.created
order.status.changed
store_credit.payment.recorded
security.access.changed
```

Los eventos son extensibles y pueden agregarse desde el formulario.

## Persistencia

La migración central `000023_notification_templates` crea la tabla `notification_templates`, índices por alcance/evento y plantillas iniciales. El backend también verifica el esquema al iniciar los workers para instalaciones que tienen las migraciones automáticas desactivadas.
