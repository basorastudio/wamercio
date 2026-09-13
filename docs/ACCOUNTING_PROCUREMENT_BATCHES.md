# Contabilidad, compras y lotes

## Contabilidad

WAMERCIO incorpora contabilidad de partida doble por negocio con plan de cuentas, libro diario, libro mayor, balance de comprobación, estado de resultados, situación financiera y períodos contables cerrables.

Las operaciones que generan asientos automáticamente incluyen:

- Ventas en efectivo, transferencia manual, terminal externa y fiado.
- Costo de mercancía vendida.
- Anulaciones y devoluciones.
- Cobros de fiado.
- Recepciones de órdenes de compra.
- Compras a crédito y pagos manuales a proveedores.
- Gastos, depósitos y retiros de caja.
- Ajustes de inventario.
- Vencimiento y retiro de lotes.
- Diferencias detectadas durante el cierre de caja.

Los asientos manuales deben estar cuadrados antes de publicarse. Un período cerrado impide publicar nuevos asientos dentro de sus fechas.

Al activar el módulo por primera vez, el negocio puede registrar un único saldo de apertura con efectivo, bancos, inventario, cuentas por cobrar y cuentas por pagar. WAMERCIO propone el valor operativo del inventario y del fiado existente, calcula el patrimonio inicial y genera un asiento balanceado y auditable.

## Compras y reposición

Las sugerencias de compra consideran:

- Existencia vendible actual.
- Venta promedio diaria de los últimos 30 días.
- Punto de reposición configurado.
- Existencia de seguridad.
- Tiempo estimado de reposición.
- Cantidad incluida en órdenes abiertas.
- Existencia objetivo.

Las sugerencias se recalculan al abrir el módulo y también pueden recalcularse manualmente. Pueden pausarse temporalmente o convertirse en órdenes de compra. Cada recepción actualiza la cantidad recibida, el costo promedio, el kardex, los lotes y la contabilidad dentro de una misma transacción.

## Lotes y vencimientos

Los productos configurados para control por lote utilizan FEFO: primero vence, primero sale. Cada venta consume cantidades de los lotes vigentes en orden de vencimiento.

El sistema permite:

- Registrar lote, costo, cantidad y vencimiento.
- Crear lotes desde recepciones de compra.
- Consultar lotes vencidos o próximos a vencer.
- Poner lotes en cuarentena.
- Retirar lotes del mercado.
- Reactivar lotes válidos.
- Restaurar cantidades cuando una venta se anula o devuelve.
- Dar de baja automáticamente los lotes vencidos.
- Mantener historial de movimientos por lote.
- Editar el número, vencimiento, estado y observaciones con auditoría.

El proceso automático de vencimiento se ejecuta al iniciar los trabajadores, cada quince minutos y al consultar los paneles de lotes.
