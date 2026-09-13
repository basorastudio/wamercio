# WAMERCIO API endpoints

Production base path: `/api`.

## Public and runtime

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /api/health`
- `GET /api/runtime-config`
- `GET /api/landing`
- `GET /api/legal` — publica los términos, la política de privacidad y los datos legales configurados en el panel SaaS.
- `GET /api/pwa/manifest.json`
- `GET /api/pwa/icon.png?size=192|512` — devuelve el icono dinámico del negocio o el icono seguro de WAMERCIO.
- `GET /api/og/store`
- `GET /api/tenant`
- `GET /api/bootstrap`
- `GET /api/events`

## Platform administration

Authentication begins with `POST /api/platform/login`. Authenticated platform routes include:

- plans, owners and business types
- territory management
- businesses, domains, databases and subscriptions
- global catalog and banks
- global customers
- platform settings and WhatsApp integration
- audit logs and capacity information

The canonical business collection is `/api/platform/businesses`.

La pestaña **Legal** guarda su contenido en `platform_settings.legal` mediante `PATCH /api/platform/settings`. Los documentos públicos se muestran siempre desde el dominio principal de WAMERCIO y el frontend conserva valores predeterminados si el backend está temporalmente indisponible.

### WAXUM and the global WhatsApp session

The platform settings endpoint stores the WAXUM provider configuration under `platform_settings.waxum`. The authenticated platform WhatsApp workflow exposes:

- `POST|PATCH /api/platform/waxum/configure` validates the WAXUM base URL and Bearer token and saves the provider configuration without creating a WhatsApp session. If the provider is disabled or replaced, WAMERCIO removes its global and business sessions from the previous WAXUM instance before committing the change.

- `GET /api/platform/whatsapp`
- `POST /api/platform/whatsapp/instance` (stable compatibility alias)
- `POST /api/platform/whatsapp/session`
- `POST /api/platform/whatsapp/connect`
- `GET /api/platform/whatsapp/qr`
- `POST /api/platform/whatsapp/pairing-code`
- `GET /api/platform/whatsapp/status`
- `POST /api/platform/whatsapp/disconnect`
- `POST /api/platform/whatsapp/validate-number`

`POST /api/platform/whatsapp/instance` and `POST /api/platform/whatsapp/session` remain compatibility aliases for an explicit linking action. Ordinary configuration and state reads never create sessions. QR and pairing actions create the remote session only when requested, while status reconciliation and the cleanup worker delete expired or externally unlinked sessions.

The backend uses the bundled typed WAXUM SDK for session lifecycle, contact validation, profile pictures, account recovery and business notifications.

Business creation at `POST /api/platform/businesses` and `POST /api/admin/businesses` also accepts `Idempotency-Key`. Provisioning stages are persisted centrally, an interrupted request resumes the same tenant, active leases reject concurrent duplicates, and completed retries return the original tenant.

## Business administration

- `POST /api/admin/lookup`
- `POST /api/admin/login`
- `POST /api/admin/staff-login`
- `GET /api/admin/session`
- `GET /api/admin/businesses`
- `GET /api/admin/businesses/settings`
- `PATCH /api/admin/businesses/{id}/store`
- `GET /api/admin/profile`
- `PATCH /api/admin/profile`
- `POST /api/admin/password`

When the administration panel is opened on the root SaaS domain, tenant-aware requests include `X-WAMERCIO-Tenant`.

## Customer identity, cart and orders

- `POST /api/client/lookup`
- `POST /api/client/validate-whatsapp`
- `POST /api/client/register`
- `POST /api/client/login`
- `GET /api/client/session`
- `PATCH /api/client/profile`
- `GET|POST /api/client/orders`
- `POST /api/client/orders/{id}/pickup`
- `GET|PATCH|DELETE /api/client/cart`

Customer identity lives in the global customer database. Operational order and cart data is stored in the resolved tenant database.

`POST /api/client/orders` accepts an optional `Idempotency-Key` header (maximum 128 non-whitespace characters). Repeating the same key and payload returns the original order with `Idempotency-Replayed: true`; reusing the key for a different payload returns HTTP 409.

Metrics and pprof are intentionally absent from the public API. They bind to the private `INTERNAL_ADDR` listener only.

## Tenant operations

The tenant API includes stores, users, products, categories, brands, customers, delivery zones, bank accounts, cash history, sales, assisted orders and store credit.

Important canonical routes:

- `GET /api/stores`
- `GET /api/delivery-zones`
- `POST /api/sales`
- `POST /api/assisted-orders`
- `POST /api/store-credits`
- `PATCH /api/store-credits/{id}/payment`
- `PATCH /api/orders/{id}/status`

### Professional delivery workflow

Administrator routes:

- `GET /api/delivery/live`
- `GET /api/delivery/drivers`
- `GET /api/delivery/orders/{id}/route`
- `GET /api/client/orders/{id}/tracking`
- `POST /api/delivery/orders/{id}/assign`

Assigned-driver routes:

- `GET /api/delivery/orders`
- `GET /api/delivery/orders/{id}/route`
- `POST /api/delivery/orders/{id}/accept`
- `POST /api/delivery/orders/{id}/start`
- `POST /api/delivery/orders/{id}/complete`
- `POST /api/delivery/orders/{id}/issue`
- `POST /api/delivery/location`
- `POST /api/delivery/route/optimize`

Delivery orders follow `pending -> preparing -> ready_for_delivery -> on_the_way -> delivered`. Pickup orders follow `pending -> preparing -> ready_for_delivery -> delivered`; the ready state is shown to the customer as **Listo**, and only the authenticated owner can confirm collection through `POST /api/client/orders/{id}/pickup`. When exactly one active delivery driver exists in the tenant, entering `ready_for_delivery` assigns and accepts that driver automatically in the same transaction, so the next action is `start`. Manual assignment and `accept` remain available when multiple active drivers exist. The customer or assisted-order address must match an active delivery zone. Completion requires the customer delivery PIN or a manual proof, and the backend records the responsible driver.

Protected endpoints use Bearer tokens issued for platform administrators, business administrators, staff or customers according to the route.


### Live monitoring and road geometry

`GET /api/delivery/live?store_id={storeId}` returns the protected operational snapshot for the selected store, including active delivery states, assigned drivers, fresh authenticated driver positions and the official store origin.

`GET /api/delivery/orders/{id}/route` returns the store-to-customer route geometry, distance and estimated duration. The route is calculated through the configurable OSRM-compatible `ROUTING_SERVICE_URL`, cached in Redis for a short period, and falls back to a direct geographic line when the external routing service is unavailable. Assigned delivery drivers can only request routes for their own orders.

Driver GPS updates publish a coordinate-free `delivery_tracking_updated` tenant event. Administrators use that event only as a refresh signal and then retrieve coordinates through the authenticated live endpoint.

### Store location

`PATCH /api/stores/{id}` and `PATCH /api/admin/businesses/{tenantId}/store` accept:

```json
{
  "latitude": 18.4861,
  "longitude": -69.9312,
  "location_accuracy": 12,
  "location_source": "device"
}
```

Latitude and longitude must be submitted together. Send both as `null` to clear the point. The server sets `location_updated_at`, validates coordinate ranges, and synchronizes Redis GEO without making Redis a critical dependency.

The same optional location fields are accepted while provisioning a business through `POST /api/platform/businesses` or `POST /api/admin/businesses`. When supplied, the initial tenant store is created with its official coordinates and indexed in the tenant Redis GEO namespace after provisioning.


### Redis GEO mirrors

When Redis is available, store coordinates, fresh delivery-driver positions, and active delivery destinations are mirrored into tenant-isolated GEO indexes. Route optimization reads the fresh driver GEO point first and can use the store GEO point as the route origin; PostgreSQL remains the authoritative fallback and automatically repopulates an empty store index. Redis failures do not reject orders, location updates, or business configuration changes. Driver presence metadata expires automatically; completed and non-routable delivery destinations are removed from the active index.

## Access PIN policy

- New account access PINs contain exactly six numeric digits.
- Existing four-digit access PINs remain valid temporarily for sign-in and PIN rotation.
- Any newly created or changed access PIN must use six digits.
- Delivery confirmation uses a separate four-digit order PIN and is intentionally unchanged.



### Customer delivery tracking

`GET /api/client/orders/{id}/tracking` is protected by the customer session and verifies that the requested order belongs to the authenticated customer. It exposes only that order's store origin, destination, road route, and fresh assigned-driver position, and only while the order is `on_the_way`. It never returns other customers, deliveries, drivers, or tenant-wide operational data.

## Production business operations

Authentication sessions are delivered through secure `HttpOnly` cookies. Bearer tokens are accepted only as a temporary backward-compatibility path for sessions created by older versions.

Business security and recovery:

- `POST /api/account-recovery/request`
- `POST /api/account-recovery/verify`
- `POST /api/account-recovery/reset`
- `POST /api/session/logout?scope=admin|staff|client|platform|all`

Paginated and operational routes:

- `GET /api/sales?store_id={id}&limit={n}&offset={n}`
- `POST /api/sales/{id}/void`
- `POST /api/sales/{id}/returns`
- `GET /api/inventory/movements?store_id={id}&limit={n}&offset={n}`
- `GET /api/customers?store_id={id}&search={text}&limit={n}&offset={n}`
- `POST /api/store-credits/customer-payment`
- `PATCH /api/store-credits/{id}/payment`
- `GET /api/cash/sessions/current?store_id={id}`
- `GET /api/cash/sessions?store_id={id}`
- `POST /api/cash/sessions`
- `POST /api/cash/movements`
- `POST /api/cash/sessions/{id}/close`
- `GET /api/reports/summary?store_id={id}&from={date}&to={date}`
- `GET /api/audit-logs?store_id={id}&limit={n}&offset={n}`
- `GET /api/notifications?store_id={id}&limit={n}&offset={n}`
- `PATCH /api/notifications/{id}/read`

Payment values accepted by business sales are limited to `cash`, `bank_transfer`, `card` (external physical terminal) and `store_credit`. These values record an offline operation and never authorize an electronic payment.


## Accounting, procurement, and product batches

All routes below require a business administrator session and are isolated to the selected tenant database.

Accounting:

- `GET /api/accounting/opening-balance?store_id={id}`
- `POST /api/accounting/opening-balance`
- `GET /api/accounting/dashboard?store_id={id}&from={date}&to={date}`
- `GET|POST /api/accounting/accounts`
- `PATCH /api/accounting/accounts/{id}`
- `GET|POST /api/accounting/journal-entries`
- `GET /api/accounting/journal-entries/{id}`
- `POST /api/accounting/journal-entries/{id}/post`
- `POST /api/accounting/journal-entries/{id}/void`
- `GET /api/accounting/trial-balance?store_id={id}&to={date}`
- `GET /api/accounting/ledger?store_id={id}&from={date}&to={date}`
- `GET|POST /api/accounting/periods`
- `POST /api/accounting/periods/{id}/close`

Procurement and suppliers:

- `GET|POST /api/suppliers`
- `PATCH /api/suppliers/{id}`
- `GET /api/suppliers/payables?store_id={id}`
- `POST /api/suppliers/{id}/payments`
- `GET|POST /api/purchase-orders`
- `GET /api/purchase-orders/{id}`
- `POST /api/purchase-orders/{id}/submit`
- `POST /api/purchase-orders/{id}/cancel`
- `POST /api/purchase-orders/{id}/receive`
- `GET /api/inventory/purchase-suggestions?store_id={id}`
- `POST /api/inventory/purchase-suggestions/generate`
- `PATCH /api/inventory/purchase-suggestions/{id}`
- `PATCH /api/products/{id}/reorder-policy`

Batches and expiration:

- `GET|POST /api/inventory/batches`
- `PATCH /api/inventory/batches/{id}`
- `GET /api/inventory/batches/{id}/movements`
- `GET /api/inventory/batches/expiring?store_id={id}`

Purchases, receipts, stock movements, FEFO allocations, supplier balances, and their accounting entries are committed atomically. Payments remain manual or offline: cash, bank transfer recorded by the business, external card terminal, and supplier/customer credit.


## Identidad API

Estas rutas requieren una sesión autenticada del panel de plataforma. La lectura y configuración requieren `settings.manage`; la verificación acepta `businesses.manage` o `settings.manage`. La credencial de `id.ltd.do` permanece exclusivamente en el backend.

- `GET /api/platform/identity` — devuelve el estado sanitizado de la integración.
- `PATCH /api/platform/identity/configure` — guarda URL, Client ID, timeout, política, límites por dispositivo y API key privada. Una `api_key` vacía conserva la clave existente.
- `POST /api/platform/identity/verify` — verifica una cédula o RNC mediante el backend de WAMERCIO.

Las verificaciones del navegador envían `X-WAMERCIO-Device-ID`, un identificador aleatorio y opaco almacenado localmente. El backend lo transforma en hash y aplica `device_limit_max` dentro de `device_limit_window_minutes`. Si el proveedor de identidad falla o el dispositivo alcanza el límite, el alta continúa con estado de revisión manual y no consume una nueva consulta externa. Los errores de autenticación del proveedor, límites remotos, timeouts y respuestas 5xx también activan esta contingencia; no se interpretan como una identidad inválida.

Ejemplo de verificación interna:

```json
{
  "tipo_sujeto": "persona",
  "documento": "00000000000",
  "contexto": "registro_propietario"
}
```

Contextos permitidos: `registro_propietario`, `registro_negocio`, `alta_empleado`, `alta_repartidor`, `alta_proveedor`, `registro_cliente`, `actualizar_perfil` y `prueba_conexion`. El backend envía `X-Application-Domain` usando `APP_DOMAIN`, propaga `X-Request-ID`, enmascara documentos en auditoría y nunca devuelve `IDENTIDAD_API_KEY`.

### Plantillas de notificaciones de WhatsApp

- `GET /api/platform/notification-templates`
- `POST /api/platform/notification-templates`
- `PATCH /api/platform/notification-templates/{id}`
- `DELETE /api/platform/notification-templates/{id}`

Permite administrar plantillas globales y personalizaciones por negocio. Requiere `settings.manage`.

### WhatsApp por negocio

Estas rutas requieren una sesión autenticada del propietario o administrador del negocio. La configuración global de WAXUM permanece en el panel SaaS; las credenciales del proveedor nunca se exponen al navegador.

- `GET /api/admin/businesses/{id}/whatsapp` — crea o recupera la sesión WAXUM del negocio y devuelve su estado sanitizado.
- `GET /api/admin/businesses/{id}/whatsapp/qr` — inicia la vinculación y devuelve el código QR.
- `POST /api/admin/businesses/{id}/whatsapp/pairing-code` — genera un código de emparejamiento para el número enviado en `phone`.
- `GET /api/admin/businesses/{id}/whatsapp/status` — actualiza número, nombre e imagen de perfil después de vincular.
- `POST /api/admin/businesses/{id}/whatsapp/disconnect` — desconecta y elimina la sesión remota del negocio.

La sesión se identifica en WAXUM con el `slug` del negocio, que corresponde a su subdominio. En WhatsApp, el dispositivo vinculado se presenta como `WAMERCIO`. Las notificaciones del negocio usan primero esta sesión; mientras no esté vinculada, el worker conserva como contingencia la sesión global de la plataforma.
