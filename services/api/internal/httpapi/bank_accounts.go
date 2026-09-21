package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

type storeBankAccount struct {
	ID            string `json:"id"`
	BankID        string `json:"bank_id"`
	BankName      string `json:"bank_name"`
	BankShortName string `json:"bank_short_name"`
	BankLogoURL   string `json:"bank_logo_url"`
	AccountType   string `json:"account_type"`
	AccountNumber string `json:"account_number"`
	AccountHolder string `json:"account_holder"`
	IsActive      bool   `json:"is_active"`
}

func (s *Server) listStoreBankAccounts(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT a.id::text,coalesce(a.bank_id::text,''),coalesce(nullif(a.bank_name,''),b.name,''),coalesce(b.short_name,''),coalesce(b.logo_url,''),a.account_type,a.account_number,a.account_holder,a.is_active FROM store_bank_accounts a LEFT JOIN platform_banks b ON b.id=a.bank_id WHERE a.store_id=$1 ORDER BY a.is_active DESC,a.created_at`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las cuentas bancarias")
		return
	}
	defer rows.Close()
	out := []storeBankAccount{}
	for rows.Next() {
		var a storeBankAccount
		if rows.Scan(&a.ID, &a.BankID, &a.BankName, &a.BankShortName, &a.BankLogoURL, &a.AccountType, &a.AccountNumber, &a.AccountHolder, &a.IsActive) == nil {
			out = append(out, a)
		}
	}
	jsonOut(w, 200, out)
}

func normalizeBankAccountType(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return "Corriente"
	}
	switch strings.ToLower(v) {
	case "corriente", "ahorros", "ahorro", "nómina", "nomina":
		return strings.Title(strings.ToLower(v))
	default:
		return v
	}
}

func (s *Server) saveStoreBankAccount(w http.ResponseWriter, r *http.Request, updating bool) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	var in struct {
		BankID        string `json:"bank_id"`
		BankName      string `json:"bank_name"`
		AccountType   string `json:"account_type"`
		AccountNumber string `json:"account_number"`
		AccountHolder string `json:"account_holder"`
		IsActive      bool   `json:"is_active"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	in.AccountNumber = strings.TrimSpace(in.AccountNumber)
	in.AccountHolder = strings.TrimSpace(in.AccountHolder)
	in.BankName = strings.TrimSpace(in.BankName)
	in.AccountType = normalizeBankAccountType(in.AccountType)
	if in.AccountNumber == "" || in.AccountHolder == "" {
		jsonErr(w, 400, "Número y titular de la cuenta son obligatorios")
		return
	}
	if in.BankID != "" {
		var name string
		if s.db.QueryRow(r.Context(), `SELECT name FROM platform_banks WHERE id=$1 AND is_active=true`, in.BankID).Scan(&name) != nil {
			jsonErr(w, 400, "Banco no válido")
			return
		}
		in.BankName = name
	}
	var id string
	var err error
	if updating {
		id = chi.URLParam(r, "id")
		res, e := s.db.Exec(r.Context(), `UPDATE store_bank_accounts SET bank_id=NULLIF($1,'')::uuid,bank_name=$2,account_type=$3,account_number=$4,account_holder=$5,is_active=$6,updated_at=now() WHERE id=$7 AND store_id=$8`, in.BankID, in.BankName, in.AccountType, in.AccountNumber, in.AccountHolder, in.IsActive, id, storeID)
		err = e
		if err == nil && res.RowsAffected() == 0 {
			jsonErr(w, 404, "Cuenta no encontrada")
			return
		}
	} else {
		err = s.db.QueryRow(r.Context(), `INSERT INTO store_bank_accounts(store_id,bank_id,bank_name,account_type,account_number,account_holder,is_active) VALUES($1,NULLIF($2,'')::uuid,$3,$4,$5,$6,$7) RETURNING id::text`, storeID, in.BankID, in.BankName, in.AccountType, in.AccountNumber, in.AccountHolder, in.IsActive).Scan(&id)
	}
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			jsonErr(w, 409, "Ya existe una cuenta con ese número")
		} else {
			jsonErr(w, 500, "No se pudo guardar la cuenta")
		}
		return
	}
	jsonOut(w, map[bool]int{true: 200, false: 201}[updating], map[string]any{"ok": true, "id": id})
}
func (s *Server) createStoreBankAccount(w http.ResponseWriter, r *http.Request) {
	s.saveStoreBankAccount(w, r, false)
}
func (s *Server) updateStoreBankAccount(w http.ResponseWriter, r *http.Request) {
	s.saveStoreBankAccount(w, r, true)
}
func (s *Server) deleteStoreBankAccount(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var used bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM stores WHERE id=$1 AND (transfer_account_id=$2 OR terminal_account_id=$2))`, storeID, id).Scan(&used)
	if used {
		jsonErr(w, 409, "Desvincula esta cuenta de los métodos de pago antes de eliminarla")
		return
	}
	res, err := s.db.Exec(r.Context(), `DELETE FROM store_bank_accounts WHERE id=$1 AND store_id=$2`, id, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudo eliminar la cuenta")
		return
	}
	if res.RowsAffected() == 0 {
		jsonErr(w, 404, "Cuenta no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) publicStoreBankAccounts(ctx context.Context, storeID string) []map[string]any {
	rows, err := s.db.Query(ctx, `SELECT a.id::text,coalesce(nullif(a.bank_name,''),b.name,''),coalesce(b.short_name,''),coalesce(b.logo_url,''),a.account_type,a.account_number,a.account_holder FROM store_bank_accounts a LEFT JOIN platform_banks b ON b.id=a.bank_id WHERE a.store_id=$1 AND a.is_active=true ORDER BY a.created_at`, storeID)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, shortName, logo, typ, number, holder string
		if rows.Scan(&id, &name, &shortName, &logo, &typ, &number, &holder) == nil {
			out = append(out, map[string]any{"id": id, "bank_name": name, "bank_short_name": shortName, "bank_logo_url": logo, "account_type": typ, "account_number": number, "account_holder": holder})
		}
	}
	return out
}

func (s *Server) resolvePaymentAccount(ctx context.Context, storeID, requestedID, method string) (string, error) {
	requestedID = strings.TrimSpace(requestedID)
	if method != "bank_transfer" && method != "cash_on_delivery" {
		return "", nil
	}
	if requestedID == "" {
		column := "transfer_account_id"
		if method == "cash_on_delivery" {
			column = "terminal_account_id"
		}
		_ = s.db.QueryRow(ctx, `SELECT coalesce(`+column+`::text,'') FROM stores WHERE id=$1`, storeID).Scan(&requestedID)
	}
	if requestedID == "" {
		if method == "bank_transfer" {
			return "", fmt.Errorf("configura o selecciona una cuenta bancaria para la transferencia")
		}
		return "", nil
	}
	var exists bool
	_ = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM store_bank_accounts WHERE id=$1 AND store_id=$2 AND is_active=true)`, requestedID, storeID).Scan(&exists)
	if !exists {
		return "", fmt.Errorf("la cuenta bancaria seleccionada no está disponible")
	}
	return requestedID, nil
}
