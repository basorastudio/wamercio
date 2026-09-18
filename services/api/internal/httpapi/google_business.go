package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type googleBusinessSettings struct {
	StoreID           string     `json:"store_id"`
	LocationEnabled   bool       `json:"location_enabled"`
	ReviewsEnabled    bool       `json:"reviews_enabled"`
	PostsEnabled      bool       `json:"posts_enabled"`
	HoursEnabled      bool       `json:"hours_enabled"`
	ConnectionID      string     `json:"connection_id"`
	LastSyncDirection string     `json:"last_sync_direction"`
	LastSyncedAt      *time.Time `json:"last_synced_at,omitempty"`
	ReviewURL         string     `json:"review_url"`
}

func (s *Server) getGoogleBusinessSettings(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	row := googleBusinessSettings{StoreID: storeID, LocationEnabled: true, ReviewsEnabled: true, PostsEnabled: true, HoursEnabled: true}
	var connectionID *string
	err := s.db.QueryRow(r.Context(), `SELECT location_enabled,reviews_enabled,posts_enabled,hours_enabled,connection_id::text,last_sync_direction,last_synced_at,review_url FROM store_google_business_settings WHERE store_id=$1`, storeID).Scan(&row.LocationEnabled, &row.ReviewsEnabled, &row.PostsEnabled, &row.HoursEnabled, &connectionID, &row.LastSyncDirection, &row.LastSyncedAt, &row.ReviewURL)
	if err == nil && connectionID != nil {
		row.ConnectionID = *connectionID
	}
	if row.ConnectionID == "" {
		_ = s.db.QueryRow(r.Context(), `SELECT id::text FROM store_social_connections WHERE store_id=$1 AND provider='google_business' AND status='active' ORDER BY connected_at DESC LIMIT 1`, storeID).Scan(&row.ConnectionID)
	}
	if row.ReviewURL == "" && row.ConnectionID != "" {
		if c, e := s.socialConnectionByID(r.Context(), row.ConnectionID, false); e == nil {
			row.ReviewURL = fmt.Sprint(c.Metadata["new_review_uri"])
		}
	}
	jsonOut(w, 200, row)
}

func (s *Server) updateGoogleBusinessSettings(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	var in struct {
		LocationEnabled bool   `json:"location_enabled"`
		ReviewsEnabled  bool   `json:"reviews_enabled"`
		PostsEnabled    bool   `json:"posts_enabled"`
		HoursEnabled    bool   `json:"hours_enabled"`
		ConnectionID    string `json:"connection_id"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if in.ConnectionID != "" {
		c, err := s.socialConnectionByID(r.Context(), in.ConnectionID, false)
		if err != nil || c.StoreID != storeID || c.Provider != "google_business" {
			jsonErr(w, 400, "Conexión de Google no válida")
			return
		}
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO store_google_business_settings(store_id,location_enabled,reviews_enabled,posts_enabled,hours_enabled,connection_id,updated_at) VALUES($1,$2,$3,$4,$5,NULLIF($6,'')::uuid,now()) ON CONFLICT(store_id) DO UPDATE SET location_enabled=excluded.location_enabled,reviews_enabled=excluded.reviews_enabled,posts_enabled=excluded.posts_enabled,hours_enabled=excluded.hours_enabled,connection_id=excluded.connection_id,updated_at=now()`, storeID, in.LocationEnabled, in.ReviewsEnabled, in.PostsEnabled, in.HoursEnabled, in.ConnectionID)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la configuración de Google")
		return
	}
	s.getGoogleBusinessSettings(w, r)
}

func (s *Server) googleConnectionForStore(ctx context.Context, storeID, connectionID string) (storeSocialConnection, string, error) {
	if connectionID == "" {
		_ = s.db.QueryRow(ctx, `SELECT connection_id::text FROM store_google_business_settings WHERE store_id=$1`, storeID).Scan(&connectionID)
	}
	if connectionID == "" {
		return storeSocialConnection{}, "", fmt.Errorf("conecta primero un Perfil de Empresa en Google")
	}
	c, err := s.socialConnectionByID(ctx, connectionID, true)
	if err != nil || c.StoreID != storeID || c.Provider != "google_business" || c.Status != "active" {
		return c, "", fmt.Errorf("conexión de Google no disponible")
	}
	token, err := s.socialAccessToken(c)
	if err != nil {
		return c, "", err
	}
	return c, token, nil
}

func googleLocationName(c storeSocialConnection) string {
	if v := strings.TrimSpace(fmt.Sprint(c.Metadata["location_name"])); v != "" && v != "<nil>" {
		return v
	}
	return c.ProviderUserID
}
func googleReviewParent(c storeSocialConnection) string {
	if v := strings.TrimSpace(fmt.Sprint(c.Metadata["review_parent"])); v != "" && v != "<nil>" {
		return strings.TrimPrefix(v, "/")
	}
	return strings.TrimPrefix(googleLocationName(c), "/")
}

func (s *Server) getGoogleBusinessProfile(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	c, token, err := s.googleConnectionForStore(r.Context(), storeID, chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 409, err.Error())
		return
	}
	q := url.Values{}
	q.Set("readMask", "name,title,storefrontAddress,phoneNumbers,regularHours,websiteUri,metadata")
	endpoint := "https://mybusinessbusinessinformation.googleapis.com/v1/" + strings.TrimPrefix(googleLocationName(c), "/") + "?" + q.Encode()
	var profile map[string]any
	if err = s.socialJSON(r.Context(), http.MethodGet, endpoint, token, nil, &profile); err != nil {
		jsonErr(w, 502, "Google no pudo devolver el perfil: "+err.Error())
		return
	}
	jsonOut(w, 200, map[string]any{"connection": c, "profile": profile})
}

func googleStoreAddress(profile map[string]any) string {
	a, _ := profile["storefrontAddress"].(map[string]any)
	if a == nil {
		return ""
	}
	parts := []string{}
	if lines, ok := a["addressLines"].([]any); ok {
		for _, v := range lines {
			if x := strings.TrimSpace(fmt.Sprint(v)); x != "" {
				parts = append(parts, x)
			}
		}
	}
	for _, k := range []string{"locality", "administrativeArea", "postalCode"} {
		if x := strings.TrimSpace(fmt.Sprint(a[k])); x != "" && x != "<nil>" {
			parts = append(parts, x)
		}
	}
	return strings.Join(parts, ", ")
}

var googleDayToStore = map[string]string{
	"MONDAY": "mon", "TUESDAY": "tue", "WEDNESDAY": "wed", "THURSDAY": "thu",
	"FRIDAY": "fri", "SATURDAY": "sat", "SUNDAY": "sun",
}

var storeDayToGoogle = map[string]string{
	"mon": "MONDAY", "tue": "TUESDAY", "wed": "WEDNESDAY", "thu": "THURSDAY",
	"fri": "FRIDAY", "sat": "SATURDAY", "sun": "SUNDAY",
}

var storeDayOrder = []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

func googleTimeToHHMM(v any) string {
	if text := strings.TrimSpace(fmt.Sprint(v)); text != "" && text != "<nil>" && !strings.HasPrefix(text, "map[") {
		if len(text) >= 5 && strings.Contains(text, ":") {
			return text[:5]
		}
	}
	m, _ := v.(map[string]any)
	if m == nil {
		return ""
	}
	h, _ := strconv.Atoi(fmt.Sprint(m["hours"]))
	min, _ := strconv.Atoi(fmt.Sprint(m["minutes"]))
	if h < 0 || h > 23 || min < 0 || min > 59 {
		return ""
	}
	return fmt.Sprintf("%02d:%02d", h, min)
}

func googleHoursToStoreHours(profile map[string]any) map[string]any {
	out := map[string]any{}
	for _, key := range storeDayOrder {
		out[key] = map[string]any{"enabled": false, "open": "08:00", "close": "18:00"}
	}
	regular, _ := profile["regularHours"].(map[string]any)
	if regular == nil {
		return out
	}
	periods, _ := regular["periods"].([]any)
	for _, raw := range periods {
		period, _ := raw.(map[string]any)
		if period == nil {
			continue
		}
		key := googleDayToStore[strings.ToUpper(strings.TrimSpace(fmt.Sprint(period["openDay"])))]
		if key == "" {
			continue
		}
		openAt := googleTimeToHHMM(period["openTime"])
		closeAt := googleTimeToHHMM(period["closeTime"])
		if openAt == "" || closeAt == "" {
			continue
		}
		out[key] = map[string]any{"enabled": true, "open": openAt, "close": closeAt}
	}
	return out
}

func hhmmToGoogleTime(value string) map[string]any {
	parts := strings.Split(strings.TrimSpace(value), ":")
	hour, minute := 0, 0
	if len(parts) >= 2 {
		hour, _ = strconv.Atoi(parts[0])
		minute, _ = strconv.Atoi(parts[1])
	}
	return map[string]any{"hours": hour, "minutes": minute}
}

func nextStoreDay(key string) string {
	for i, day := range storeDayOrder {
		if day == key {
			return storeDayOrder[(i+1)%len(storeDayOrder)]
		}
	}
	return key
}

func storeHoursToGoogleHours(raw []byte) map[string]any {
	var hours map[string]struct {
		Enabled bool   `json:"enabled"`
		Open    string `json:"open"`
		Close   string `json:"close"`
	}
	if json.Unmarshal(raw, &hours) != nil {
		return map[string]any{"periods": []any{}}
	}
	periods := make([]any, 0, 7)
	for _, key := range storeDayOrder {
		day, ok := hours[key]
		if !ok || !day.Enabled || strings.TrimSpace(day.Open) == "" || strings.TrimSpace(day.Close) == "" {
			continue
		}
		closeDay := key
		if day.Close < day.Open {
			closeDay = nextStoreDay(key)
		}
		periods = append(periods, map[string]any{
			"openDay": storeDayToGoogle[key], "openTime": hhmmToGoogleTime(day.Open),
			"closeDay": storeDayToGoogle[closeDay], "closeTime": hhmmToGoogleTime(day.Close),
		})
	}
	return map[string]any{"periods": periods}
}

func (s *Server) syncGoogleBusinessFromGoogle(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	c, token, err := s.googleConnectionForStore(r.Context(), storeID, chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 409, err.Error())
		return
	}
	q := url.Values{}
	q.Set("readMask", "name,title,storefrontAddress,phoneNumbers,regularHours,websiteUri,metadata")
	var profile map[string]any
	if err = s.socialJSON(r.Context(), http.MethodGet, "https://mybusinessbusinessinformation.googleapis.com/v1/"+strings.TrimPrefix(googleLocationName(c), "/")+"?"+q.Encode(), token, nil, &profile); err != nil {
		jsonErr(w, 502, err.Error())
		return
	}
	title := strings.TrimSpace(fmt.Sprint(profile["title"]))
	address := googleStoreAddress(profile)
	if title == "<nil>" {
		title = ""
	}
	if address == "<nil>" {
		address = ""
	}
	var locationEnabled, hoursEnabled bool
	if e := s.db.QueryRow(r.Context(), `SELECT location_enabled,hours_enabled FROM store_google_business_settings WHERE store_id=$1`, storeID).Scan(&locationEnabled, &hoursEnabled); e != nil {
		locationEnabled, hoursEnabled = true, true
	}
	normalizedHours, _ := json.Marshal(googleHoursToStoreHours(profile))
	_, err = s.db.Exec(r.Context(), `UPDATE stores SET name=CASE WHEN $2 AND $3<>'' THEN $3 ELSE name END,address=CASE WHEN $2 AND $4<>'' THEN $4 ELSE address END,business_hours=CASE WHEN $5 THEN $6::jsonb ELSE business_hours END,updated_at=now() WHERE id=$1`, storeID, locationEnabled, title, address, hoursEnabled, string(normalizedHours))
	if err != nil {
		jsonErr(w, 500, "No se pudo aplicar el perfil de Google")
		return
	}
	reviewURL := strings.TrimSpace(fmt.Sprint(c.Metadata["new_review_uri"]))
	if reviewURL == "<nil>" {
		reviewURL = ""
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO store_google_business_settings(store_id,connection_id,last_sync_direction,last_synced_at,review_url) VALUES($1,$2,'from_google',now(),$3) ON CONFLICT(store_id) DO UPDATE SET connection_id=excluded.connection_id,last_sync_direction='from_google',last_synced_at=now(),review_url=CASE WHEN excluded.review_url<>'' THEN excluded.review_url ELSE store_google_business_settings.review_url END,updated_at=now()`, storeID, c.ID, reviewURL)
	jsonOut(w, 200, map[string]any{"ok": true, "profile": profile})
}

func (s *Server) syncGoogleBusinessToGoogle(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	c, token, err := s.googleConnectionForStore(r.Context(), storeID, chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 409, err.Error())
		return
	}
	var name, address, province, municipality, street, number string
	var hoursRaw []byte
	if err = s.db.QueryRow(r.Context(), `SELECT name,coalesce(address,''),coalesce(province,''),coalesce(municipality,''),coalesce(street,''),coalesce(street_number,''),business_hours FROM stores WHERE id=$1`, storeID).Scan(&name, &address, &province, &municipality, &street, &number, &hoursRaw); err != nil {
		jsonErr(w, 404, "Negocio no encontrado")
		return
	}
	var locationEnabled, hoursEnabled bool
	if e := s.db.QueryRow(r.Context(), `SELECT location_enabled,hours_enabled FROM store_google_business_settings WHERE store_id=$1`, storeID).Scan(&locationEnabled, &hoursEnabled); e != nil {
		locationEnabled, hoursEnabled = true, true
	}
	line := strings.TrimSpace(strings.TrimSpace(street) + " " + strings.TrimSpace(number))
	if line == "" {
		line = address
	}
	payload := map[string]any{}
	mask := []string{}
	if locationEnabled {
		payload["title"] = name
		payload["storefrontAddress"] = map[string]any{"regionCode": "DO", "addressLines": []string{line}, "locality": municipality, "administrativeArea": province}
		mask = append(mask, "title", "storefrontAddress")
	}
	if hoursEnabled {
		payload["regularHours"] = storeHoursToGoogleHours(hoursRaw)
		mask = append(mask, "regularHours")
	}
	if len(mask) == 0 {
		jsonErr(w, 400, "Activa Ubicación o Horario comercial antes de sincronizar")
		return
	}
	q := url.Values{}
	q.Set("updateMask", strings.Join(mask, ","))
	endpoint := "https://mybusinessbusinessinformation.googleapis.com/v1/" + strings.TrimPrefix(googleLocationName(c), "/") + "?" + q.Encode()
	var out map[string]any
	if err = s.socialJSONBody(r.Context(), http.MethodPatch, endpoint, token, nil, payload, &out); err != nil {
		jsonErr(w, 502, "Google no pudo actualizar el perfil: "+err.Error())
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO store_google_business_settings(store_id,connection_id,last_sync_direction,last_synced_at) VALUES($1,$2,'to_google',now()) ON CONFLICT(store_id) DO UPDATE SET connection_id=excluded.connection_id,last_sync_direction='to_google',last_synced_at=now(),updated_at=now()`, storeID, c.ID)
	jsonOut(w, 200, map[string]any{"ok": true, "profile": out})
}

func (s *Server) listGoogleBusinessReviews(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	c, token, err := s.googleConnectionForStore(r.Context(), storeID, chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 409, err.Error())
		return
	}
	q := url.Values{}
	q.Set("pageSize", "50")
	q.Set("orderBy", "updateTime desc")
	var out map[string]any
	endpoint := "https://mybusiness.googleapis.com/v4/" + googleReviewParent(c) + "/reviews?" + q.Encode()
	if err = s.socialJSON(r.Context(), http.MethodGet, endpoint, token, nil, &out); err != nil {
		jsonErr(w, 502, "No se pudieron cargar las reseñas de Google: "+err.Error())
		return
	}
	jsonOut(w, 200, out)
}

func (s *Server) replyGoogleBusinessReview(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	c, token, err := s.googleConnectionForStore(r.Context(), storeID, chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 409, err.Error())
		return
	}
	var in struct {
		Comment string `json:"comment"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Comment) == "" {
		jsonErr(w, 400, "Escribe una respuesta")
		return
	}
	endpoint := "https://mybusiness.googleapis.com/v4/" + googleReviewParent(c) + "/reviews/" + url.PathEscape(chi.URLParam(r, "reviewID")) + "/reply"
	var out map[string]any
	if err = s.socialJSONBody(r.Context(), http.MethodPut, endpoint, token, nil, map[string]any{"comment": strings.TrimSpace(in.Comment)}, &out); err != nil {
		jsonErr(w, 502, "No se pudo responder la reseña: "+err.Error())
		return
	}
	jsonOut(w, 200, out)
}

func (s *Server) googleBusinessPerformance(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	c, token, err := s.googleConnectionForStore(r.Context(), storeID, chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 409, err.Error())
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days != 30 && days != 90 && days != 180 {
		days = 30
	}
	end := time.Now()
	start := end.AddDate(0, 0, -days+1)
	q := url.Values{}
	for _, m := range []string{"BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS"} {
		q.Add("dailyMetrics", m)
	}
	q.Set("dailyRange.startDate.year", strconv.Itoa(start.Year()))
	q.Set("dailyRange.startDate.month", strconv.Itoa(int(start.Month())))
	q.Set("dailyRange.startDate.day", strconv.Itoa(start.Day()))
	q.Set("dailyRange.endDate.year", strconv.Itoa(end.Year()))
	q.Set("dailyRange.endDate.month", strconv.Itoa(int(end.Month())))
	q.Set("dailyRange.endDate.day", strconv.Itoa(end.Day()))
	location := strings.TrimPrefix(googleLocationName(c), "/")
	if strings.Contains(location, "/") {
		location = "locations/" + location[strings.LastIndex(location, "/")+1:]
	}
	endpoint := "https://businessprofileperformance.googleapis.com/v1/" + location + ":fetchMultiDailyMetricsTimeSeries?" + q.Encode()
	var out map[string]any
	if err = s.socialJSON(r.Context(), http.MethodGet, endpoint, token, nil, &out); err != nil {
		jsonErr(w, 502, "No se pudo cargar el rendimiento de Google: "+err.Error())
		return
	}
	jsonOut(w, 200, map[string]any{"days": days, "series": out})
}

func (s *Server) listGoogleBusinessMedia(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	c, token, err := s.googleConnectionForStore(r.Context(), storeID, chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 409, err.Error())
		return
	}
	var out map[string]any
	if err = s.socialJSON(r.Context(), http.MethodGet, "https://mybusiness.googleapis.com/v4/"+googleReviewParent(c)+"/media", token, nil, &out); err != nil {
		jsonErr(w, 502, "No se pudo cargar la multimedia de Google: "+err.Error())
		return
	}
	jsonOut(w, 200, out)
}

func (s *Server) publishGoogleBusinessMedia(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	c, token, err := s.googleConnectionForStore(r.Context(), storeID, chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 409, err.Error())
		return
	}
	var assetURL string
	if err = s.db.QueryRow(r.Context(), `SELECT url FROM store_media_assets WHERE id=$1 AND store_id=$2`, chi.URLParam(r, "assetID"), storeID).Scan(&assetURL); err != nil {
		jsonErr(w, 404, "Archivo no encontrado")
		return
	}
	if !strings.HasPrefix(assetURL, "http") {
		assetURL = strings.TrimRight(s.cfg.AppURL, "/") + "/" + strings.TrimLeft(assetURL, "/")
	}
	payload := map[string]any{"mediaFormat": "PHOTO", "locationAssociation": map[string]any{"category": "ADDITIONAL"}, "sourceUrl": assetURL}
	var out map[string]any
	if err = s.socialJSONBody(r.Context(), http.MethodPost, "https://mybusiness.googleapis.com/v4/"+googleReviewParent(c)+"/media", token, nil, payload, &out); err != nil {
		jsonErr(w, 502, "No se pudo publicar la imagen en Google: "+err.Error())
		return
	}
	jsonOut(w, 201, out)
}
