package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

func (s *Server) customerChequeAuthorized(ctx context.Context, storeID, globalCustomerID, phone, customerID string) bool {
	storeID = strings.TrimSpace(storeID)
	globalCustomerID = strings.TrimSpace(globalCustomerID)
	phone = normalizePhone(phone)
	customerID = strings.TrimSpace(customerID)
	if storeID == "" {
		return false
	}
	var authorized bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM customers c
			WHERE c.store_id=$1
			  AND c.status='active'
			  AND c.cheque_enabled=true
			  AND ($2='' OR c.id::text=$2)
			  AND ($3='' OR c.global_customer_id::text=$3)
			  AND ($4='' OR regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=$4)
			  AND EXISTS (
				SELECT 1 FROM orders o
				WHERE o.customer_id=c.id AND o.status<>'canceled' AND o.flow_type<>'quote'
			  )
		)
	`, storeID, customerID, globalCustomerID, phone).Scan(&authorized)
	return err == nil && authorized
}

func (s *Server) updateCustomerChequeAuthorization(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	customerID := strings.TrimSpace(chi.URLParam(r, "id"))
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if customerID == "" || decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	var isCustomer bool
	_ = s.db.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM customers c
			WHERE c.id=$1 AND c.store_id=$2
			  AND EXISTS (
				SELECT 1 FROM orders o
				WHERE o.customer_id=c.id AND o.status<>'canceled' AND o.flow_type<>'quote'
			  )
		)
	`, customerID, storeID).Scan(&isCustomer)
	if !isCustomer {
		jsonErr(w, http.StatusNotFound, "Cliente no encontrado")
		return
	}
	res, err := s.db.Exec(r.Context(), `UPDATE customers SET cheque_enabled=$1,updated_at=now() WHERE id=$2 AND store_id=$3`, in.Enabled, customerID, storeID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar la autorización de cheque")
		return
	}
	if res.RowsAffected() == 0 {
		jsonErr(w, http.StatusNotFound, "Cliente no encontrado")
		return
	}
	jsonOut(w, http.StatusOK, map[string]any{"ok": true, "cheque_enabled": in.Enabled})
}
