package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

func customerAddressRow(id, label, provinceCode, province, cityID, municipality, neighborhoodID, neighborhood, street, streetNumber, reference string, primary bool, created time.Time) map[string]any {
	input := customerAddressInput{
		Label: label, ProvinceCode: provinceCode, Province: province, CityID: cityID, Municipality: municipality,
		NeighborhoodID: neighborhoodID, Neighborhood: neighborhood, Street: street, StreetNumber: streetNumber, Reference: reference, IsPrimary: primary,
	}
	return map[string]any{
		"id": id, "label": label, "province_code": provinceCode, "province": province, "city_id": cityID, "municipality": municipality,
		"neighborhood_id": neighborhoodID, "neighborhood": neighborhood, "street": street, "street_number": streetNumber, "reference": reference,
		"is_primary": primary, "formatted": customerAddressText(input), "created_at": created,
	}
}

func (s *Server) customerMe(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var id, phone, name, lastName, nationalID, birthDate, gender, status, whatsappName, profilePictureURL, profilePictureID string
	var whatsappVerified, identityVerified bool
	var created time.Time
	err := s.db.QueryRow(r.Context(), `SELECT id::text,phone,name,coalesce(last_name,''),coalesce(national_id,''),coalesce(to_char(birth_date,'YYYY-MM-DD'),''),coalesce(gender,''),status,whatsapp_verified_at IS NOT NULL,identity_verified_at IS NOT NULL,created_at,coalesce(whatsapp_name,''),coalesce(profile_picture_url,''),coalesce(profile_picture_id,'') FROM global_customers WHERE id=$1`, c.UserID).Scan(&id, &phone, &name, &lastName, &nationalID, &birthDate, &gender, &status, &whatsappVerified, &identityVerified, &created, &whatsappName, &profilePictureURL, &profilePictureID)
	if err != nil || status != "active" {
		jsonErr(w, http.StatusNotFound, "Cliente no encontrado")
		return
	}
	addresses := []map[string]any{}
	rows, _ := s.db.Query(r.Context(), `SELECT id::text,label,coalesce(province_code,''),coalesce(province,''),coalesce(city_id,''),coalesce(municipality,''),coalesce(neighborhood_id,''),coalesce(neighborhood,''),street,coalesce(street_number,''),coalesce(reference,''),is_primary,created_at FROM customer_addresses WHERE global_customer_id=$1 ORDER BY is_primary DESC,created_at DESC`, c.UserID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var aid, label, provinceCode, province, cityID, municipality, neighborhoodID, neighborhood, street, streetNumber, reference string
			var primary bool
			var at time.Time
			if rows.Scan(&aid, &label, &provinceCode, &province, &cityID, &municipality, &neighborhoodID, &neighborhood, &street, &streetNumber, &reference, &primary, &at) == nil {
				addresses = append(addresses, customerAddressRow(aid, label, provinceCode, province, cityID, municipality, neighborhoodID, neighborhood, street, streetNumber, reference, primary, at))
			}
		}
	}
	jsonOut(w, http.StatusOK, map[string]any{
		"id": id, "phone": phone, "name": name, "last_name": lastName, "national_id": nationalID,
		"birth_date": birthDate, "gender": gender, "status": status, "whatsapp_verified": whatsappVerified,
		"identity_verified": identityVerified, "whatsapp_name": whatsappName, "profile_picture_url": profilePictureURL,
		"profile_picture_id": profilePictureID, "created_at": created, "addresses": addresses,
	})
}

func (s *Server) customerUpdateMe(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Name      string `json:"name"`
		LastName  string `json:"last_name"`
		BirthDate string `json:"birth_date"`
		Gender    string `json:"gender"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	var verified bool
	_ = s.db.QueryRow(r.Context(), `SELECT identity_verified_at IS NOT NULL FROM global_customers WHERE id=$1`, c.UserID).Scan(&verified)
	if verified {
		jsonErr(w, http.StatusConflict, "Los datos personales verificados se actualizan mediante Identidad Dominicana")
		return
	}
	name := strings.TrimSpace(in.Name)
	lastName := strings.TrimSpace(in.LastName)
	if name == "" || lastName == "" {
		jsonErr(w, http.StatusBadRequest, "Nombre y apellido son obligatorios")
		return
	}
	birthDate := strings.TrimSpace(in.BirthDate)
	if birthDate != "" {
		if _, err := time.Parse("2006-01-02", birthDate); err != nil {
			jsonErr(w, http.StatusBadRequest, "La fecha de nacimiento no es válida")
			return
		}
	}
	gender := normalizeOwnerGender(in.Gender)
	if _, err := s.db.Exec(r.Context(), `UPDATE global_customers SET name=$1,last_name=$2,birth_date=nullif($3,'')::date,gender=nullif($4,''),updated_at=now() WHERE id=$5`, name, lastName, birthDate, gender, c.UserID); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar el perfil")
		return
	}
	s.customerMe(w, r)
}

func (s *Server) customerAddresses(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	rows, err := s.db.Query(r.Context(), `SELECT id::text,label,coalesce(province_code,''),coalesce(province,''),coalesce(city_id,''),coalesce(municipality,''),coalesce(neighborhood_id,''),coalesce(neighborhood,''),street,coalesce(street_number,''),coalesce(reference,''),is_primary,created_at FROM customer_addresses WHERE global_customer_id=$1 ORDER BY is_primary DESC,created_at DESC`, c.UserID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudieron cargar las direcciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, label, provinceCode, province, cityID, municipality, neighborhoodID, neighborhood, street, streetNumber, reference string
		var primary bool
		var created time.Time
		if rows.Scan(&id, &label, &provinceCode, &province, &cityID, &municipality, &neighborhoodID, &neighborhood, &street, &streetNumber, &reference, &primary, &created) == nil {
			out = append(out, customerAddressRow(id, label, provinceCode, province, cityID, municipality, neighborhoodID, neighborhood, street, streetNumber, reference, primary, created))
		}
	}
	jsonOut(w, http.StatusOK, out)
}

func validateCustomerAddress(in customerAddressInput) (customerAddressInput, string) {
	in = normalizeCustomerAddress(in)
	if in.Province == "" || in.Municipality == "" || in.Neighborhood == "" || in.Street == "" || in.StreetNumber == "" {
		return in, "Completa provincia, municipio, barrio, calle y número"
	}
	return in, ""
}

func (s *Server) customerCreateAddress(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in customerAddressInput
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Dirección inválida")
		return
	}
	var msg string
	in, msg = validateCustomerAddress(in)
	if msg != "" {
		jsonErr(w, http.StatusBadRequest, msg)
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo guardar la dirección")
		return
	}
	defer tx.Rollback(r.Context())
	var count int
	_ = tx.QueryRow(r.Context(), `SELECT count(*)::int FROM customer_addresses WHERE global_customer_id=$1`, c.UserID).Scan(&count)
	primary := in.IsPrimary || count == 0
	if primary {
		_, _ = tx.Exec(r.Context(), `UPDATE customer_addresses SET is_primary=false,updated_at=now() WHERE global_customer_id=$1 AND is_primary=true`, c.UserID)
	}
	var id string
	var created time.Time
	err = tx.QueryRow(r.Context(), `INSERT INTO customer_addresses(global_customer_id,label,province_code,province,city_id,municipality,neighborhood_id,neighborhood,street,street_number,reference,is_primary) VALUES($1,$2,nullif($3,''),$4,nullif($5,''),$6,nullif($7,''),$8,$9,$10,nullif($11,''),$12) RETURNING id::text,created_at`, c.UserID, in.Label, in.ProvinceCode, in.Province, in.CityID, in.Municipality, in.NeighborhoodID, in.Neighborhood, in.Street, in.StreetNumber, in.Reference, primary).Scan(&id, &created)
	if err != nil || tx.Commit(r.Context()) != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo guardar la dirección")
		return
	}
	jsonOut(w, http.StatusCreated, customerAddressRow(id, in.Label, in.ProvinceCode, in.Province, in.CityID, in.Municipality, in.NeighborhoodID, in.Neighborhood, in.Street, in.StreetNumber, in.Reference, primary, created))
}

func (s *Server) customerUpdateAddress(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var in customerAddressInput
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Dirección inválida")
		return
	}
	var msg string
	in, msg = validateCustomerAddress(in)
	if msg != "" {
		jsonErr(w, http.StatusBadRequest, msg)
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar la dirección")
		return
	}
	defer tx.Rollback(r.Context())
	var exists bool
	_ = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM customer_addresses WHERE id=$1 AND global_customer_id=$2)`, id, c.UserID).Scan(&exists)
	if !exists {
		jsonErr(w, http.StatusNotFound, "Dirección no encontrada")
		return
	}
	if in.IsPrimary {
		_, _ = tx.Exec(r.Context(), `UPDATE customer_addresses SET is_primary=false,updated_at=now() WHERE global_customer_id=$1 AND id<>$2 AND is_primary=true`, c.UserID, id)
	}
	_, err = tx.Exec(r.Context(), `UPDATE customer_addresses SET label=$1,province_code=nullif($2,''),province=$3,city_id=nullif($4,''),municipality=$5,neighborhood_id=nullif($6,''),neighborhood=$7,street=$8,street_number=$9,reference=nullif($10,''),is_primary=$11,updated_at=now() WHERE id=$12 AND global_customer_id=$13`, in.Label, in.ProvinceCode, in.Province, in.CityID, in.Municipality, in.NeighborhoodID, in.Neighborhood, in.Street, in.StreetNumber, in.Reference, in.IsPrimary, id, c.UserID)
	if err != nil || tx.Commit(r.Context()) != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar la dirección")
		return
	}
	jsonOut(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) customerDeleteAddress(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo eliminar la dirección")
		return
	}
	defer tx.Rollback(r.Context())
	var wasPrimary bool
	err = tx.QueryRow(r.Context(), `DELETE FROM customer_addresses WHERE id=$1 AND global_customer_id=$2 RETURNING is_primary`, id, c.UserID).Scan(&wasPrimary)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "Dirección no encontrada")
		return
	}
	if wasPrimary {
		_, _ = tx.Exec(r.Context(), `UPDATE customer_addresses SET is_primary=true,updated_at=now() WHERE id=(SELECT id FROM customer_addresses WHERE global_customer_id=$1 ORDER BY created_at DESC LIMIT 1)`, c.UserID)
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo eliminar la dirección")
		return
	}
	jsonOut(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) customerOrders(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	rows, err := s.db.Query(r.Context(), `SELECT o.id::text,o.order_number,o.total,o.status,o.payment_status,o.delivery_type,coalesce(o.delivery_address,''),o.source,o.created_at,s.id::text,s.name,s.slug,(SELECT count(*)::int FROM order_items oi WHERE oi.order_id=o.id),coalesce(t.name,''),o.reservation_at,coalesce(o.party_size,0) FROM orders o JOIN stores s ON s.id=o.store_id LEFT JOIN store_tables t ON t.id=o.table_id WHERE o.global_customer_id=$1 ORDER BY o.created_at DESC LIMIT 300`, c.UserID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudieron cargar los pedidos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, status, paymentStatus, deliveryType, address, source, storeID, storeName, storeSlug, tableName string
		var number int64
		var total float64
		var created time.Time
		var itemCount, partySize int
		var reservationAt *time.Time
		if rows.Scan(&id, &number, &total, &status, &paymentStatus, &deliveryType, &address, &source, &created, &storeID, &storeName, &storeSlug, &itemCount, &tableName, &reservationAt, &partySize) == nil {
			out = append(out, map[string]any{"id": id, "number": number, "total": total, "status": status, "payment_status": paymentStatus, "delivery_type": deliveryType, "delivery_address": address, "source": source, "created_at": created, "store_name": storeName, "store_slug": storeSlug, "store_public_url": s.storePublicURL(r.Context(), storeID, storeSlug), "item_count": itemCount, "table_name": tableName, "reservation_at": reservationAt, "party_size": partySize})
		}
	}
	jsonOut(w, http.StatusOK, out)
}

func (s *Server) customerOrder(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var number int64
	var total, subtotal, discount, shipping, cashTendered float64
	var status, paymentStatus, paymentMethod, deliveryType, address, notes, storeName, storeSlug, tableName string
	var cashChangeRequested bool
	var created time.Time
	var reservationAt *time.Time
	var partySize int
	var storeID string
	err := s.db.QueryRow(r.Context(), `SELECT o.order_number,o.subtotal,o.discount,o.shipping,o.total,o.status,o.payment_status,o.payment_method,o.cash_change_requested,coalesce(o.cash_tendered,0),o.delivery_type,coalesce(o.delivery_address,''),coalesce(o.notes,''),o.created_at,s.id::text,s.name,s.slug,coalesce(t.name,''),o.reservation_at,coalesce(o.party_size,0) FROM orders o JOIN stores s ON s.id=o.store_id LEFT JOIN store_tables t ON t.id=o.table_id WHERE o.id=$1 AND o.global_customer_id=$2`, id, c.UserID).Scan(&number, &subtotal, &discount, &shipping, &total, &status, &paymentStatus, &paymentMethod, &cashChangeRequested, &cashTendered, &deliveryType, &address, &notes, &created, &storeID, &storeName, &storeSlug, &tableName, &reservationAt, &partySize)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "Pedido no encontrado")
		return
	}
	items := []map[string]any{}
	rows, _ := s.db.Query(r.Context(), `SELECT product_name,coalesce(variant_name,''),extras,unit_price,quantity,line_total FROM order_items WHERE order_id=$1 ORDER BY id`, id)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var name, variant string
			var extras any
			var unit, qty, line float64
			if rows.Scan(&name, &variant, &extras, &unit, &qty, &line) == nil {
				items = append(items, map[string]any{"name": name, "variant_name": variant, "extras": extras, "unit_price": unit, "quantity": qty, "line_total": line})
			}
		}
	}
	jsonOut(w, http.StatusOK, map[string]any{"id": id, "number": number, "subtotal": subtotal, "discount": discount, "shipping": shipping, "total": total, "status": status, "payment_status": paymentStatus, "payment_method": paymentMethod, "cash_change_requested": cashChangeRequested, "cash_tendered": cashTendered, "delivery_type": deliveryType, "delivery_address": address, "table_name": tableName, "reservation_at": reservationAt, "party_size": partySize, "notes": notes, "created_at": created, "store_name": storeName, "store_slug": storeSlug, "store_public_url": s.storePublicURL(r.Context(), storeID, storeSlug), "items": items})
}
