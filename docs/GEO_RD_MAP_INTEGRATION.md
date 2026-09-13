# WAMERCIO + GEO RD MAP — Plataforma geoespacial central

WAMERCIO utiliza **GEO RD MAP** como capa geoespacial central para la plataforma SaaS y para cada negocio/tenant. La integración conserva los contratos internos de WAMERCIO y mantiene la API Key exclusivamente en el backend Go.

La integración cubre:

- catálogo territorial de República Dominicana;
- barrios personalizados y sugerencias centralizadas;
- geocodificación y geocodificación inversa;
- mapas para ubicación del negocio y seguimiento operativo;
- routing para entregas;
- geocercas / zonas de servicio por negocio;
- cálculo de cobertura y costo de entrega;
- cruce de la geocerca con la ubicación GPS del repartidor durante una entrega activa.

## Arquitectura

```text
Navegador / PWA de WAMERCIO
        |
        | endpoints internos /api/*
        v
Backend Go de WAMERCIO
        |
        | X-API-Key: <credencial privada>
        v
GEO RD MAP · https://geo.ltd.do
        |
        +-- Catálogo territorial
        +-- Geocodificación
        +-- Routing
        +-- Geocercas / zonas de servicio
```

La API Key de GEO RD MAP nunca usa un prefijo `NEXT_PUBLIC_*`, nunca se entrega al navegador y nunca se almacena dentro de una base de datos de un tenant.

## Configuración central

La configuración se administra desde:

**Superadministración → Configuración → Territorio**

Variables de respaldo:

```env
GEO_RD_MAP_ENABLED=false
GEO_RD_MAP_URL=https://geo.ltd.do
GEO_RD_MAP_API_KEY=
GEO_RD_MAP_TIMEOUT=12s
```

Todos los negocios consumen la misma integración central. Cada tenant guarda únicamente sus datos operativos: ubicación GPS, zonas de entrega, polígonos locales, referencias remotas y estados de sincronización.

## 1. Catálogo territorial

Los endpoints territoriales utilizados por el adaptador central son:

| Función | GEO RD MAP |
|---|---|
| Estado del catálogo | `GET /api/v1/territories/status` |
| Provincias | `GET /api/v1/territories/provinces` |
| Ciudades (municipios y D.M.) | `GET /api/v1/territories/cities?provinceCode=...` |
| Barrios oficiales + personalizados aprobados | `GET /api/v1/territories/cities/{cityId}/neighborhoods?includeCustom=true` |
| Sugerir barrio faltante | `POST /api/v1/territories/neighborhoods/custom/suggestions` |

La UI conserva el patrón:

```text
Provincia → Ciudad / Municipio / D.M. → Barrio / Sector / Paraje
```

Los barrios faltantes se envían como sugerencias a GEO RD MAP. Mientras una sugerencia está pendiente, WAMERCIO puede conservar el nombre enviado dentro del flujo local correspondiente sin publicarlo como catálogo global.

## 2. Geolocalización

Los negocios pueden definir su ubicación de tres formas:

1. GPS del dispositivo cuando el administrador se encuentra físicamente en el negocio;
2. coordenadas manuales;
3. búsqueda/geocodificación mediante GEO RD MAP a partir de la dirección estructurada.

Las direcciones de clientes también admiten GPS y geocodificación inversa. La latitud/longitud guardada permite evaluar geocercas con precisión, independientemente del texto del barrio.

Endpoints internos de WAMERCIO:

```text
GET  /api/geo/status
POST /api/geo/geocode
POST /api/geo/reverse
POST /api/client/geo/geocode
POST /api/client/geo/reverse
```

## 3. Routing

Para las entregas WAMERCIO intenta obtener primero la ruta desde GEO RD MAP. El resultado se normaliza a la estructura interna utilizada por el panel administrativo, el repartidor y el cliente:

```json
{
  "coordinates": [{"lat": 18.0, "lng": -70.0}],
  "distance_km": 4.8,
  "duration_minutes": 13,
  "source": "geo_rd_map"
}
```

Si el servicio espacial de GEO RD MAP no está disponible temporalmente, WAMERCIO conserva el fallback existente de routing compatible con OSRM y, como último recurso, una estimación directa. Esto evita detener una operación de entrega por una indisponibilidad externa.

Las rutas se cachean temporalmente para reducir llamadas repetidas.

## 4. Geocercas y zonas de servicio

En **Panel administrativo → Entregas → Zonas de entrega**, cada zona puede ser de dos tipos:

### Zona territorial

Usa el catálogo de provincia/ciudad/barrio y conserva el comportamiento histórico de WAMERCIO.

### Geocerca · GEO RD MAP

El administrador puede dibujar una cobertura directamente sobre el mapa:

1. define el nombre de la zona;
2. marca los vértices del polígono;
3. define el costo en RD$;
4. decide si la zona está activa;
5. WAMERCIO guarda inmediatamente una copia operativa en PostgreSQL del tenant;
6. el backend intenta sincronizar la geocerca con GEO RD MAP.

La zona almacena:

- tipo (`territorial` / `geofence`);
- identificador remoto de GEO RD MAP;
- servicio (`delivery`);
- polígono JSON;
- estado de sincronización;
- mensaje de error de sincronización, si existe;
- fecha de última sincronización.

La migración correspondiente es:

```text
backend/db/tenant_migrations/000032_geo_rd_map_delivery_areas.up.sql
```

### Resiliencia local

La copia del polígono en la base del tenant es intencional. Si GEO RD MAP está temporalmente fuera de servicio, la zona no desaparece y WAMERCIO puede continuar:

- evaluando si una dirección GPS cae dentro de la cobertura;
- calculando el precio asociado a la zona;
- mostrando el polígono durante la operación;
- reintentando la sincronización después.

El botón **Sincronizar** permite reintentar una geocerca pendiente o con error.

Endpoint interno:

```text
POST /api/delivery-zones/{id}/geo-sync
```

## 5. Selección automática de costo de entrega

Cuando un cliente selecciona entrega:

```text
Dirección GPS del cliente
        ↓
Geocercas activas del negocio
        ↓
Point-in-polygon
        ↓
Zona coincidente
        ↓
Costo de entrega de esa zona
```

Las geocercas tienen mayor especificidad que una zona territorial. Por ello un negocio puede mantener una cobertura territorial general y, al mismo tiempo, definir polígonos más precisos con precios distintos.

La comprobación se realiza tanto en frontend para una respuesta inmediata como nuevamente en el backend al crear el pedido. El backend es la autoridad final.

## 6. Seguimiento del repartidor

La ubicación en vivo de los repartidores continúa administrándose por la infraestructura operativa de WAMERCIO (GPS del dispositivo + Redis GEO + persistencia reciente). GEO RD MAP se utiliza como capa espacial para la ruta y la zona de servicio.

Durante una entrega activa el backend cruza:

```text
GPS del repartidor + polígono de la zona de entrega
```

para devolver `driver_inside`.

La misma geocerca puede visualizarse en:

- Centro de operaciones del administrador;
- ruta del repartidor;
- seguimiento en vivo del cliente.

Si el conductor está fuera del polígono, la interfaz puede indicarlo como **Fuera de geocerca** sin detener automáticamente la entrega.

El seguimiento del cliente se habilita únicamente durante la fase operativa correspondiente (`on_the_way`), siguiendo el comportamiento de privacidad ya establecido en WAMERCIO.

## 7. Adaptador de servicios espaciales

El contrato territorial está definido y se consume directamente. Para los servicios espaciales, el cliente Go mantiene un adaptador compatible con variantes de ruta comunes de GEO RD MAP y normaliza las respuestas a un único contrato interno de WAMERCIO.

Para geocercas, la solicitud incluye simultáneamente:

- `polygon`;
- `coordinates`;
- `vertices`;
- `geometry` en formato GeoJSON `Polygon`;
- metadatos de `platform`, `tenant_id`, `store_id` y `zone_id`.

Esto permite mantener desacoplado el resto del SaaS del formato exacto usado por el servicio espacial remoto. Si el endpoint remoto no está disponible, la copia local continúa siendo funcional y queda marcada para sincronización.

## 8. Caché y límites

El catálogo territorial utiliza caché en memoria y `singleflight`:

- estado: 1 minuto;
- provincias: `cache_minutes × 4`;
- ciudades: `cache_minutes × 2`;
- barrios: `cache_minutes`.

El botón **Actualizar desde GEO RD MAP** limpia esa caché y vuelve a consultar el servicio central; no crea una segunda copia del catálogo territorial dentro de WAMERCIO.

## 9. Principios de seguridad y multi-tenancy

- una sola credencial privada de GEO RD MAP en el backend central;
- ninguna credencial GEO en el navegador;
- cada zona se restringe por `store_id` y tenant;
- cada geocerca remota lleva metadatos de trazabilidad;
- el costo final de entrega se valida en servidor;
- el cliente no puede seleccionar arbitrariamente un precio;
- los GPS en vivo se exponen solamente a actores autorizados y dentro del flujo de entrega.

## 10. Flujo final de entrega con GEO RD MAP

```text
SuperAdmin configura GEO RD MAP
        ↓
Negocio fija su ubicación GPS
        ↓
Administrador crea zona territorial o geocerca
        ↓
Geocerca se guarda localmente + se sincroniza con GEO RD MAP
        ↓
Cliente guarda dirección / GPS
        ↓
WAMERCIO determina cobertura y costo
        ↓
Pedido de entrega
        ↓
GEO RD MAP calcula ruta (fallback OSRM si es necesario)
        ↓
Repartidor comparte GPS durante la operación
        ↓
Administrador y cliente ven ruta + geocerca + posición
        ↓
WAMERCIO conoce si el repartidor está dentro/fuera de la zona
```
