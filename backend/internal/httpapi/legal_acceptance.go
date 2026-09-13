package httpapi

import (
	"context"
	"net/http"
	"strings"
)

const currentLegalDocumentVersion = "1.0-2026-07-16"

func (s *Server) recordCustomerLegalAcceptances(ctx context.Context, customer Customer, r *http.Request) error {
	ipAddress := requestIPAddress(r)
	userAgent := strings.TrimSpace(r.UserAgent())
	for _, documentType := range []string{"terms", "privacy", "data_processing"} {
		if _, err := s.db.Exec(ctx, `
			INSERT INTO legal_acceptances (
				subject_type,subject_id,document_type,document_version,ip_address,user_agent
			) VALUES ('customer',$1,$2,$3,NULLIF($4,'')::inet,$5)
			ON CONFLICT (subject_type,subject_id,document_type,document_version) DO NOTHING
		`, customer.ID, documentType, currentLegalDocumentVersion, ipAddress, userAgent); err != nil {
			return err
		}
	}

	if s.tenantManager == nil {
		return nil
	}
	phoneDigits := onlyDigits(customer.Whatsapp)
	nationalIDDigits := onlyDigits(customer.NationalID)
	var globalID string
	err := s.globalDB().QueryRow(ctx, `
		SELECT id::text FROM global_customers
		WHERE ($1 <> '' AND national_id_digits=$1)
		   OR ($2 <> '' AND (
			whatsapp_digits=$2 OR right(whatsapp_digits,10)=right($2,10)
		   ))
		ORDER BY updated_at DESC LIMIT 1
	`, nationalIDDigits, phoneDigits).Scan(&globalID)
	if err != nil || globalID == "" {
		return err
	}
	for _, documentType := range []string{"terms", "privacy", "data_processing"} {
		if _, err := s.globalDB().Exec(ctx, `
			INSERT INTO global_customer_legal_acceptances (
				customer_id,document_type,document_version,ip_address,user_agent
			) VALUES ($1::uuid,$2,$3,NULLIF($4,'')::inet,$5)
			ON CONFLICT (customer_id,document_type,document_version) DO NOTHING
		`, globalID, documentType, currentLegalDocumentVersion, ipAddress, userAgent); err != nil {
			return err
		}
	}
	return nil
}
