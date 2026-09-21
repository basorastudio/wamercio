package httpapi

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type loyaltyProgramInput struct {
	StoreID           string  `json:"store_id"`
	IsActive          *bool   `json:"is_active"`
	PointsPerCurrency float64 `json:"points_per_currency"`
	RedemptionValue   float64 `json:"redemption_value"`
	MinRedeem         int     `json:"min_redeem"`
}

type loyaltyRedemptionPrepared struct {
	AccountID string
	Points    int
	Discount  float64
}

func (s *Server) publicLoyaltyProgram(ctx context.Context, storeID string) map[string]any {
	out := map[string]any{"is_active": false, "points_per_currency": 0.0, "redemption_value": 0.0, "min_redeem": 0}
	var active bool
	var perCurrency, value float64
	var minRedeem int
	if s.db.QueryRow(ctx, `SELECT is_active,points_per_currency,redemption_value,min_redeem FROM loyalty_programs WHERE store_id=$1`, storeID).Scan(&active, &perCurrency, &value, &minRedeem) == nil {
		out = map[string]any{"is_active": active, "points_per_currency": perCurrency, "redemption_value": value, "min_redeem": minRedeem}
	}
	return out
}

func (s *Server) getLoyaltyProgram(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	program := s.publicLoyaltyProgram(r.Context(), storeID)
	var accounts, issued, redeemed int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*)::int,coalesce(sum(total_earned),0)::int,coalesce(sum(total_redeemed),0)::int FROM loyalty_accounts WHERE store_id=$1`, storeID).Scan(&accounts, &issued, &redeemed)
	program["accounts"] = accounts
	program["points_issued"] = issued
	program["points_redeemed"] = redeemed
	jsonOut(w, 200, program)
}

func (s *Server) updateLoyaltyProgram(w http.ResponseWriter, r *http.Request) {
	var in loyaltyProgramInput
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	active := false
	if in.IsActive != nil {
		active = *in.IsActive
	}
	if in.PointsPerCurrency < 0 || in.PointsPerCurrency > 10 || in.RedemptionValue < 0 || in.RedemptionValue > 1000 || in.MinRedeem < 0 {
		jsonErr(w, 400, "Configuración de puntos inválida")
		return
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO loyalty_programs(store_id,is_active,points_per_currency,redemption_value,min_redeem,updated_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(store_id) DO UPDATE SET is_active=excluded.is_active,points_per_currency=excluded.points_per_currency,redemption_value=excluded.redemption_value,min_redeem=excluded.min_redeem,updated_at=now()`, in.StoreID, active, in.PointsPerCurrency, in.RedemptionValue, in.MinRedeem)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar el programa de fidelización")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listLoyaltyAccounts(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT la.id::text,la.global_customer_id::text,coalesce(gc.name,'')||CASE WHEN coalesce(gc.last_name,'')<>'' THEN ' '||gc.last_name ELSE '' END,coalesce(gc.phone,''),la.points_balance,la.total_earned,la.total_redeemed,la.updated_at FROM loyalty_accounts la JOIN global_customers gc ON gc.id=la.global_customer_id WHERE la.store_id=$1 ORDER BY la.points_balance DESC,la.updated_at DESC LIMIT 1000`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los saldos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, cid, name, phone string
		var balance, earned, redeemed int
		var updated time.Time
		if rows.Scan(&id, &cid, &name, &phone, &balance, &earned, &redeemed, &updated) == nil {
			out = append(out, map[string]any{"id": id, "global_customer_id": cid, "customer_name": strings.TrimSpace(name), "phone": phone, "points_balance": balance, "total_earned": earned, "total_redeemed": redeemed, "updated_at": updated})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) customerLoyalty(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		jsonErr(w, 400, "store_id es obligatorio")
		return
	}
	program := s.publicLoyaltyProgram(r.Context(), storeID)
	var balance, earned, redeemed int
	_ = s.db.QueryRow(r.Context(), `SELECT points_balance,total_earned,total_redeemed FROM loyalty_accounts WHERE store_id=$1 AND global_customer_id=$2`, storeID, c.UserID).Scan(&balance, &earned, &redeemed)
	program["points_balance"] = balance
	program["total_earned"] = earned
	program["total_redeemed"] = redeemed
	jsonOut(w, 200, program)
}

func (s *Server) prepareLoyaltyRedemption(ctx context.Context, tx pgx.Tx, storeID, customerID string, requested int, maxDiscount float64) (loyaltyRedemptionPrepared, error) {
	if requested <= 0 {
		return loyaltyRedemptionPrepared{}, nil
	}
	var active bool
	var value float64
	var minRedeem int
	if err := tx.QueryRow(ctx, `SELECT is_active,redemption_value,min_redeem FROM loyalty_programs WHERE store_id=$1`, storeID).Scan(&active, &value, &minRedeem); err != nil || !active || value <= 0 {
		return loyaltyRedemptionPrepared{}, fmt.Errorf("El programa de fidelización no está disponible")
	}
	if requested < minRedeem {
		return loyaltyRedemptionPrepared{}, fmt.Errorf("Debes canjear al menos %d puntos", minRedeem)
	}
	var accountID string
	var balance int
	if err := tx.QueryRow(ctx, `INSERT INTO loyalty_accounts(store_id,global_customer_id) VALUES($1,$2) ON CONFLICT(store_id,global_customer_id) DO UPDATE SET updated_at=loyalty_accounts.updated_at RETURNING id::text,points_balance`, storeID, customerID).Scan(&accountID, &balance); err != nil {
		return loyaltyRedemptionPrepared{}, err
	}
	if requested > balance {
		return loyaltyRedemptionPrepared{}, fmt.Errorf("No tienes suficientes puntos")
	}
	discount := float64(requested) * value
	if discount > maxDiscount+0.0001 {
		return loyaltyRedemptionPrepared{}, fmt.Errorf("El canje supera el total disponible del pedido")
	}
	return loyaltyRedemptionPrepared{AccountID: accountID, Points: requested, Discount: discount}, nil
}

func applyLoyaltyRedemption(ctx context.Context, tx pgx.Tx, prepared loyaltyRedemptionPrepared, orderID string) error {
	if prepared.Points <= 0 {
		return nil
	}
	res, err := tx.Exec(ctx, `UPDATE loyalty_accounts SET points_balance=points_balance-$1,total_redeemed=total_redeemed+$1,updated_at=now() WHERE id=$2 AND points_balance>=$1`, prepared.Points, prepared.AccountID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("El saldo de puntos cambió; inténtalo nuevamente")
	}
	_, err = tx.Exec(ctx, `INSERT INTO loyalty_ledger(account_id,order_id,entry_type,points,description) VALUES($1,$2,'redeem',$3,$4)`, prepared.AccountID, orderID, -prepared.Points, fmt.Sprintf("Canje en pedido: %d puntos", prepared.Points))
	return err
}

func (s *Server) awardOrderLoyalty(ctx context.Context, orderID string) {
	var storeID, customerID, status, flowType string
	var total float64
	if s.db.QueryRow(ctx, `SELECT store_id::text,coalesce(global_customer_id::text,''),status,flow_type,total FROM orders WHERE id=$1`, orderID).Scan(&storeID, &customerID, &status, &flowType, &total) != nil || customerID == "" || flowType == "quote" || (status != "delivered" && status != "picked_up" && status != "completed") {
		return
	}
	var active bool
	var ratio float64
	if s.db.QueryRow(ctx, `SELECT is_active,points_per_currency FROM loyalty_programs WHERE store_id=$1`, storeID).Scan(&active, &ratio) != nil || !active || ratio <= 0 {
		return
	}
	points := int(math.Floor(total * ratio))
	if points <= 0 {
		return
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)
	var accountID string
	if tx.QueryRow(ctx, `INSERT INTO loyalty_accounts(store_id,global_customer_id) VALUES($1,$2) ON CONFLICT(store_id,global_customer_id) DO UPDATE SET updated_at=loyalty_accounts.updated_at RETURNING id::text`, storeID, customerID).Scan(&accountID) != nil {
		return
	}
	var ledgerID string
	if tx.QueryRow(ctx, `INSERT INTO loyalty_ledger(account_id,order_id,entry_type,points,description) VALUES($1,$2,'earn',$3,$4) ON CONFLICT(order_id,entry_type) WHERE order_id IS NOT NULL AND entry_type='earn' DO NOTHING RETURNING id::text`, accountID, orderID, points, fmt.Sprintf("Puntos por pedido completado: %d", points)).Scan(&ledgerID) != nil {
		return
	}
	if _, err = tx.Exec(ctx, `UPDATE loyalty_accounts SET points_balance=points_balance+$1,total_earned=total_earned+$1,updated_at=now() WHERE id=$2`, points, accountID); err != nil {
		return
	}
	_ = tx.Commit(ctx)
}
