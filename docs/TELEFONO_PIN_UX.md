# Teléfono internacional y PIN progresivo

## Teléfono

WAMERCIO utiliza el wrapper React oficial de `intl-tel-input`.

Comportamiento:

- bandera visible;
- código de marcación separado;
- búsqueda de países;
- nombres y textos del selector en español;
- país inicial obtenido desde Cloudflare (`CF-IPCountry`);
- fallback a locale del navegador y `DO`;
- formato internacional mientras se escribe;
- validación del número;
- selector adaptativo para móvil/escritorio.

Los flujos comerciales utilizan WhatsApp como identificador primario.

## PIN

Los PIN comerciales son siempre de cuatro dígitos. La interfaz usa cuatro inputs de un carácter y permite:

- avance automático;
- Backspace al campo anterior;
- flechas izquierda/derecha;
- pegar cuatro dígitos;
- envío automático al completar el cuarto dígito cuando se usa para login.

No se solicita repetir el PIN durante el registro.
