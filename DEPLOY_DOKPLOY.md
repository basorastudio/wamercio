# Despliegue WAMERCIO 1.6.0 en Dokploy

Esta versión amplía el servicio WhatsApp y el Centro de Conversaciones. No cambia el routing, los volúmenes ni las variables `.env` existentes.

## Actualizar

1. Sustituye el contenido del repositorio por WAMERCIO 1.6.0.
2. Commit y push:

```bash
git add .
git commit -m "feat: WAMERCIO 1.6 conversational center and device identity"
git push
```

3. En Dokploy pulsa **Rebuild**.
4. **No uses Fresh Volumes**.
5. No cambies el `.env`.

## Migración automática

El API aplicará:

```text
000008_conversation_center
```

Añade `customer_id` y `status` a conversaciones y crea `conversation_notes`. Los mensajes y clientes existentes se conservan.

## Dispositivo vinculado

Las nuevas sesiones se emparejan como **WAMERCIO**. Si una sesión fue creada antes de esta versión y WhatsApp todavía muestra un nombre anterior:

1. entra a **Ajustes → WhatsApp**;
2. pulsa **Desvincular**;
3. genera un nuevo QR;
4. vuelve a vincular desde **WhatsApp → Dispositivos vinculados**.

El nombre del dispositivo se asigna durante el emparejamiento, por lo que una sesión antigua no cambia de nombre retroactivamente.

## Routing

Se mantiene exactamente:

```text
Cloudflare → Traefik → wamercio-gateway:8080 → web:3000
```

## Pruebas recomendadas

- Confirmar que `/settings/whatsapp` muestra únicamente identidad WAMERCIO.
- Vincular una sesión nueva y confirmar que el teléfono muestra **WAMERCIO**.
- Enviar un mensaje desde otro número y confirmar que aparece en `/conversations`.
- Responder desde WAMERCIO y confirmar recepción en el teléfono.
- Enviar imagen/audio/documento y comprobar que aparece su tipo, no una etiqueta genérica.
- Pulsar nombre/avatar del contacto y comprobar que el panel derecho se abre sin overlay en escritorio.
- Editar el nombre del contacto y verificar que la cabecera/lista se actualicen inmediatamente.
- Abrir **Registros de atención**, cambiar estado y agregar una nota.
- Confirmar que el CRM de Clientes reutiliza el mismo número y muestra pedidos recientes.
