package httpapi

import (
	"fmt"
	"net/http"
	"strings"
)

func alphabeticSuffix(n int) string {
	if n <= 0 {
		return "A"
	}
	out := ""
	for n > 0 {
		n--
		out = string(rune('A'+(n%26))) + out
		n /= 26
	}
	return out
}

func bulkTableNames(baseName, suffixType string, quantity int) []string {
	baseName = strings.TrimSpace(baseName)
	names := make([]string, 0, quantity)
	for i := 1; i <= quantity; i++ {
		var suffix string
		switch suffixType {
		case "alphabetic":
			suffix = alphabeticSuffix(i)
		case "mixed":
			suffix = fmt.Sprintf("A%d", i)
		default:
			suffix = fmt.Sprintf("%d", i)
		}
		names = append(names, strings.TrimSpace(baseName+" "+suffix))
	}
	return names
}

func (s *Server) createStoreTablesBulk(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		StoreID    string `json:"store_id"`
		AreaID     string `json:"area_id"`
		BaseName   string `json:"base_name"`
		SuffixType string `json:"suffix_type"`
		Quantity   int    `json:"quantity"`
		Capacity   int    `json:"capacity"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.AreaID) == "" || strings.TrimSpace(in.BaseName) == "" || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, http.StatusBadRequest, "Datos de creación automática inválidos")
		return
	}
	in.StoreID = strings.TrimSpace(in.StoreID)
	in.AreaID = strings.TrimSpace(in.AreaID)
	in.BaseName = strings.TrimSpace(in.BaseName)
	in.SuffixType = strings.ToLower(strings.TrimSpace(in.SuffixType))
	if in.SuffixType != "numeric" && in.SuffixType != "alphabetic" && in.SuffixType != "mixed" {
		jsonErr(w, http.StatusBadRequest, "Selecciona un sufijo válido")
		return
	}
	quantity := in.Quantity
	if quantity <= 0 || quantity > 500 {
		jsonErr(w, http.StatusBadRequest, "La cantidad debe estar entre 1 y 500 mesas")
		return
	}
	if in.Capacity <= 0 {
		in.Capacity = 4
	}
	if in.Capacity > 50 {
		in.Capacity = 50
	}

	names := bulkTableNames(in.BaseName, in.SuffixType, quantity)
	for _, name := range names {
		if len([]rune(name)) > 80 {
			jsonErr(w, http.StatusBadRequest, "El nombre generado supera el máximo de 80 caracteres; usa un nombre base más corto")
			return
		}
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo iniciar la creación automática")
		return
	}
	defer tx.Rollback(r.Context())

	var areaName string
	if tx.QueryRow(r.Context(), `SELECT name FROM store_table_areas WHERE id=$1 AND store_id=$2 AND is_active=true`, in.AreaID, in.StoreID).Scan(&areaName) != nil {
		jsonErr(w, http.StatusBadRequest, "Selecciona un área válida")
		return
	}

	rows, err := tx.Query(r.Context(), `SELECT name FROM store_tables WHERE store_id=$1`, in.StoreID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudieron validar las mesas existentes")
		return
	}
	existing := map[string]bool{}
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil {
			existing[name] = true
		}
	}
	rows.Close()
	for _, name := range names {
		if existing[name] {
			jsonErr(w, http.StatusConflict, fmt.Sprintf("Ya existe una mesa llamada %q. No se creó ninguna mesa del lote.", name))
			return
		}
	}

	var sortOrder int
	if tx.QueryRow(r.Context(), `SELECT coalesce(max(sort_order),0) FROM store_tables WHERE store_id=$1`, in.StoreID).Scan(&sortOrder) != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo calcular el orden de las mesas")
		return
	}
	created := make([]map[string]any, 0, quantity)
	for _, name := range names {
		sortOrder += 10
		var id string
		if err := tx.QueryRow(r.Context(), `INSERT INTO store_tables(store_id,area_id,name,capacity,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING id::text`, in.StoreID, in.AreaID, name, in.Capacity, sortOrder).Scan(&id); err != nil {
			jsonErr(w, http.StatusConflict, "No se pudo completar el lote. No se creó ninguna mesa; verifica que los nombres no estén repetidos")
			return
		}
		created = append(created, map[string]any{"id": id, "name": name, "area_id": in.AreaID, "area_name": areaName, "capacity": in.Capacity, "sort_order": sortOrder, "is_active": true})
	}
	if err := tx.Commit(r.Context()); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo confirmar la creación automática")
		return
	}
	jsonOut(w, http.StatusCreated, map[string]any{"count": len(created), "area_id": in.AreaID, "area_name": areaName, "tables": created})
}
