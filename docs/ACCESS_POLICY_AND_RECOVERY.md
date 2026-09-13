# Política de acceso y recuperación

WAMERCIO centraliza la seguridad de acceso desde **Superadministración → Configuración → Acceso**, pero separa la experiencia según el tipo de cuenta.

## Dos políticas de PIN independientes

La pestaña **PIN de acceso** permite configurar dos longitudes diferentes, ambas entre **4 y 8 dígitos**:

- **PIN administrativo**: propietarios, usuarios SaaS, administradores, cajeros y repartidores. Valor recomendado/predeterminado: **6 dígitos**.
- **PIN de clientes**: compradores que acceden a las tiendas. Valor recomendado/predeterminado: **4 dígitos**.

Las dos configuraciones son independientes. Cambiar el PIN de clientes no modifica el administrativo y viceversa.

La política se almacena en `platform_settings` con la clave `access_policy`; no requiere una migración adicional de PostgreSQL.

### Compatibilidad con cuentas existentes

Cuando se cambia una longitud, WAMERCIO conserva las longitudes utilizadas anteriormente únicamente para iniciar sesión con credenciales ya creadas. Todo registro, cambio o recuperación de PIN nuevo debe cumplir la longitud vigente de su grupo.

Al actualizar desde una instalación que tenía una única propiedad `pin_length`, WAMERCIO:

- conserva esa longitud como compatibilidad para las cuentas existentes;
- mantiene la longitud administrativa previamente configurada;
- establece el PIN de clientes en 4 dígitos para nuevos PIN, conservando la longitud histórica para no bloquear clientes existentes.

## Endpoint público

`GET /api/access-policy`

Campos principales:

```json
{
  "admin_pin_length": 6,
  "customer_pin_length": 4,
  "accepted_admin_pin_lengths": [4, 6],
  "accepted_customer_pin_lengths": [4, 6],
  "recovery_enabled": true,
  "recovery_method": "link",
  "recovery_code_length": 6,
  "recovery_ttl_minutes": 10,
  "recovery_max_attempts": 5
}
```

`pin_length` y `accepted_pin_lengths` continúan devolviéndose como alias temporales de la política administrativa para clientes frontend antiguos.

## SuperAdmin

- `GET /api/platform/access-policy`
- `PATCH /api/platform/access-policy`

Ejemplo:

```json
{
  "admin_pin_length": 6,
  "customer_pin_length": 4,
  "recovery_enabled": true,
  "recovery_method": "link",
  "recovery_ttl_minutes": 10,
  "recovery_max_attempts": 5
}
```

## Aplicación de la política

### Administración

Usan `admin_pin_length`:

- propietarios;
- usuarios SaaS;
- administrador del negocio;
- cajeros;
- repartidores;
- registro, inicio de sesión, cambio de PIN y recuperación de esas cuentas.

### Clientes

Usan `customer_pin_length`:

- creación de cuenta en una tienda;
- inicio de sesión como cliente;
- edición/cambio del PIN del perfil;
- recuperación OTP o CTA URL.

Si el formulario de acceso de una tienda detecta que el WhatsApp pertenece a un administrador, cajero o repartidor, cambia automáticamente a la política administrativa antes de solicitar el PIN.

## Recuperación por WhatsApp

Los dos métodos existentes siguen disponibles:

1. **Código OTP por WhatsApp**.
2. **Enlace seguro · CTA URL de Waxum**.

La longitud del OTP sigue siendo fija en 6 dígitos. Después de validar el OTP o el enlace CTA, el PIN nuevo utiliza la longitud correspondiente al tipo de cuenta: administrativa o cliente.

El flujo no vuelve a solicitar tipo de cuenta ni WhatsApp y no solicita confirmación del nuevo PIN.

## Pantalla de recuperación

La ruta `#/recover-account` se presenta como una capa de viewport completo:

- fondo oscuro ocupa todo el navegador;
- no deja una franja blanca inferior;
- bloquea el desplazamiento del documento mientras está activa;
- no muestra una barra de desplazamiento externa innecesaria;
- la autorización CTA validada continúa persistiendo temporalmente para soportar refrescos del navegador.

## Consistencia del PIN de clientes

El PIN del cliente forma parte de su identidad global. Cuando un cliente cambia o recupera su PIN, WAMERCIO sincroniza el hash global y propaga la nueva credencial a los tenants vinculados para evitar que una copia local conserve un PIN anterior.

## Seguridad

- Las longitudes se validan tanto en frontend como en backend.
- El backend decide qué política corresponde según el tipo de cuenta; manipular el formulario no permite guardar un PIN con una longitud incorrecta.
- Las credenciales siguen almacenándose como hashes.
- Los códigos de recuperación se almacenan como HMAC.
- Los tokens de recuperación están firmados, tienen vencimiento y son de un solo uso.
- La recuperación central de propietarios/usuarios SaaS continúa independiente de un tenant.
