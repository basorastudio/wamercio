# WAMERCIO 4.0.0 — Despliegue en Dokploy

## Antes de desplegar

1. Realiza backup de PostgreSQL.
2. Conserva los volúmenes `postgres_data`, `redis_data` y `uploads_data`.
3. Sustituye el código por WAMERCIO 4.0.0.
4. Ejecuta:

```bash
sh scripts/verify-4.0.0.sh
```

## Variables nuevas

### Transcripción de voz

```env
STT_API_URL=
STT_API_KEY=
STT_MODEL=whisper-1
```

Son opcionales. Si quedan vacías, WAMERCIO funciona normalmente y el panel indica que el proveedor de transcripción no está conectado.

### Calls Premium

```env
CALLS_ADAPTER_URL=
CALLS_ADAPTER_SECRET=
```

`CALLS_ADAPTER_URL` debe apuntar al servicio que mantiene WACalls/WebRTC. Si `CALLS_ADAPTER_SECRET` queda vacío, el API usa `INTERNAL_WEBHOOK_SECRET` como fallback.

## Orden de despliegue

### 1. API

Debe arrancar primero porque aplica:

```text
000042_quotes_pro
000043_delivery_pro
000044_crm_operations
000045_flow_builder
000046_voice_transcription
000047_calls_premium
```

Comprueba `/health` antes de continuar.

### 2. WhatsApp Bridge

El bridge nuevo envía ubicaciones como payload estructurado y coordenadas explícitas. Debe conectarse al mismo API 4.0.0.

### 3. Web

Despliega el frontend después de API + Bridge saludables. El Service Worker usa cache `wamercio-store-v4.0.0-*`.

## Pruebas posteriores

### Cotización
1. Crea una cotización.
2. Descarga PDF.
3. Envía por WhatsApp.
4. Abre el enlace público.
5. Acepta/rechaza.
6. Revisa el movimiento en CRM.
7. Convierte una aprobada a pedido.

### Delivery
1. Recibe una ubicación WhatsApp.
2. Abre Registros de atención.
3. Pulsa **Asociar a dirección**.
4. Prepara una entrega.
5. Asigna repartidor.
6. Crea y optimiza ruta.
7. Abre `/courier` y prueba geolocalización/estados desde un móvil con HTTPS.

### Flow Builder
1. Crea un flujo `message_received` o `keyword`.
2. Añade condición y acción.
3. Actívalo.
4. Envía un mensaje de prueba.
5. Confirma el run y sus steps.

### Voz
1. Configura el endpoint STT.
2. Activa transcripción automática en la tienda.
3. Envía una nota de voz entrante.
4. Confirma transcripción en el chat y `/voice`.

### Calls
1. Despliega/conecta el adaptador WACalls/WebRTC.
2. Configura `CALLS_ADAPTER_URL` y secreto.
3. Activa Calls para la tienda.
4. Prueba saliente, entrante, hold/resume, transferencia y hangup.
5. Confirma callbacks en `/internal/calls/events`.

## Rollback

Las migraciones 42–47 tienen `down.sql`. Un rollback debe realizarse en orden inverso:

```text
47 → 46 → 45 → 44 → 43 → 42
```

No reviertas la base mientras Web/API 4.0.0 sigan atendiendo tráfico.
