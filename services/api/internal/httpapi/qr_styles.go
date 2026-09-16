package httpapi

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
)

var qrHex = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

type qrStyleInput struct {
	StoreID    string `json:"store_id"`
	TableID    string `json:"table_id"`
	Foreground string `json:"foreground"`
	Background string `json:"background"`
	ShowLogo   *bool  `json:"show_logo"`
	Label      string `json:"label"`
	FrameStyle string `json:"frame_style"`
}

func defaultQRStyle() map[string]any {
	return map[string]any{"foreground": "#111827", "background": "#FFFFFF", "show_logo": true, "label": "Escanea para ordenar", "frame_style": "rounded", "is_override": false}
}

func (s *Server) storeQRStyle(r *http.Request, storeID string) map[string]any {
	style := defaultQRStyle()
	var foreground, background, label, frame string
	var showLogo bool
	if s.db.QueryRow(r.Context(), `SELECT foreground,background,show_logo,label,frame_style FROM store_qr_styles WHERE store_id=$1`, storeID).Scan(&foreground, &background, &showLogo, &label, &frame) == nil {
		style = map[string]any{"foreground": foreground, "background": background, "show_logo": showLogo, "label": label, "frame_style": frame, "is_override": false}
	}
	return style
}

func (s *Server) getQRStyle(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	style := s.storeQRStyle(r, storeID)
	tableID := strings.TrimSpace(r.URL.Query().Get("table_id"))
	if tableID == "" {
		jsonOut(w, 200, style)
		return
	}
	var exists bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM store_tables WHERE id=$1 AND store_id=$2 AND is_active=true)`, tableID, storeID).Scan(&exists)
	if !exists {
		jsonErr(w, 404, "Mesa no encontrada")
		return
	}
	var foreground, background, label, frame string
	var showLogo bool
	if s.db.QueryRow(r.Context(), `SELECT foreground,background,show_logo,label,frame_style FROM table_qr_styles WHERE table_id=$1 AND store_id=$2`, tableID, storeID).Scan(&foreground, &background, &showLogo, &label, &frame) == nil {
		style = map[string]any{"foreground": foreground, "background": background, "show_logo": showLogo, "label": label, "frame_style": frame, "table_id": tableID, "is_override": true}
	} else {
		style["table_id"] = tableID
		style["is_override"] = false
	}
	jsonOut(w, 200, style)
}

func normalizeQRStyle(in qrStyleInput) (foreground, background string, showLogo bool, label, frame string, errText string) {
	if !qrHex.MatchString(in.Foreground) || !qrHex.MatchString(in.Background) {
		return "", "", false, "", "", "Los colores deben estar en formato hexadecimal #RRGGBB"
	}
	frame = strings.TrimSpace(in.FrameStyle)
	if frame != "rounded" && frame != "minimal" && frame != "card" {
		frame = "rounded"
	}
	showLogo = true
	if in.ShowLogo != nil {
		showLogo = *in.ShowLogo
	}
	label = strings.TrimSpace(in.Label)
	if label == "" {
		label = "Escanea para ordenar"
	}
	return strings.ToUpper(in.Foreground), strings.ToUpper(in.Background), showLogo, label, frame, ""
}

func (s *Server) updateQRStyle(w http.ResponseWriter, r *http.Request) {
	var in qrStyleInput
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	foreground, background, showLogo, label, frame, errText := normalizeQRStyle(in)
	if errText != "" {
		jsonErr(w, 400, errText)
		return
	}
	tableID := strings.TrimSpace(in.TableID)
	if tableID != "" {
		var exists bool
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM store_tables WHERE id=$1 AND store_id=$2 AND is_active=true)`, tableID, in.StoreID).Scan(&exists)
		if !exists {
			jsonErr(w, 404, "Mesa no encontrada")
			return
		}
		_, err := s.db.Exec(r.Context(), `INSERT INTO table_qr_styles(table_id,store_id,foreground,background,show_logo,label,frame_style,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(table_id) DO UPDATE SET foreground=excluded.foreground,background=excluded.background,show_logo=excluded.show_logo,label=excluded.label,frame_style=excluded.frame_style,updated_at=now()`, tableID, in.StoreID, foreground, background, showLogo, label, frame)
		if err != nil {
			jsonErr(w, 500, "No se pudo guardar el diseño QR de la mesa")
			return
		}
		jsonOut(w, 200, map[string]any{"foreground": foreground, "background": background, "show_logo": showLogo, "label": label, "frame_style": frame, "table_id": tableID, "is_override": true})
		return
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO store_qr_styles(store_id,foreground,background,show_logo,label,frame_style,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(store_id) DO UPDATE SET foreground=excluded.foreground,background=excluded.background,show_logo=excluded.show_logo,label=excluded.label,frame_style=excluded.frame_style,updated_at=now()`, in.StoreID, foreground, background, showLogo, label, frame)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar el diseño QR")
		return
	}
	jsonOut(w, 200, map[string]any{"foreground": foreground, "background": background, "show_logo": showLogo, "label": label, "frame_style": frame, "is_override": false})
}

func (s *Server) deleteTableQRStyle(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	tableID := chi.URLParam(r, "id")
	var exists bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM store_tables WHERE id=$1 AND store_id=$2)`, tableID, storeID).Scan(&exists)
	if !exists {
		jsonErr(w, 404, "Mesa no encontrada")
		return
	}
	_, err := s.db.Exec(r.Context(), `DELETE FROM table_qr_styles WHERE table_id=$1 AND store_id=$2`, tableID, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudo restablecer el diseño QR")
		return
	}
	style := s.storeQRStyle(r, storeID)
	style["table_id"] = tableID
	style["is_override"] = false
	jsonOut(w, 200, style)
}
