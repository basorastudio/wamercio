package httpapi

import (
	"context"

	"github.com/jackc/pgx/v5"
)

func orderStatusNotificationCopy(status string) (string, string) {
	switch normalizeOrderStatus(status) {
	case "preparing":
		return "Tu pedido está en preparación", "El negocio comenzó a preparar tu pedido."
	case "ready_for_delivery":
		return "Tu pedido está listo", "Tu pedido está listo para entrega o recogida, según la modalidad seleccionada."
	case "on_the_way":
		return "Tu pedido está en camino", "El repartidor inició la ruta hacia tu dirección."
	case "delivered":
		return "Pedido entregado", "Tu pedido fue marcado como entregado."
	case "issue":
		return "Tu pedido requiere atención", "Se reportó una incidencia y el negocio está revisando tu pedido."
	case "cancelled":
		return "Pedido cancelado", "El pedido fue cancelado. Puedes revisar el motivo y repetirlo cuando lo necesites."
	case "pending":
		return "Pedido pendiente", "Tu pedido se encuentra pendiente de confirmación."
	default:
		return "Estado de pedido actualizado", "El estado de tu pedido fue actualizado."
	}
}

func recordOrderStatusTx(
	ctx context.Context,
	tx pgx.Tx,
	storeID string,
	customerID string,
	orderID string,
	status string,
	actor businessActor,
	details map[string]any,
) error {
	if details == nil {
		details = map[string]any{}
	}
	details["orderId"] = orderID
	details["storeId"] = storeID
	details["status"] = normalizeOrderStatus(status)
	if err := insertAuditTx(ctx, tx, storeID, actor, "order.status.changed", "sale", orderID, details); err != nil {
		return err
	}
	if err := insertOutboxTx(ctx, tx, storeID, "sale", orderID, "order.status.changed", details, ""); err != nil {
		return err
	}
	title, message := orderStatusNotificationCopy(status)
	if resolution, _ := details["resolution"].(string); resolution == "partial_delivery" {
		title = "Entrega parcial completada"
		message = "El pedido fue completado con una entrega parcial. Revisa los productos no entregados y el ajuste registrado."
	}
	if err := insertNotificationTx(ctx, tx, storeID, "customer", customerID, "order.status.changed", title, message, details); err != nil {
		return err
	}
	if customerID != "" {
		if err := insertNotificationChannelTx(ctx, tx, storeID, "customer", customerID, "whatsapp", "order.status.changed", title, message, details); err != nil {
			return err
		}
	}
	if normalizeOrderStatus(status) == "issue" {
		return insertNotificationTx(ctx, tx, storeID, "administrator", "", "order.status.changed", "Incidencia de entrega", message, details)
	}
	return nil
}
