# Integración GEO RD MAP — wamercio

wamercio consume **GEO RD MAP API v2.6.1** exclusivamente desde el backend Go. La API key nunca se entrega al navegador; Next.js llama al backend y este actúa como fachada hacia `https://geo.ltd.do`.

## Objetivo funcional

La integración sustituye los campos territoriales libres del sistema antiguo por una capa geográfica dominicana común para:

- registro de negocios;
- registro de clientes;
- checkout y direcciones de entrega;
- marketplace local;
- zonas y tarifas de delivery;
- distancia y ETA de la entrega;
- búsquedas y autocomplete de lugares/direcciones;
- reverse geocoding;
- barrios personalizados sugeridos;
- configuración y datos de mapa.

## Configuración

Variables de entorno:

```env
GEO_RD_MAP_BASE_URL=https://geo.ltd.do
GEO_RD_MAP_API_KEY=geo_TU_API_KEY
GEO_RD_MAP_PUBLIC_RATE_LIMIT=60
```

Scopes utilizados por la integración completa:

```text
territories:read
territories:write
geo:read
geo:write
routing:read
```

Si no se utilizarán sugerencias de barrios puede omitirse `territories:write`. Si se desactiva la confirmación/aprendizaje de selecciones externas puede omitirse `geo:write`.

## Identificadores persistidos

No se usa el nombre visible como clave territorial. PostgreSQL conserva los identificadores estables devueltos por GEO RD MAP:

- `geo_province_code` (`provinceCode`);
- `geo_city_id` (`cityId`);
- `geo_neighborhood_id`;
- `geo_id` (`GeoID`) cuando existe;
- coordenadas WGS84 (`latitude`, `longitude`);
- etiqueta y fuente de la dirección.

Los nombres de provincia, ciudad y barrio siguen guardándose como texto de presentación/compatibilidad, pero la relación territorial principal usa los IDs GEO.

## Selectores progresivos

El frontend utiliza el endpoint proxy de wamercio:

```text
GET /api/v1/public/geo/selectors
```

que internamente consume:

```text
GET /api/v1/territories/selectors
```

Flujo:

```text
Provincia → Ciudad → Barrio / sector
```

`Ciudad` representa tanto municipios como distritos municipales, siguiendo el contrato de GEO RD MAP.

## Búsqueda, autocomplete y ubicación actual

wamercio expone:

```text
GET  /api/v1/public/geo/search
GET  /api/v1/public/geo/autocomplete
GET  /api/v1/public/geo/reverse
POST /api/v1/public/geo/selections
POST /api/v1/public/geo/validate-address
```

La UI permite:

1. buscar una calle, residencial, sector o lugar;
2. seleccionar un resultado;
3. usar la geolocalización del navegador;
4. ejecutar reverse geocoding;
5. validar que la coordenada esté en República Dominicana y que coincida con provincia/ciudad;
6. conservar GeoID, `cityId`, coordenadas, fuente y etiqueta normalizada.

Cuando GEO RD MAP devuelve `selectionToken`, el backend puede confirmar la selección para que GEO RD MAP aprenda lugares externos válidos dentro de RD sin que wamercio se conecte directamente a Google Places, Nominatim u Overture.

## Barrios faltantes

El selector ofrece **¿No encuentras tu barrio o sector?**. La sugerencia se envía por:

```text
POST /api/v1/public/geo/neighborhood-suggestions
```

El backend la remite a GEO RD MAP con `X-Tenant-ID` cuando existe un tenant. La sugerencia queda pendiente de aprobación central; wamercio no crea territorios arbitrarios en su propia base.

## Registro de negocios

El onboarding requiere:

```text
Identidad del responsable
        ↓
RNC cuando corresponde
        ↓
GEO RD MAP
Provincia → Ciudad → Barrio
        ↓
Dirección exacta / Mi ubicación
        ↓
Coordenadas verificadas
        ↓
Crear tenant
```

El backend vuelve a validar el territorio y la coordenada antes de insertar el negocio. Los textos enviados por el navegador no son fuente de verdad.

## Registro de clientes

La identidad verificada permanece global y la dirección comercial permanece vinculada a la relación `customer` del tenant. Esto permite que una misma persona sea cliente de varios negocios con direcciones independientes.

## Delivery y geocercas

El OpenAPI público permite consultar geocercas, comprobar pertenencia y obtener detalle, pero no crear/editar geocercas. Por ello wamercio no inventa operaciones no documentadas.

El panel del negocio usa:

```text
GET  /api/v1/dashboard/geo/geofences
GET  /api/v1/dashboard/geo/geofences/{id}
POST /api/v1/dashboard/delivery-zones/geofence
```

Flujo:

```text
Geocerca central de GEO RD MAP
            ↓
Negocio la vincula
            ↓
Asigna tarifa RD$ + prioridad
            ↓
delivery_zones.geo_geofence_id
```

La geometría y propiedades se guardan como snapshot local para presentación y auditoría, mientras el chequeo real de cobertura se vuelve a consultar en GEO RD MAP.

## Cotización del delivery

El cliente consulta:

```text
GET /api/v1/public/tenants/{slug}/delivery/quote?lat=...&lng=...
```

El servidor:

1. comprueba qué geocercas `serviceType=delivery` contienen la coordenada;
2. cruza esos IDs con las zonas vinculadas por el comercio;
3. elige la zona por prioridad;
4. aplica la tarifa almacenada por el negocio;
5. calcula la ruta desde el negocio al cliente cuando el origen tiene coordenadas;
6. devuelve distancia y ETA.

Si el negocio ha configurado geocercas GEO y ninguna contiene al cliente, la dirección se considera fuera de cobertura.

## Seguridad del checkout

La cotización mostrada en el navegador es informativa. Al confirmar el pedido, Go vuelve a:

- normalizar provincia/ciudad;
- validar coordenadas;
- consultar geocercas;
- resolver la zona local;
- recalcular tarifa;
- recalcular ruta/ETA;
- guardar la zona y métricas en el pedido.

Por tanto modificar `fee`, `zone` o la etiqueta mediante DevTools no altera el cálculo final.

## Routing

El backend consume:

```text
POST /api/v1/routing/route
```

con perfil `auto`, unidades `kilometers` e idioma `es-ES`. Los pedidos guardan:

- `route_distance_km`;
- `route_duration_seconds`.

El proxy público `/api/v1/public/geo/route` queda disponible para experiencias visuales autorizadas sin revelar la API key.

## Marketplace local

Los marketplaces y tenants pueden guardar `geo_city_id`. La pertenencia se resuelve primero mediante ese ID y solo utiliza los UUID territoriales antiguos como compatibilidad con datos heredados.

Así onboarding, clientes, delivery y marketplace comparten la misma geografía.

## Mapas

El backend incluye fachada para:

```text
GET /api/v1/public/geo/map/config
GET /api/v1/public/geo/map/features
GET /api/v1/public/geo/map/tiles/{z}/{x}/{y}.pbf
```

Las teselas vectoriales se retransmiten desde el backend y la API key no queda embebida en el navegador. El panel de delivery utiliza además la geometría real de la geocerca para una previsualización ligera de cobertura.

## Rate limit

Los endpoints públicos GEO se limitan con Redis por IP y flujo. El límite base se controla mediante:

```env
GEO_RD_MAP_PUBLIC_RATE_LIMIT=60
```

Las teselas, búsquedas, selectores, reverse geocoding, validaciones, rutas, cotizaciones y sugerencias tienen protección independiente.

## Migración PostgreSQL

La integración está en:

```text
apps/api/internal/migrate/migrations/006_geo_rd_map.sql
```

Añade IDs territoriales y coordenadas a tenants/clientes, enlace de geocercas a `delivery_zones`, métricas de ruta al pedido y `geo_city_id` a marketplaces.

## Regla arquitectónica

wamercio no consume directamente Overture, Google Places, Nominatim ni Valhalla. Todas esas capacidades pasan por GEO RD MAP, manteniendo una única política de datos geográficos para República Dominicana.
