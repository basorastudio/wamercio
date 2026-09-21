# WAMERCIO 4.1.3 — Hotfix definitivo de compilación Calls/Clientes

## Error observado en Dokploy

El build 4.1.2 superó la corrección TypeScript anterior, pero el compilador Go detuvo el API con:

```text
internal/httpapi/server.go:2624:96: undefined: conversationID
```

## Causa raíz

Al añadir `conversation_id` al endpoint `listCustomers`, un reemplazo de texto demasiado amplio insertó también:

```go
"conversation_id": conversationID
```

en el resultado de `listConversations`. Esa función no declara `conversationID`, por lo que el API no podía compilar.

## Corrección 4.1.3

- Se elimina la referencia espuria a `conversationID` de `listConversations`.
- Se conserva `conversation_id` únicamente donde está correctamente definido en `listCustomers`.
- `Customer` continúa exponiendo `conversation_id?: string`.
- El botón de llamada de Clientes usa `kind: 'customer'`.
- El botón de llamada de Contactos usa `kind: 'contact'`.
- La ficha de detalle del cliente conserva también `detail.conversation_id` al abrir el softphone.
- Se incrementa la versión web/PWA a 4.1.3.
- No se agregan migraciones.

## Nueva regresión

`scripts/test_4_1_3_build_scope.py` analiza por separado los bloques `listConversations` y `listCustomers`:

- falla si `conversationID` aparece en `listConversations`;
- exige que `listCustomers` declare `conversationID`;
- exige que el `Scan` incluya `&conversationID`;
- exige que el JSON de clientes incluya `conversation_id`;
- valida la clasificación correcta Cliente/Contacto en el softphone.

## Validación

```text
PASS: WAMERCIO 4.1.3 Go scope and customer-call regression
PASS: WAMERCIO 4.1.3 integrated calls contract
PASS: WAMERCIO 4.1.3 softphone UX contract
PASS: WAMERCIO 3.0.0 Centro Conversacional PRO contract
Migration pairs: 47/47
HTTP handlers: 341 registered, 0 missing
JSON: OK
TypeScript syntax: 109 files, 0 errors
Docker Compose YAML: OK
gofmt: OK
Shell syntax: OK
PASS: WAMERCIO 4.1.3 release verification
```

Además se ejecutó un chequeo semántico dirigido del frontend modificado con TypeScript, sin errores.

## Despliegue

No hay cambios de base de datos. Sustituye 4.1.2 por 4.1.3 en el repositorio y ejecuta Redeploy en Dokploy.
