# WAMERCIO 1.9.0

WAMERCIO es una plataforma SaaS de **comercio conversacional por WhatsApp** construida con Next.js, Go, PostgreSQL, Redis y un bridge multisesión propio.

## Flujo principal

```text
Crear comercio → Cargar catálogo → Conectar WhatsApp
       ↓
Conversar con el cliente → Crear pedido desde el chat
       ↓
Cobrar / preparar / entregar → conservar historial del cliente
```

La versión 1.9 prioriza cerrar este ciclo antes de añadir módulos secundarios.

### Novedades principales

- pedido directamente desde una conversación de WhatsApp;
- selector de productos, variantes y extras dentro del chat;
- respuesta automática con resumen y enlace de seguimiento;
- tracking público sin cuenta;
- comprobante de transferencia;
- horarios y pausa de pedidos aplicados al checkout;
- estados operativos de preparación/entrega;
- respuestas rápidas;
- eventos de WhatsApp en tiempo real mediante Redis/SSE;
- outbox con reintentos para mensajes automáticos;
- rate limiting de acceso;
- CORS restringido por configuración;
- tienda archivada en lugar de borrado destructivo;
- navegación comercial simplificada.

## Accesos

```text
Comerciante: WhatsApp + PIN de 4 dígitos
SuperAdmin: /admin/login → correo + contraseña
```

## Infraestructura

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000 → Go API
                                           ↘ WhatsApp bridge
                         PostgreSQL + Redis
```

## Actualización desde 1.8.x

1. Sube el contenido de esta versión al mismo repositorio.
2. Conserva el `.env` actual; asegúrate de mantener `CORS_ALLOWED_ORIGINS=https://wamercio.com,https://www.wamercio.com`.
3. En Dokploy usa **Rebuild**.
4. **No uses Fresh Volumes.**
5. Al arrancar el API se aplicará automáticamente `000010_commerce_flow`.

No se eliminan pedidos, clientes, productos ni conversaciones existentes.
