# WAXUM integration

WAMERCIO uses the bundled `github.com/basoradev/waxum-go` module as its only WhatsApp API client. The SDK is stored in `backend/third_party/waxum-go` and linked through the backend `go.mod` replacement directive so clean builds do not depend on a separate SDK repository.

## Platform settings

The central SaaS database stores the provider configuration under `platform_settings.waxum`:

```json
{
  "enabled": true,
  "public_url": "https://waxum.ltd.do",
  "dashboard_url": "https://waxum.ltd.do",
  "docs_url": "https://waxum.ltd.do/swagger-ui/",
  "admin_token": ""
}
```

The WAXUM configuration endpoint validates the token against the sessions API but does not create a WhatsApp session. A global session is created only after an operator explicitly starts QR or phone-number pairing. This avoids leaving an offline session merely because the settings page was opened or saved. The global WhatsApp account is stored separately under `platform_settings.whatsapp_platform` and uses WAXUM session terminology:

```json
{
  "enabled": true,
  "session_id": "",
  "session_name": "WAMERCIO",
  "status": "pending",
  "connected": false,
  "logged_in": false
}
```

The token remains server-side. Tenant stores and customer clients never receive it.

## Backend routes

The existing platform workflow is preserved with session-based internals:

- `GET /api/platform/whatsapp`
- `POST /api/platform/whatsapp/session`
- `POST /api/platform/whatsapp/connect`
- `GET /api/platform/whatsapp/qr`
- `POST /api/platform/whatsapp/pairing-code`
- `GET /api/platform/whatsapp/status`
- `POST /api/platform/whatsapp/disconnect`
- `POST /api/platform/whatsapp/validate-number`

These handlers use the typed SDK services for session creation, connection, QR and pair-code retrieval, status checks, contact validation, profile pictures and text messages.

## Runtime configuration

`WAXUM_HTTP_TIMEOUT` controls the shared WAXUM HTTP client timeout. The client reuses connections, caps response bodies at 8 MiB and only enables bounded SDK retries for operations the SDK considers safe.

## Notifications and recovery

Business notifications and account recovery messages use the same central WAXUM session through `Messages.SendText`. Number validation uses `Contacts.CheckOnWhatsApp`, while profile enrichment uses the contacts and profile-picture services.

## Docker build

The backend Dockerfile copies the local SDK module descriptor before `go mod download`, then copies the full source tree for compilation. This preserves Docker layer caching while allowing the local `replace` directive to resolve during a clean build.

## Console access

The WAXUM operations console is served at the public root URL (`/`), not at `/dashboard`. The console performs its own sign-in flow with `SUPERADMIN_TOKEN`; a normal browser navigation cannot attach an `Authorization` header. WAMERCIO therefore opens the root console and never places the token in a query string or URL.

## Remote session reconciliation

The remote WAXUM session registry is authoritative, but ordinary state reads never create sessions. Before generating a QR or pairing code, WAMERCIO lists the real WAXUM sessions and creates the canonical `WAMERCIO` session only when the operator has explicitly started a linking flow. The legacy `wamercio-saas-superadmin` identifier is kept only during the one-time transition and is removed after the canonical session is linked. A locally stored `session_id` therefore cannot prevent recovery after the session is deleted from the WAXUM console.

The QR workflow is:

```text
Código QR
→ POST /api/platform/whatsapp/session
→ WAXUM Sessions.List
→ WAXUM Sessions.Create when missing
→ WAXUM Sessions.Connect
→ WAXUM Sessions.GetQRCode
→ render QR in WAMERCIO
```

The SaaS superadministration route does not use the tenant PWA cache. On the first load after this correction, WAMERCIO removes any obsolete service worker and cache entries and may reload the page once.

## Orphan-session prevention

WAMERCIO stores a time-bounded linking marker for QR and phone-number pairing. A remote session is retained only while that marker is active or while WAXUM reports `logged_in`. Expired, disconnected, externally unlinked, or abandoned sessions are removed with `DELETE /api/v1/sessions/{session_id}`.

The deletion helper first attempts the compatibility disconnect endpoint, then calls DELETE and retries the DELETE once for older WAXUM runtimes that briefly retain a client after disconnect. HTTP 404 is treated as a completed cleanup. Local metadata is reset only after the remote deletion succeeds.

Reconciliation occurs in four places:

- platform and business status endpoints;
- the periodic backend cleanup worker;
- business notification session selection;
- closing an unfinished business linking modal.

A previously authenticated session in the transient `connecting` state receives a short reconnect grace period. Any other unauthenticated state after the linking window is purged, including a device-side unlink. This keeps the WAXUM console free of abandoned sessions without destroying a legitimate reconnect in progress.
