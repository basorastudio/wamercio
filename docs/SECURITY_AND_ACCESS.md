# Business access security

## Credentials

New PINs and passwords are stored with bcrypt. Legacy SHA-256 hashes are accepted only for a successful migration login and are then replaced automatically.

## Sessions

Sessions use `HttpOnly` cookies, `Secure` in production, and `SameSite=Lax`. The browser does not store the reusable token in `localStorage`; compatibility markers contain no credential.

## Login protection

- Per-IP and per-authentication-route throttling.
- Per-account failure counters.
- Temporary lockout after the configured threshold.
- A local lockout fallback when Redis is unavailable.
- Responses that avoid unnecessary account enumeration.
- Administrative and operational audit records.

## Business permissions

Administrators receive every permission. Cashiers and drivers receive explicit permissions, and the backend verifies them even when a menu item is hidden. Unknown permissions are discarded and explicit denials are preserved.

## Recovery

OTP codes are generated cryptographically, expire, limit attempts, and grant reset authorization only after verification. A successful reset clears lockouts and updates the global identity when applicable.

## Periodic review

- Disable accounts for former workers.
- Review audit records weekly.
- Rotate secrets after any suspected incident.
- Never share employee PINs.
- Keep HTTPS and browser security headers enabled on API and frontend responses.
