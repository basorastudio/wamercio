# Corrección R30

Fecha: 16 de julio de 2026

## Problema corregido

El frontend no superaba `npm run typecheck` porque `mode.key` se infería como `string`, mientras `cleanOrderAddress` acepta únicamente `delivery`, `pickup` o una cadena vacía.

Archivo afectado:

- `frontend/src/screens/MyOrders.tsx`

## Solución

Se añadió el contrato explícito:

- `OrderMode = 'delivery' | 'pickup'`
- `OrderModeMeta.key: OrderMode`
- `getOrderMode(...): OrderMode`
- `orderModeMeta(...): OrderModeMeta`

De esta forma, TypeScript puede comprobar que `mode.key` siempre contiene una modalidad válida antes de enviarla a `cleanOrderAddress`.

## Instalación segura

El preflight introducido en R29 permanece activo. El instalador compila backend y frontend antes de modificar `/opt/wamercio`; si cualquiera falla, la instalación existente se conserva intacta.
