# Seguridad

- Nunca confirmes ni registres el `SUPERADMIN_TOKEN` en texto plano.
- Usa HTTPS cuando WAXUM esté expuesto fuera de una red privada.
- Verifica siempre `X-Webhook-Signature` en producción.
- Limita el tamaño de los cuerpos recibidos por webhook.
- No habilites reintentos de métodos no idempotentes sin una estrategia contra duplicados.
- Usa un `http.Client` con timeout y límites de conexión adecuados.
