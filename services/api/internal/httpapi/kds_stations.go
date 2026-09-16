package httpapi

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

type kdsStationInput struct {
	StoreID     string   `json:"store_id"`
	Name        string   `json:"name"`
	SortOrder   int      `json:"sort_order"`
	IsActive    *bool    `json:"is_active"`
	CategoryIDs []string `json:"category_ids"`
	ProductIDs  []string `json:"product_ids"`
}

func (s *Server) listKDSStations(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,name,sort_order,is_active FROM kds_stations WHERE store_id=$1 ORDER BY sort_order,name`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las estaciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name string
		var sort int
		var active bool
		if rows.Scan(&id, &name, &sort, &active) != nil {
			continue
		}
		cats := []string{}
		if cr, e := s.db.Query(r.Context(), `SELECT category_id::text FROM kds_station_categories WHERE station_id=$1 ORDER BY category_id`, id); e == nil {
			for cr.Next() {
				var cid string
				if cr.Scan(&cid) == nil {
					cats = append(cats, cid)
				}
			}
			cr.Close()
		}
		products := []string{}
		if pr, e := s.db.Query(r.Context(), `SELECT product_id::text FROM kds_station_products WHERE station_id=$1 ORDER BY product_id`, id); e == nil {
			for pr.Next() {
				var pid string
				if pr.Scan(&pid) == nil {
					products = append(products, pid)
				}
			}
			pr.Close()
		}
		out = append(out, map[string]any{"id": id, "name": name, "sort_order": sort, "is_active": active, "category_ids": cats, "product_ids": products})
	}
	jsonOut(w, 200, out)
}

func (s *Server) saveKDSStationCategories(r *http.Request, stationID, storeID string, categoryIDs []string) error {
	_, err := s.db.Exec(r.Context(), `DELETE FROM kds_station_categories WHERE station_id=$1`, stationID)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, cid := range categoryIDs {
		cid = strings.TrimSpace(cid)
		if cid == "" || seen[cid] {
			continue
		}
		seen[cid] = true
		res, e := s.db.Exec(r.Context(), `INSERT INTO kds_station_categories(station_id,category_id) SELECT $1,c.id FROM categories c WHERE c.id=$2 AND c.store_id=$3`, stationID, cid, storeID)
		if e != nil {
			return e
		}
		if res.RowsAffected() == 0 {
			return errInvalidStationCategory
		}
	}
	return nil
}

func (s *Server) saveKDSStationProducts(r *http.Request, stationID, storeID string, productIDs []string) error {
	_, err := s.db.Exec(r.Context(), `DELETE FROM kds_station_products WHERE station_id=$1`, stationID)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, pid := range productIDs {
		pid = strings.TrimSpace(pid)
		if pid == "" || seen[pid] {
			continue
		}
		seen[pid] = true
		res, e := s.db.Exec(r.Context(), `INSERT INTO kds_station_products(station_id,product_id) SELECT $1,p.id FROM products p WHERE p.id=$2 AND p.store_id=$3`, stationID, pid, storeID)
		if e != nil {
			return e
		}
		if res.RowsAffected() == 0 {
			return errInvalidStationProduct
		}
	}
	return nil
}

var errInvalidStationCategory = &stationValidationError{"Una categoría no pertenece a la tienda"}
var errInvalidStationProduct = &stationValidationError{"Un producto no pertenece a la tienda"}

type stationValidationError struct{ message string }

func (e *stationValidationError) Error() string { return e.message }

func (s *Server) createKDSStation(w http.ResponseWriter, r *http.Request) {
	var in kdsStationInput
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre y tienda son obligatorios")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	var id string
	if s.db.QueryRow(r.Context(), `INSERT INTO kds_stations(store_id,name,sort_order,is_active) VALUES($1,$2,$3,$4) RETURNING id::text`, in.StoreID, strings.TrimSpace(in.Name), in.SortOrder, active).Scan(&id) != nil {
		jsonErr(w, 409, "Ya existe una estación con ese nombre")
		return
	}
	if err := s.saveKDSStationCategories(r, id, in.StoreID, in.CategoryIDs); err != nil {
		s.db.Exec(r.Context(), `DELETE FROM kds_stations WHERE id=$1`, id)
		jsonErr(w, 400, err.Error())
		return
	}
	if err := s.saveKDSStationProducts(r, id, in.StoreID, in.ProductIDs); err != nil {
		s.db.Exec(r.Context(), `DELETE FROM kds_stations WHERE id=$1`, id)
		jsonErr(w, 400, err.Error())
		return
	}
	jsonOut(w, 201, map[string]any{"id": id})
}

func (s *Server) updateKDSStation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in kdsStationInput
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	res, err := s.db.Exec(r.Context(), `UPDATE kds_stations SET name=$1,sort_order=$2,is_active=$3,updated_at=now() WHERE id=$4 AND store_id=$5`, strings.TrimSpace(in.Name), in.SortOrder, active, id, in.StoreID)
	if err != nil {
		jsonErr(w, 409, "No se pudo guardar la estación")
		return
	}
	if res.RowsAffected() == 0 {
		jsonErr(w, 404, "Estación no encontrada")
		return
	}
	if err = s.saveKDSStationCategories(r, id, in.StoreID, in.CategoryIDs); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	if err = s.saveKDSStationProducts(r, id, in.StoreID, in.ProductIDs); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteKDSStation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM kds_stations WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Estación no encontrada")
		return
	}
	_, err := s.db.Exec(r.Context(), `DELETE FROM kds_stations WHERE id=$1`, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo eliminar la estación")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}
