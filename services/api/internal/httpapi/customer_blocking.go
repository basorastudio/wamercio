package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// customerBlockedInStore resolves a store-specific commercial block without
// changing the customer's global WAMERCIO identity. A customer may therefore
// remain active globally while being blocked in one specific business.
func (s *Server) customerBlockedInStore(ctx context.Context, storeID, globalCustomerID, phone string) (bool, string) {
	storeID = strings.TrimSpace(storeID)
	globalCustomerID = strings.TrimSpace(globalCustomerID)
	phone = normalizePhone(phone)
	if storeID == "" || (globalCustomerID == "" && phone == "") {
		return false, ""
	}
	var blocked bool
	var reason string
	err := s.db.QueryRow(ctx, `
		SELECT coalesce(c.status,'active')='blocked',coalesce(c.blocked_reason,'')
		FROM customers c
		WHERE c.store_id=$1
		  AND (
		    ($2<>'' AND c.global_customer_id::text=$2)
		    OR ($3<>'' AND regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=$3)
		  )
		ORDER BY (c.global_customer_id::text=$2) DESC,c.updated_at DESC
		LIMIT 1`, storeID, globalCustomerID, phone).Scan(&blocked, &reason)
	if err != nil {
		return false, ""
	}
	return blocked, strings.TrimSpace(reason)
}

func blockedCustomerMessage(reason string) string {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return "Este cliente está bloqueado en este negocio"
	}
	return "Este cliente está bloqueado en este negocio. Motivo: " + reason
}

func (s *Server) blockCustomer(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var in struct {
		Reason string `json:"reason"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" {
		jsonErr(w, http.StatusBadRequest, "Debes indicar el motivo del bloqueo")
		return
	}
	if len([]rune(reason)) > 500 {
		jsonErr(w, http.StatusBadRequest, "El motivo del bloqueo no puede superar 500 caracteres")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo iniciar el bloqueo")
		return
	}
	defer tx.Rollback(r.Context())

	var storeID, globalCustomerID, status string
	q := `SELECT cu.store_id::text,coalesce(cu.global_customer_id::text,''),coalesce(cu.status,'active') FROM customers cu JOIN stores st ON st.id=cu.store_id WHERE cu.id=$1`
	args := []any{id}
	if c.Role != "superadmin" {
		q += ` AND st.user_id=$2`
		args = append(args, c.UserID)
	}
	if tx.QueryRow(r.Context(), q, args...).Scan(&storeID, &globalCustomerID, &status) != nil {
		jsonErr(w, http.StatusNotFound, "Cliente no encontrado")
		return
	}
	if status == "blocked" {
		// Updating the reason is intentional: the latest justified block is the
		// current reason shown to the business and SuperAdmin.
		if _, err = tx.Exec(r.Context(), `UPDATE customers SET blocked_reason=$1,blocked_at=coalesce(blocked_at,now()),blocked_by_user_id=$2,updated_at=now() WHERE id=$3`, reason, c.UserID, id); err != nil {
			jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar el bloqueo")
			return
		}
	} else {
		if _, err = tx.Exec(r.Context(), `UPDATE customers SET status='blocked',blocked_reason=$1,blocked_at=now(),blocked_by_user_id=$2,updated_at=now() WHERE id=$3`, reason, c.UserID, id); err != nil {
			jsonErr(w, http.StatusInternalServerError, "No se pudo bloquear el cliente")
			return
		}
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO customer_block_events(customer_id,store_id,global_customer_id,action,reason,actor_user_id) VALUES($1,$2,nullif($3,'')::uuid,'blocked',$4,$5)`, id, storeID, globalCustomerID, reason, c.UserID); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo registrar el bloqueo")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo confirmar el bloqueo")
		return
	}
	jsonOut(w, http.StatusOK, map[string]any{"ok": true, "status": "blocked", "blocked_reason": reason, "blocked_at": time.Now()})
}

func (s *Server) unblockCustomer(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo iniciar el desbloqueo")
		return
	}
	defer tx.Rollback(r.Context())

	var storeID, globalCustomerID string
	q := `SELECT cu.store_id::text,coalesce(cu.global_customer_id::text,'') FROM customers cu JOIN stores st ON st.id=cu.store_id WHERE cu.id=$1`
	args := []any{id}
	if c.Role != "superadmin" {
		q += ` AND st.user_id=$2`
		args = append(args, c.UserID)
	}
	if tx.QueryRow(r.Context(), q, args...).Scan(&storeID, &globalCustomerID) != nil {
		jsonErr(w, http.StatusNotFound, "Cliente no encontrado")
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE customers SET status='active',blocked_reason=NULL,blocked_at=NULL,blocked_by_user_id=NULL,updated_at=now() WHERE id=$1`, id); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo desbloquear el cliente")
		return
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO customer_block_events(customer_id,store_id,global_customer_id,action,actor_user_id) VALUES($1,$2,nullif($3,'')::uuid,'unblocked',$4)`, id, storeID, globalCustomerID, c.UserID); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo registrar el desbloqueo")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo confirmar el desbloqueo")
		return
	}
	jsonOut(w, http.StatusOK, map[string]any{"ok": true, "status": "active"})
}
