package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type quoteItemInput struct {
	ID          string  `json:"id"`
	ProductID   string  `json:"product_id"`
	ProductName string  `json:"product_name"`
	VariantName string  `json:"variant_name"`
	Description string  `json:"description"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	Discount    float64 `json:"discount"`
	SortOrder   int     `json:"sort_order"`
}

type quoteInput struct {
	StoreID         string           `json:"store_id"`
	CustomerID      string           `json:"customer_id"`
	ConversationID  string           `json:"conversation_id"`
	AssignedStaffID string           `json:"assigned_staff_id"`
	CustomerName    string           `json:"customer_name"`
	CustomerPhone   string           `json:"customer_phone"`
	CustomerAddress string           `json:"customer_address"`
	Title           string           `json:"title"`
	Notes           string           `json:"notes"`
	Terms           string           `json:"terms"`
	Discount        float64          `json:"discount"`
	Tax             float64          `json:"tax"`
	Shipping        float64          `json:"shipping"`
	ValidUntil      *time.Time       `json:"valid_until"`
	Items           []quoteItemInput `json:"items"`
}

func (s *Server) quoteOwned(ctx context.Context, c any, quoteID string) (string, bool) {
	claims, _ := c.(*struct{})
	_ = claims
	var storeID string
	if s.db.QueryRow(ctx, `SELECT store_id::text FROM quotes WHERE id=$1`, quoteID).Scan(&storeID) != nil {
		return "", false
	}
	return storeID, true
}

func newQuoteToken() (string, string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	token := hex.EncodeToString(buf)
	sum := sha256.Sum256([]byte(token))
	return token, hex.EncodeToString(sum[:]), nil
}

func quoteTokenHash(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(sum[:])
}

func normalizeQuoteItems(items []quoteItemInput) ([]quoteItemInput, float64, error) {
	out := make([]quoteItemInput, 0, len(items))
	subtotal := 0.0
	for i, item := range items {
		item.ProductName = strings.TrimSpace(item.ProductName)
		item.VariantName = strings.TrimSpace(item.VariantName)
		item.Description = strings.TrimSpace(item.Description)
		if item.ProductName == "" {
			return nil, 0, fmt.Errorf("cada artículo necesita un nombre")
		}
		if item.Quantity <= 0 {
			item.Quantity = 1
		}
		if item.UnitPrice < 0 || item.Discount < 0 {
			return nil, 0, fmt.Errorf("precios y descuentos no pueden ser negativos")
		}
		line := item.Quantity*item.UnitPrice - item.Discount
		if line < 0 {
			line = 0
		}
		item.SortOrder = i * 10
		subtotal += line
		out = append(out, item)
	}
	return out, subtotal, nil
}

func (s *Server) resolveQuoteCustomer(ctx context.Context, in *quoteInput) (globalCustomerID string) {
	if strings.TrimSpace(in.CustomerID) != "" {
		_ = s.db.QueryRow(ctx, `SELECT coalesce(global_customer_id::text,''),name,phone,coalesce(address,'') FROM customers WHERE id=$1 AND store_id=$2`, in.CustomerID, in.StoreID).Scan(&globalCustomerID, &in.CustomerName, &in.CustomerPhone, &in.CustomerAddress)
	}
	if strings.TrimSpace(in.ConversationID) != "" {
		var customerID, name, phone string
		_ = s.db.QueryRow(ctx, `SELECT coalesce(customer_id::text,''),coalesce(nullif(contact_name,''),nullif(display_name,''),'Cliente'),coalesce(whatsapp_phone,'') FROM conversations WHERE id=$1 AND store_id=$2`, in.ConversationID, in.StoreID).Scan(&customerID, &name, &phone)
		if in.CustomerID == "" && customerID != "" {
			in.CustomerID = customerID
			_ = s.db.QueryRow(ctx, `SELECT coalesce(global_customer_id::text,'') FROM customers WHERE id=$1`, customerID).Scan(&globalCustomerID)
		}
		if strings.TrimSpace(in.CustomerName) == "" {
			in.CustomerName = name
		}
		if normalizePhone(in.CustomerPhone) == "" {
			in.CustomerPhone = phone
		}
	}
	in.CustomerPhone = normalizePhone(in.CustomerPhone)
	in.CustomerName = strings.TrimSpace(in.CustomerName)
	if in.CustomerName == "" {
		in.CustomerName = "Cliente"
	}
	return globalCustomerID
}

func (s *Server) listQuotes(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT q.id::text,q.quote_number,q.customer_name,q.customer_phone,q.title,q.status,q.revision,q.subtotal,q.discount,q.tax,q.shipping,q.total,q.valid_until,q.sent_at,q.viewed_at,q.approved_at,q.rejected_at,q.converted_at,coalesce(q.converted_order_id::text,''),q.created_at,q.updated_at,coalesce(ss.prefix,'COT'),coalesce(c.id::text,''),coalesce(cv.id::text,''),coalesce(st.name,'') FROM quotes q LEFT JOIN store_quote_settings ss ON ss.store_id=q.store_id LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN conversations cv ON cv.id=q.conversation_id LEFT JOIN store_staff st ON st.id=q.assigned_staff_id WHERE q.store_id=$1 ORDER BY q.updated_at DESC LIMIT 500`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las cotizaciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, customerName, phone, title, status, orderID, prefix, customerID, conversationID, staffName string
		var number int64
		var revision int
		var subtotal, discount, tax, shipping, total float64
		var validUntil, sentAt, viewedAt, approvedAt, rejectedAt, convertedAt *time.Time
		var createdAt, updatedAt time.Time
		if rows.Scan(&id, &number, &customerName, &phone, &title, &status, &revision, &subtotal, &discount, &tax, &shipping, &total, &validUntil, &sentAt, &viewedAt, &approvedAt, &rejectedAt, &convertedAt, &orderID, &createdAt, &updatedAt, &prefix, &customerID, &conversationID, &staffName) == nil {
			out = append(out, map[string]any{"id": id, "number": fmt.Sprintf("%s-%06d", prefix, number), "quote_number": number, "customer_name": customerName, "customer_phone": phone, "customer_id": customerID, "conversation_id": conversationID, "assigned_staff_name": staffName, "title": title, "status": status, "revision": revision, "subtotal": subtotal, "discount": discount, "tax": tax, "shipping": shipping, "total": total, "valid_until": validUntil, "sent_at": sentAt, "viewed_at": viewedAt, "approved_at": approvedAt, "rejected_at": rejectedAt, "converted_at": convertedAt, "converted_order_id": orderID, "created_at": createdAt, "updated_at": updatedAt})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) quoteDetail(ctx context.Context, quoteID string) (map[string]any, error) {
	var id, storeID, customerID, globalID, conversationID, staffID, status, customerName, phone, address, title, notes, terms, currency, orderID, prefix string
	var number int64
	var revision int
	var subtotal, discount, tax, shipping, total float64
	var validUntil, sentAt, viewedAt, approvedAt, rejectedAt, convertedAt *time.Time
	var createdAt, updatedAt time.Time
	err := s.db.QueryRow(ctx, `SELECT q.id::text,q.store_id::text,coalesce(q.customer_id::text,''),coalesce(q.global_customer_id::text,''),coalesce(q.conversation_id::text,''),coalesce(q.assigned_staff_id::text,''),q.quote_number,q.status,q.revision,q.customer_name,q.customer_phone,q.customer_address,q.title,q.notes,q.terms,q.currency,q.subtotal,q.discount,q.tax,q.shipping,q.total,q.valid_until,q.sent_at,q.viewed_at,q.approved_at,q.rejected_at,q.converted_at,coalesce(q.converted_order_id::text,''),q.created_at,q.updated_at,coalesce(s.prefix,'COT') FROM quotes q LEFT JOIN store_quote_settings s ON s.store_id=q.store_id WHERE q.id=$1`, quoteID).Scan(&id, &storeID, &customerID, &globalID, &conversationID, &staffID, &number, &status, &revision, &customerName, &phone, &address, &title, &notes, &terms, &currency, &subtotal, &discount, &tax, &shipping, &total, &validUntil, &sentAt, &viewedAt, &approvedAt, &rejectedAt, &convertedAt, &orderID, &createdAt, &updatedAt, &prefix)
	if err != nil {
		return nil, err
	}
	itemsRows, err := s.db.Query(ctx, `SELECT id::text,coalesce(product_id::text,''),product_name,variant_name,description,quantity,unit_price,discount,line_total,sort_order FROM quote_items WHERE quote_id=$1 ORDER BY sort_order,id`, quoteID)
	if err != nil {
		return nil, err
	}
	items := []map[string]any{}
	for itemsRows.Next() {
		var iid, productID, productName, variant, desc string
		var quantity, unitPrice, itemDiscount, lineTotal float64
		var sortOrder int
		if itemsRows.Scan(&iid, &productID, &productName, &variant, &desc, &quantity, &unitPrice, &itemDiscount, &lineTotal, &sortOrder) == nil {
			items = append(items, map[string]any{"id": iid, "product_id": productID, "product_name": productName, "variant_name": variant, "description": desc, "quantity": quantity, "unit_price": unitPrice, "discount": itemDiscount, "line_total": lineTotal, "sort_order": sortOrder})
		}
	}
	itemsRows.Close()
	events := []map[string]any{}
	if rows, e := s.db.Query(ctx, `SELECT event_type,actor_type,actor_id,metadata,created_at FROM quote_events WHERE quote_id=$1 ORDER BY created_at DESC LIMIT 100`, quoteID); e == nil {
		for rows.Next() {
			var eventType, actorType, actorID string
			var metadata []byte
			var at time.Time
			if rows.Scan(&eventType, &actorType, &actorID, &metadata, &at) == nil {
				var m any = map[string]any{}
				_ = json.Unmarshal(metadata, &m)
				events = append(events, map[string]any{"event_type": eventType, "actor_type": actorType, "actor_id": actorID, "metadata": m, "created_at": at})
			}
		}
		rows.Close()
	}
	return map[string]any{"id": id, "store_id": storeID, "customer_id": customerID, "global_customer_id": globalID, "conversation_id": conversationID, "assigned_staff_id": staffID, "number": fmt.Sprintf("%s-%06d", prefix, number), "quote_number": number, "status": status, "revision": revision, "customer_name": customerName, "customer_phone": phone, "customer_address": address, "title": title, "notes": notes, "terms": terms, "currency": currency, "subtotal": subtotal, "discount": discount, "tax": tax, "shipping": shipping, "total": total, "valid_until": validUntil, "sent_at": sentAt, "viewed_at": viewedAt, "approved_at": approvedAt, "rejected_at": rejectedAt, "converted_at": convertedAt, "converted_order_id": orderID, "created_at": createdAt, "updated_at": updatedAt, "items": items, "events": events}, nil
}

func (s *Server) getQuote(w http.ResponseWriter, r *http.Request) {
	quoteID := chi.URLParam(r, "id")
	q, err := s.quoteDetail(r.Context(), quoteID)
	if err != nil {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, str(q["store_id"])) {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	jsonOut(w, 200, q)
}

func (s *Server) quoteSnapshot(ctx context.Context, tx pgx.Tx, quoteID string, revision int, userID string) {
	q, _ := s.quoteDetail(ctx, quoteID)
	if q == nil {
		return
	}
	raw, _ := json.Marshal(q)
	_, _ = tx.Exec(ctx, `INSERT INTO quote_revisions(quote_id,revision,snapshot,created_by_user_id) VALUES($1,$2,$3,NULLIF($4,'')::uuid) ON CONFLICT(quote_id,revision) DO NOTHING`, quoteID, revision, raw, userID)
}

func (s *Server) createQuote(w http.ResponseWriter, r *http.Request) {
	var in quoteInput
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	items, subtotal, err := normalizeQuoteItems(in.Items)
	if err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	globalID := s.resolveQuoteCustomer(r.Context(), &in)
	if in.Title == "" {
		in.Title = "Cotización"
	}
	if in.Discount < 0 || in.Tax < 0 || in.Shipping < 0 {
		jsonErr(w, 400, "Los totales no pueden ser negativos")
		return
	}
	total := subtotal - in.Discount + in.Tax + in.Shipping
	if total < 0 {
		total = 0
	}
	if in.ValidUntil == nil {
		var days int
		if s.db.QueryRow(r.Context(), `SELECT validity_days FROM store_quote_settings WHERE store_id=$1`, in.StoreID).Scan(&days) != nil || days <= 0 {
			days = 15
		}
		v := time.Now().Add(time.Duration(days) * 24 * time.Hour)
		in.ValidUntil = &v
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la cotización")
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	err = tx.QueryRow(r.Context(), `INSERT INTO quotes(store_id,customer_id,global_customer_id,conversation_id,created_by_user_id,assigned_staff_id,customer_name,customer_phone,customer_address,title,notes,terms,subtotal,discount,tax,shipping,total,valid_until) VALUES($1,NULLIF($2,'')::uuid,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,NULLIF($5,'')::uuid,NULLIF($6,'')::uuid,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id::text`, in.StoreID, in.CustomerID, globalID, in.ConversationID, c.UserID, in.AssignedStaffID, in.CustomerName, in.CustomerPhone, in.CustomerAddress, strings.TrimSpace(in.Title), strings.TrimSpace(in.Notes), strings.TrimSpace(in.Terms), subtotal, in.Discount, in.Tax, in.Shipping, total, in.ValidUntil).Scan(&id)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la cotización")
		return
	}
	for _, item := range items {
		line := item.Quantity*item.UnitPrice - item.Discount
		if line < 0 {
			line = 0
		}
		_, err = tx.Exec(r.Context(), `INSERT INTO quote_items(quote_id,product_id,product_name,variant_name,description,quantity,unit_price,discount,line_total,sort_order) VALUES($1,NULLIF($2,'')::uuid,$3,$4,$5,$6,$7,$8,$9,$10)`, id, item.ProductID, item.ProductName, item.VariantName, item.Description, item.Quantity, item.UnitPrice, item.Discount, line, item.SortOrder)
		if err != nil {
			jsonErr(w, 500, "No se pudieron guardar los artículos")
			return
		}
	}
	_, _ = tx.Exec(r.Context(), `INSERT INTO quote_events(quote_id,store_id,event_type,actor_type,actor_id) VALUES($1,$2,'created','user',$3)`, id, in.StoreID, c.UserID)
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la cotización")
		return
	}
	q, _ := s.quoteDetail(r.Context(), id)
	jsonOut(w, 201, q)
}

func (s *Server) updateQuote(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var storeID, status string
	var revision int
	if s.db.QueryRow(r.Context(), `SELECT store_id::text,status,revision FROM quotes WHERE id=$1`, id).Scan(&storeID, &status, &revision) != nil {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	if status == "approved" || status == "converted" || status == "cancelled" {
		jsonErr(w, 409, "Esta cotización ya no se puede editar")
		return
	}
	var in quoteInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	in.StoreID = storeID
	items, subtotal, err := normalizeQuoteItems(in.Items)
	if err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	globalID := s.resolveQuoteCustomer(r.Context(), &in)
	total := subtotal - in.Discount + in.Tax + in.Shipping
	if total < 0 {
		total = 0
	}
	if strings.TrimSpace(in.Title) == "" {
		in.Title = "Cotización"
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar")
		return
	}
	defer tx.Rollback(r.Context())
	// Preserve the previous version before incrementing revision.
	if old, e := s.quoteDetail(r.Context(), id); e == nil {
		raw, _ := json.Marshal(old)
		_, _ = tx.Exec(r.Context(), `INSERT INTO quote_revisions(quote_id,revision,snapshot,created_by_user_id) VALUES($1,$2,$3,NULLIF($4,'')::uuid) ON CONFLICT(quote_id,revision) DO NOTHING`, id, revision, raw, c.UserID)
	}
	_, err = tx.Exec(r.Context(), `UPDATE quotes SET customer_id=NULLIF($1,'')::uuid,global_customer_id=NULLIF($2,'')::uuid,conversation_id=NULLIF($3,'')::uuid,assigned_staff_id=NULLIF($4,'')::uuid,customer_name=$5,customer_phone=$6,customer_address=$7,title=$8,notes=$9,terms=$10,subtotal=$11,discount=$12,tax=$13,shipping=$14,total=$15,valid_until=$16,revision=revision+1,status=CASE WHEN status='requested' THEN 'draft' ELSE status END,updated_at=now() WHERE id=$17`, in.CustomerID, globalID, in.ConversationID, in.AssignedStaffID, in.CustomerName, in.CustomerPhone, in.CustomerAddress, in.Title, in.Notes, in.Terms, subtotal, in.Discount, in.Tax, in.Shipping, total, in.ValidUntil, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar la cotización")
		return
	}
	_, _ = tx.Exec(r.Context(), `DELETE FROM quote_items WHERE quote_id=$1`, id)
	for _, item := range items {
		line := item.Quantity*item.UnitPrice - item.Discount
		if line < 0 {
			line = 0
		}
		if _, err = tx.Exec(r.Context(), `INSERT INTO quote_items(quote_id,product_id,product_name,variant_name,description,quantity,unit_price,discount,line_total,sort_order) VALUES($1,NULLIF($2,'')::uuid,$3,$4,$5,$6,$7,$8,$9,$10)`, id, item.ProductID, item.ProductName, item.VariantName, item.Description, item.Quantity, item.UnitPrice, item.Discount, line, item.SortOrder); err != nil {
			jsonErr(w, 500, "No se pudieron actualizar los artículos")
			return
		}
	}
	_, _ = tx.Exec(r.Context(), `INSERT INTO quote_events(quote_id,store_id,event_type,actor_type,actor_id,metadata) VALUES($1,$2,'revised','user',$3,jsonb_build_object('from_revision',$4,'to_revision',$4+1))`, id, storeID, c.UserID, revision)
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la actualización")
		return
	}
	q, _ := s.quoteDetail(r.Context(), id)
	jsonOut(w, 200, q)
}

func (s *Server) quoteSettings(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	if r.Method == http.MethodPut {
		var in struct {
			Prefix              string `json:"prefix"`
			ValidityDays        int    `json:"validity_days"`
			AutoFollowupHours   int    `json:"auto_followup_hours"`
			SecondFollowupHours int    `json:"second_followup_hours"`
			AllowPublicAccept   *bool  `json:"allow_public_accept"`
			AllowPublicReject   *bool  `json:"allow_public_reject"`
			FooterText          string `json:"footer_text"`
		}
		if decode(r, &in) != nil {
			jsonErr(w, 400, "Datos inválidos")
			return
		}
		if strings.TrimSpace(in.Prefix) == "" {
			in.Prefix = "COT"
		}
		if in.ValidityDays <= 0 {
			in.ValidityDays = 15
		}
		if in.AutoFollowupHours < 0 {
			in.AutoFollowupHours = 0
		}
		if in.SecondFollowupHours < 0 {
			in.SecondFollowupHours = 0
		}
		accept, reject := true, true
		if in.AllowPublicAccept != nil {
			accept = *in.AllowPublicAccept
		}
		if in.AllowPublicReject != nil {
			reject = *in.AllowPublicReject
		}
		_, _ = s.db.Exec(r.Context(), `INSERT INTO store_quote_settings(store_id,prefix,validity_days,auto_followup_hours,second_followup_hours,allow_public_accept,allow_public_reject,footer_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(store_id) DO UPDATE SET prefix=excluded.prefix,validity_days=excluded.validity_days,auto_followup_hours=excluded.auto_followup_hours,second_followup_hours=excluded.second_followup_hours,allow_public_accept=excluded.allow_public_accept,allow_public_reject=excluded.allow_public_reject,footer_text=excluded.footer_text,updated_at=now()`, storeID, strings.ToUpper(strings.TrimSpace(in.Prefix)), in.ValidityDays, in.AutoFollowupHours, in.SecondFollowupHours, accept, reject, strings.TrimSpace(in.FooterText))
	}
	var prefix, footer string
	var validity, first, second int
	var accept, reject bool
	if s.db.QueryRow(r.Context(), `SELECT prefix,validity_days,auto_followup_hours,second_followup_hours,allow_public_accept,allow_public_reject,footer_text FROM store_quote_settings WHERE store_id=$1`, storeID).Scan(&prefix, &validity, &first, &second, &accept, &reject, &footer) != nil {
		jsonOut(w, 200, map[string]any{"prefix": "COT", "validity_days": 15, "auto_followup_hours": 24, "second_followup_hours": 48, "allow_public_accept": true, "allow_public_reject": true, "footer_text": ""})
		return
	}
	jsonOut(w, 200, map[string]any{"prefix": prefix, "validity_days": validity, "auto_followup_hours": first, "second_followup_hours": second, "allow_public_accept": accept, "allow_public_reject": reject, "footer_text": footer})
}

func (s *Server) shareQuote(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var storeID, conversationID, phone, customerName, prefix string
	var number int64
	var total float64
	var validUntil *time.Time
	if s.db.QueryRow(r.Context(), `SELECT q.store_id::text,coalesce(q.conversation_id::text,''),q.customer_phone,q.customer_name,q.quote_number,q.total,q.valid_until,coalesce(ss.prefix,'COT') FROM quotes q LEFT JOIN store_quote_settings ss ON ss.store_id=q.store_id WHERE q.id=$1`, id).Scan(&storeID, &conversationID, &phone, &customerName, &number, &total, &validUntil, &prefix) != nil {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	token, hash, err := newQuoteToken()
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el enlace")
		return
	}
	expires := time.Now().Add(30 * 24 * time.Hour)
	if validUntil != nil && validUntil.After(time.Now()) {
		expires = validUntil.Add(24 * time.Hour)
	}
	_, err = s.db.Exec(r.Context(), `INSERT INTO quote_share_links(quote_id,token_hash,expires_at) VALUES($1,$2,$3)`, id, hash, expires)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el enlace")
		return
	}
	portalURL := strings.TrimRight(s.cfg.AppURL, "/") + "/quote/" + token
	message := fmt.Sprintf("Hola %s 👋\n\nTe enviamos la cotización *%s-%06d* por un total de *RD$ %.2f*.\n\nPuedes revisarla, aceptarla o rechazarla aquí:\n%s", customerName, prefix, number, total, portalURL)
	if phone = normalizePhone(phone); phone != "" {
		_ = s.queueWhatsApp(r.Context(), storeID, conversationID, phone, message, "quote")
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE quotes SET status='sent',sent_at=coalesce(sent_at,now()),updated_at=now() WHERE id=$1 AND status NOT IN ('approved','converted','cancelled')`, id)
	s.syncQuoteCRM(r.Context(), id, "cotizado")
	_, _ = s.db.Exec(r.Context(), `INSERT INTO quote_events(quote_id,store_id,event_type,actor_type,actor_id,metadata) VALUES($1,$2,'sent','user',$3,jsonb_build_object('url',$4))`, id, storeID, c.UserID, portalURL)
	var first, second int
	_ = s.db.QueryRow(r.Context(), `SELECT auto_followup_hours,second_followup_hours FROM store_quote_settings WHERE store_id=$1`, storeID).Scan(&first, &second)
	if first > 0 && conversationID != "" {
		body := fmt.Sprintf("Hola %s 👋 Solo queríamos saber si pudiste revisar la cotización %s-%06d. Si necesitas algún ajuste, escríbenos por aquí.", customerName, prefix, number)
		_, _ = s.db.Exec(r.Context(), `INSERT INTO quote_followups(quote_id,store_id,conversation_id,stage,body,scheduled_for) VALUES($1,$2,$3,1,$4,now()+($5*interval '1 hour')) ON CONFLICT(quote_id,stage) DO UPDATE SET body=excluded.body,scheduled_for=excluded.scheduled_for,status='pending',error=NULL,cancelled_at=NULL`, id, storeID, conversationID, body, first)
	}
	if second > 0 && conversationID != "" {
		body := fmt.Sprintf("Seguimos disponibles para ayudarte con la cotización %s-%06d. Podemos ajustar cantidades, productos o condiciones si lo necesitas.", prefix, number)
		_, _ = s.db.Exec(r.Context(), `INSERT INTO quote_followups(quote_id,store_id,conversation_id,stage,body,scheduled_for) VALUES($1,$2,$3,2,$4,now()+($5*interval '1 hour')) ON CONFLICT(quote_id,stage) DO UPDATE SET body=excluded.body,scheduled_for=excluded.scheduled_for,status='pending',error=NULL,cancelled_at=NULL`, id, storeID, conversationID, body, second)
	}
	go s.triggerVisualFlows(context.Background(), storeID, "quote_sent", id, conversationID, map[string]string{"quote_id": id, "telefono": phone, "cliente": customerName, "url": portalURL})
	jsonOut(w, 200, map[string]any{"ok": true, "url": portalURL, "expires_at": expires})
}

func (s *Server) publicQuoteByToken(ctx context.Context, token string) (map[string]any, string, error) {
	hash := quoteTokenHash(token)
	var quoteID string
	err := s.db.QueryRow(ctx, `SELECT quote_id::text FROM quote_share_links WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`, hash).Scan(&quoteID)
	if err != nil {
		return nil, "", err
	}
	q, err := s.quoteDetail(ctx, quoteID)
	if err != nil {
		return nil, "", err
	}
	_, _ = s.db.Exec(ctx, `UPDATE quote_share_links SET last_viewed_at=now(),view_count=view_count+1 WHERE token_hash=$1`, hash)
	_, _ = s.db.Exec(ctx, `UPDATE quotes SET status=CASE WHEN status='sent' THEN 'viewed' ELSE status END,viewed_at=coalesce(viewed_at,now()),updated_at=now() WHERE id=$1`, quoteID)
	_, _ = s.db.Exec(ctx, `INSERT INTO quote_events(quote_id,store_id,event_type,actor_type) VALUES($1,$2,'viewed','customer')`, quoteID, q["store_id"])
	var storeName, logo, whatsapp string
	_ = s.db.QueryRow(ctx, `SELECT name,coalesce(logo_url,''),coalesce(whatsapp,'') FROM stores WHERE id=$1`, q["store_id"]).Scan(&storeName, &logo, &whatsapp)
	q["store"] = map[string]any{"name": storeName, "logo_url": logo, "whatsapp": whatsapp}
	var accept, reject bool
	var footer string
	_ = s.db.QueryRow(ctx, `SELECT allow_public_accept,allow_public_reject,footer_text FROM store_quote_settings WHERE store_id=$1`, q["store_id"]).Scan(&accept, &reject, &footer)
	q["portal"] = map[string]any{"allow_accept": accept, "allow_reject": reject, "footer_text": footer}
	return q, quoteID, nil
}

func (s *Server) publicQuote(w http.ResponseWriter, r *http.Request) {
	q, _, err := s.publicQuoteByToken(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		jsonErr(w, 404, "El enlace de la cotización no es válido o venció")
		return
	}
	jsonOut(w, 200, q)
}

func (s *Server) publicQuoteDecision(w http.ResponseWriter, r *http.Request) {
	q, quoteID, err := s.publicQuoteByToken(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		jsonErr(w, 404, "El enlace de la cotización no es válido o venció")
		return
	}
	var in struct {
		Decision string `json:"decision"`
		Comment  string `json:"comment"`
	}
	if decode(r, &in) != nil || (in.Decision != "approved" && in.Decision != "rejected") {
		jsonErr(w, 400, "Decisión inválida")
		return
	}
	portal, _ := q["portal"].(map[string]any)
	if in.Decision == "approved" && portal != nil && portal["allow_accept"] == false {
		jsonErr(w, 403, "La aceptación desde el portal está deshabilitada")
		return
	}
	if in.Decision == "rejected" && portal != nil && portal["allow_reject"] == false {
		jsonErr(w, 403, "El rechazo desde el portal está deshabilitado")
		return
	}
	column := "approved_at"
	if in.Decision == "rejected" {
		column = "rejected_at"
	}
	_, err = s.db.Exec(r.Context(), fmt.Sprintf(`UPDATE quotes SET status=$1,%s=now(),updated_at=now() WHERE id=$2 AND status NOT IN ('converted','cancelled')`, column), in.Decision, quoteID)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la decisión")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE quote_followups SET status='cancelled',cancelled_at=now() WHERE quote_id=$1 AND status='pending'`, quoteID)
	meta, _ := json.Marshal(map[string]any{"comment": strings.TrimSpace(in.Comment)})
	_, _ = s.db.Exec(r.Context(), `INSERT INTO quote_events(quote_id,store_id,event_type,actor_type,metadata) VALUES($1,$2,$3,'customer',$4)`, quoteID, q["store_id"], in.Decision, meta)
	if in.Decision == "rejected" {
		s.syncQuoteCRM(r.Context(), quoteID, "perdido")
	}
	if in.Decision == "approved" {
		s.syncQuoteCRM(r.Context(), quoteID, "negociacion")
		go s.triggerVisualFlows(context.Background(), str(q["store_id"]), "quote_approved", quoteID, str(q["conversation_id"]), map[string]string{"quote_id": quoteID, "telefono": str(q["customer_phone"]), "cliente": str(q["customer_name"])})
	}
	jsonOut(w, 200, map[string]any{"ok": true, "status": in.Decision})
}

func (s *Server) convertQuoteToOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	q, err := s.quoteDetail(r.Context(), id)
	if err != nil {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	c := claims(r)
	storeID := str(q["store_id"])
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	status := str(q["status"])
	if status != "approved" && status != "sent" && status != "viewed" {
		jsonErr(w, 409, "La cotización debe estar aprobada o enviada antes de convertirla")
		return
	}
	if str(q["converted_order_id"]) != "" {
		jsonOut(w, 200, map[string]any{"ok": true, "order_id": q["converted_order_id"], "already_converted": true})
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo convertir la cotización")
		return
	}
	defer tx.Rollback(r.Context())
	var orderID, token string
	var orderNumber int64
	err = tx.QueryRow(r.Context(), `INSERT INTO orders(store_id,customer_id,global_customer_id,conversation_id,customer_name,customer_phone,delivery_address,delivery_type,subtotal,discount,shipping,total,payment_method,payment_status,status,notes,flow_type,source) VALUES($1,NULLIF($2,'')::uuid,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,$5,$6,$7,'delivery',$8,$9,$10,$11,'cash','pending','pending',$12,'order','quote') RETURNING id::text,order_number,public_token::text`, storeID, q["customer_id"], q["global_customer_id"], q["conversation_id"], q["customer_name"], q["customer_phone"], q["customer_address"], q["subtotal"], q["discount"], q["shipping"], q["total"], q["notes"]).Scan(&orderID, &orderNumber, &token)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el pedido")
		return
	}
	items, _ := q["items"].([]map[string]any)
	for _, item := range items {
		_, err = tx.Exec(r.Context(), `INSERT INTO order_items(order_id,product_id,product_name,variant_name,unit_price,quantity,line_total) VALUES($1,NULLIF($2,'')::uuid,$3,NULLIF($4,''),$5,$6,$7)`, orderID, item["product_id"], item["product_name"], item["variant_name"], item["unit_price"], item["quantity"], item["line_total"])
		if err != nil {
			jsonErr(w, 500, "No se pudieron copiar los artículos")
			return
		}
	}
	_, _ = tx.Exec(r.Context(), `UPDATE quotes SET status='converted',converted_at=now(),converted_order_id=$1,updated_at=now() WHERE id=$2`, orderID, id)
	_, _ = tx.Exec(r.Context(), `UPDATE quote_followups SET status='cancelled',cancelled_at=now() WHERE quote_id=$1 AND status='pending'`, id)
	_, _ = tx.Exec(r.Context(), `INSERT INTO quote_events(quote_id,store_id,event_type,actor_type,actor_id,metadata) VALUES($1,$2,'converted','user',$3,jsonb_build_object('order_id',$4,'order_number',$5))`, id, storeID, c.UserID, orderID, orderNumber)
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el pedido")
		return
	}
	if customerID := str(q["customer_id"]); customerID != "" {
		s.refreshCustomerStats(r.Context(), customerID)
	}
	s.syncQuoteCRM(r.Context(), id, "ganado")
	go s.triggerVisualFlows(context.Background(), storeID, "order_created", orderID, str(q["conversation_id"]), map[string]string{"order_id": orderID, "telefono": str(q["customer_phone"]), "cliente": str(q["customer_name"])})
	jsonOut(w, 201, map[string]any{"ok": true, "order_id": orderID, "order_number": orderNumber, "public_token": token})
}

func (s *Server) quoteFollowupLoop() {
	ticker := time.NewTicker(45 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		rows, err := s.db.Query(ctx, `SELECT f.id::text,f.store_id::text,coalesce(f.conversation_id::text,''),f.body,coalesce(c.whatsapp_phone,''),q.status FROM quote_followups f JOIN quotes q ON q.id=f.quote_id LEFT JOIN conversations c ON c.id=f.conversation_id WHERE f.status='pending' AND f.scheduled_for<=now() ORDER BY f.scheduled_for LIMIT 50`)
		if err != nil {
			cancel()
			continue
		}
		type due struct{ id, storeID, conversationID, body, phone, quoteStatus string }
		list := []due{}
		for rows.Next() {
			var x due
			if rows.Scan(&x.id, &x.storeID, &x.conversationID, &x.body, &x.phone, &x.quoteStatus) == nil {
				list = append(list, x)
			}
		}
		rows.Close()
		cancel()
		for _, x := range list {
			if x.quoteStatus == "approved" || x.quoteStatus == "rejected" || x.quoteStatus == "converted" || x.quoteStatus == "cancelled" {
				_, _ = s.db.Exec(context.Background(), `UPDATE quote_followups SET status='cancelled',cancelled_at=now() WHERE id=$1`, x.id)
				continue
			}
			if normalizePhone(x.phone) == "" {
				_, _ = s.db.Exec(context.Background(), `UPDATE quote_followups SET status='failed',error='Sin WhatsApp disponible' WHERE id=$1`, x.id)
				continue
			}
			if err := s.queueWhatsApp(context.Background(), x.storeID, x.conversationID, normalizePhone(x.phone), x.body, "quote_followup"); err != nil {
				_, _ = s.db.Exec(context.Background(), `UPDATE quote_followups SET status='failed',error=$1 WHERE id=$2`, err.Error(), x.id)
			} else {
				_, _ = s.db.Exec(context.Background(), `UPDATE quote_followups SET status='sent',sent_at=now() WHERE id=$1`, x.id)
			}
		}
	}
}
