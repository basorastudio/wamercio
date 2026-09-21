package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

func joinCustomerAddressParts(parts ...string) string {
	clean := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			clean = append(clean, value)
		}
	}
	return strings.Join(clean, ", ")
}

func (s *Server) globalCustomerDetailData(ctx context.Context, id string) (map[string]any, error) {
	var phone, name, lastName, nationalID, gender, status, whatsappName, profilePictureURL string
	var identityVerified, whatsappVerified bool
	var birthDate, lastLogin *time.Time
	var createdAt, updatedAt time.Time
	if err := s.db.QueryRow(ctx, `
		SELECT phone,name,coalesce(last_name,''),coalesce(national_id,''),coalesce(gender,''),coalesce(status,'active'),
		       identity_verified_at IS NOT NULL,whatsapp_verified_at IS NOT NULL,coalesce(whatsapp_name,''),coalesce(profile_picture_url,''),
		       birth_date,last_login_at,created_at,updated_at
		FROM global_customers WHERE id=$1`, id).Scan(
		&phone, &name, &lastName, &nationalID, &gender, &status,
		&identityVerified, &whatsappVerified, &whatsappName, &profilePictureURL,
		&birthDate, &lastLogin, &createdAt, &updatedAt,
	); err != nil {
		return nil, err
	}

	fullName := strings.TrimSpace(strings.TrimSpace(name) + " " + strings.TrimSpace(lastName))
	addresses := []map[string]any{}
	var primaryAddress map[string]any
	rows, err := s.db.Query(ctx, `
		SELECT id::text,label,coalesce(province_code,''),coalesce(province,''),coalesce(city_id,''),coalesce(municipality,''),
		       coalesce(neighborhood_id,''),coalesce(neighborhood,''),street,coalesce(street_number,''),coalesce(reference,''),latitude,longitude,is_primary,created_at
		FROM customer_addresses WHERE global_customer_id=$1 ORDER BY is_primary DESC,created_at DESC`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var aid, label, provinceCode, province, cityID, municipality, neighborhoodID, neighborhood, street, streetNumber, reference string
			var latitude, longitude *float64
			var primary bool
			var created time.Time
			if rows.Scan(&aid, &label, &provinceCode, &province, &cityID, &municipality, &neighborhoodID, &neighborhood, &street, &streetNumber, &reference, &latitude, &longitude, &primary, &created) == nil {
				formatted := joinCustomerAddressParts(joinCustomerAddressParts(street, streetNumber), neighborhood, municipality, province)
				item := map[string]any{
					"id": aid, "label": label, "province_code": provinceCode, "province": province, "city_id": cityID,
					"municipality": municipality, "neighborhood_id": neighborhoodID, "neighborhood": neighborhood,
					"street": street, "street_number": streetNumber, "reference": reference, "latitude": latitude, "longitude": longitude, "is_primary": primary,
					"formatted_address": formatted, "map_query": formatted, "created_at": created,
				}
				addresses = append(addresses, item)
				if primaryAddress == nil || primary {
					primaryAddress = item
				}
			}
		}
	}

	businesses := []map[string]any{}
	var businessCount, orderCount int
	var totalSpent float64
	var lastOrderAt *time.Time
	brows, err := s.db.Query(ctx, `
		SELECT st.id::text,st.name,st.slug,count(*)::int,coalesce(sum(o.total),0),max(o.created_at)
		FROM orders o
		JOIN stores st ON st.id=o.store_id
		LEFT JOIN customers c ON c.id=o.customer_id
		WHERE coalesce(o.global_customer_id,c.global_customer_id)=$1 AND o.status<>'canceled' AND o.flow_type<>'quote'
		GROUP BY st.id,st.name,st.slug
		ORDER BY max(o.created_at) DESC`, id)
	if err == nil {
		defer brows.Close()
		for brows.Next() {
			var storeID, storeName, slug string
			var orders int
			var spent float64
			var last time.Time
			if brows.Scan(&storeID, &storeName, &slug, &orders, &spent, &last) == nil {
				businesses = append(businesses, map[string]any{"store_id": storeID, "store_name": storeName, "slug": slug, "orders": orders, "total_spent": spent, "last_order_at": last})
				businessCount++
				orderCount += orders
				totalSpent += spent
				if lastOrderAt == nil || last.After(*lastOrderAt) {
					copyLast := last
					lastOrderAt = &copyLast
				}
			}
		}
	}

	loyalty := []map[string]any{}
	lrows, err := s.db.Query(ctx, `
		SELECT st.id::text,st.name,la.points_balance,la.total_earned,la.total_redeemed,la.updated_at
		FROM loyalty_accounts la JOIN stores st ON st.id=la.store_id
		WHERE la.global_customer_id=$1
		ORDER BY la.points_balance DESC,la.updated_at DESC`, id)
	if err == nil {
		defer lrows.Close()
		for lrows.Next() {
			var storeID, storeName string
			var balance, earned, redeemed int
			var updated time.Time
			if lrows.Scan(&storeID, &storeName, &balance, &earned, &redeemed, &updated) == nil {
				loyalty = append(loyalty, map[string]any{"store_id": storeID, "store_name": storeName, "points_balance": balance, "total_earned": earned, "total_redeemed": redeemed, "updated_at": updated})
			}
		}
	}

	blocks := []map[string]any{}
	blockRows, blockErr := s.db.Query(ctx, `
		SELECT c.store_id::text,st.name,coalesce(c.blocked_reason,''),c.blocked_at,coalesce(u.name,''),coalesce(u.last_name,'')
		FROM customers c
		JOIN stores st ON st.id=c.store_id
		LEFT JOIN users u ON u.id=c.blocked_by_user_id
		JOIN global_customers g ON g.id=$1
		WHERE c.status='blocked'
		  AND (c.global_customer_id=g.id OR regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(g.phone,''),'[^0-9]','','g'))
		ORDER BY c.blocked_at DESC NULLS LAST,c.updated_at DESC`, id)
	if blockErr == nil {
		defer blockRows.Close()
		for blockRows.Next() {
			var storeID, storeName, reason, actorName, actorLastName string
			var blockedAt *time.Time
			if blockRows.Scan(&storeID, &storeName, &reason, &blockedAt, &actorName, &actorLastName) == nil {
				blocks = append(blocks, map[string]any{
					"store_id": storeID, "store_name": storeName, "reason": reason, "blocked_at": blockedAt,
					"blocked_by": strings.TrimSpace(strings.TrimSpace(actorName) + " " + strings.TrimSpace(actorLastName)),
				})
			}
		}
	}

	return map[string]any{
		"id": id, "phone": phone, "name": name, "last_name": lastName, "full_name": fullName, "national_id": nationalID,
		"birth_date": birthDate, "gender": gender, "status": status, "identity_verified": identityVerified, "whatsapp_verified": whatsappVerified,
		"whatsapp_name": whatsappName, "profile_picture_url": profilePictureURL, "last_login_at": lastLogin, "created_at": createdAt, "updated_at": updatedAt,
		"addresses": addresses, "primary_address": primaryAddress, "businesses": businesses, "loyalty_accounts": loyalty, "blocks": blocks,
		"blocked_businesses": len(blocks), "business_count": businessCount, "order_count": orderCount, "total_spent": totalSpent, "last_order_at": lastOrderAt,
	}, nil
}

func (s *Server) adminGlobalCustomerDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	detail, err := s.globalCustomerDetailData(r.Context(), id)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "Cliente global no encontrado")
		return
	}
	jsonOut(w, http.StatusOK, detail)
}
