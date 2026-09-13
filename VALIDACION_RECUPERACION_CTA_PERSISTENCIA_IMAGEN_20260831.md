# Validación — Recuperación CTA persistente + imagen desde PC

Fecha: 2026-08-31

## Correcciones aplicadas

1. **La recuperación ya no se pierde al refrescar el navegador**
   - Al verificar correctamente un enlace CTA o un código OTP, el frontend guarda únicamente la autorización temporal de restablecimiento en `sessionStorage`.
   - La autorización conserva: challenge, reset token, ámbito (tenant/central), destino y vencimiento.
   - Al recargar `/#/recover-account`, el formulario vuelve directamente a **Nuevo PIN** mientras la autorización siga vigente.
   - Al completar el cambio de PIN, volver al acceso, solicitar otra recuperación o vencer la autorización, el dato temporal se elimina.
   - No se utiliza `localStorage`, por lo que la autorización no queda persistida de forma permanente en el dispositivo.

2. **El enlace CTA puede revalidarse de forma segura antes de completar el cambio de PIN**
   - Si la página se refresca durante la validación inicial y el navegador vuelve a enviar el mismo enlace válido, el backend puede emitir nuevamente la autorización temporal mientras el challenge no haya vencido ni haya sido consumido.
   - Una vez actualizado el PIN (`used_at`), el enlace deja de ser válido.

3. **Imagen CTA desde archivo local**
   - Se eliminó de la interfaz el campo manual de URL.
   - El SuperAdmin puede seleccionar JPG, PNG o WEBP desde su PC.
   - Tamaño máximo: 8 MB.
   - Nuevo endpoint autenticado: `POST /platform/access-policy/cta-image`.
   - La imagen se publica en Cloudflare R2 usando una ruta estable: `platform/access/recovery-cta-image`.
   - El backend devuelve la URL pública configurada por `CLOUDFLARE_R2_PUBLIC_BASE_URL` y la interfaz la incorpora a `recovery_cta_image_url` al guardar la recuperación.
   - Se añadió vista previa, reemplazo y opción de quitar imagen.

## Seguridad

- El `reset_token` temporal conserva firma HMAC y vencimiento.
- El backend continúa comprobando que el challenge esté verificado, vigente y no consumido antes de cambiar el PIN.
- La persistencia de refresco usa `sessionStorage`, no almacenamiento permanente.
- El archivo CTA se valida por tamaño y MIME real antes de subirlo.
- Solo se aceptan `image/jpeg`, `image/png` e `image/webp`.
- La ruta de subida está dentro del grupo autenticado del SuperAdmin.

## Requisito de infraestructura para imagen CTA

Debe existir una URL pública para el bucket R2:

```env
CLOUDFLARE_R2_PUBLIC_BASE_URL=https://tu-dominio-publico-r2.example.com
```

Waxum necesita poder descargar la imagen mediante HTTPS. Si esta variable no está configurada, WAMERCIO devuelve un mensaje claro y no intenta guardar una URL privada de R2.

## Archivos principales modificados

- `frontend/src/screens/AccountRecovery.tsx`
- `frontend/src/lib/recoveryGrant.ts`
- `frontend/src/screens/SuperAdmin.tsx`
- `frontend/src/components/DynamicPWA.tsx`
- `backend/internal/httpapi/account_recovery.go`
- `backend/internal/httpapi/platform_account_recovery.go`
- `backend/internal/httpapi/access_policy_media.go`
- `backend/internal/httpapi/server.go`
