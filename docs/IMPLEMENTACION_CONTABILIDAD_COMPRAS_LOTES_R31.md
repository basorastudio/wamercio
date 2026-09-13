# Implementación R31: contabilidad, compras y lotes

## Alcance

Esta versión restaura e implementa como módulos operativos completos las funciones de contabilidad, sugerencias de compras y control de lotes con vencimiento. No se añadieron pasarelas de pago. Todos los cobros y pagos siguen siendo manuales o fuera de línea.

## Contabilidad

- Plan de cuentas independiente por negocio.
- Cuentas del sistema sembradas automáticamente para caja, bancos, terminal externa, cuentas por cobrar, inventario, cuentas por pagar, patrimonio, ventas, devoluciones, costo de ventas, gastos y diferencias de caja.
- Saldo de apertura único y auditable.
- Libro diario con asientos en borrador, publicación y anulación mediante contrapartida.
- Libro mayor por cuenta y período.
- Balance de comprobación.
- Estado de resultados y situación financiera.
- Períodos contables sin superposición y con cierre protegido.
- Asientos automáticos para ventas, fiado, cobros, devoluciones, anulaciones, compras, pagos a proveedores, movimientos de caja, ajustes de inventario, vencimientos y retiros de lotes.

## Compras y reposición

- Proveedores con datos fiscales, contacto, WhatsApp, correo, dirección, notas y estado.
- Política de reposición por producto: punto de pedido, existencia objetivo, seguridad, tiempo de entrega, proveedor preferido y control por lotes.
- Sugerencias calculadas con ventas de 30 días, existencia vendible, mercancía pendiente, seguridad y plazo de reposición.
- Conversión de sugerencias en órdenes de compra.
- Órdenes en borrador, enviadas, parcialmente recibidas, recibidas o canceladas.
- Recepciones parciales y múltiples.
- Actualización transaccional de inventario, costo promedio, kardex, lotes, cuentas por pagar y contabilidad.
- Saldos por proveedor y pagos manuales auditados en efectivo, transferencia o terminal externa.

## Lotes y vencimientos

- Registro manual o desde recepción de compra.
- Número de lote, costo, cantidad inicial, cantidad disponible, fecha de recepción, vencimiento, estado y notas.
- Estados activo, cuarentena, agotado, vencido y retirado.
- Consumo FEFO para productos con control por lotes.
- Restauración proporcional del lote en anulaciones y devoluciones.
- Vencimiento automático mediante workers y validación al consultar.
- Resumen de lotes vencidos, próximos a vencer y valor en riesgo.
- Historial completo de movimientos por lote con referencia, responsable, motivo y fecha.
- Baja contable automática de mercancía vencida o retirada y reversión al reactivar un lote válido.

## Pagos admitidos

- Efectivo.
- Transferencia manual verificada fuera de WAMERCIO.
- Tarjeta cobrada en terminal física externa.
- Crédito del cliente o cuenta por pagar al proveedor.

WAMERCIO registra estas operaciones, pero no autoriza tarjetas ni confirma depósitos automáticamente.

## Migración

La migración tenant `000029_accounting_procurement_batches` crea las tablas, índices, restricciones, cuentas predeterminadas y campos de configuración necesarios. Incluye archivo `up` y `down`.

## Despliegue seguro

El instalador conserva el preflight incorporado en R29/R30: compila backend y frontend antes de respaldar o copiar la nueva versión. Si cualquiera falla, `/opt/colmapro` permanece sin modificaciones.
