package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type modifierOptionInput struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Price     float64 `json:"price_delta"`
	SortOrder int     `json:"sort_order"`
	IsActive  *bool   `json:"is_active"`
}

type modifierGroupInput struct {
	StoreID     string                `json:"store_id"`
	Name        string                `json:"name"`
	Description string                `json:"description"`
	MinSelect   int                   `json:"min_select"`
	MaxSelect   int                   `json:"max_select"`
	IsRequired  bool                  `json:"is_required"`
	IsActive    *bool                 `json:"is_active"`
	SortOrder   int                   `json:"sort_order"`
	Options     []modifierOptionInput `json:"options"`
}

type bundleComponentInput struct {
	ProductID string  `json:"product_id"`
	Quantity  float64 `json:"quantity"`
	SortOrder int     `json:"sort_order"`
}

type productCompositionInput struct {
	StoreID          string                 `json:"store_id"`
	ModifierGroupIDs []string               `json:"modifier_group_ids"`
	BundleComponents []bundleComponentInput `json:"bundle_components"`
	AllergenIDs      []string               `json:"allergen_ids"`
	DietaryTags      []string               `json:"dietary_tags"`
}

type allergenInput struct {
	StoreID   string `json:"store_id"`
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	IsActive  *bool  `json:"is_active"`
	SortOrder int    `json:"sort_order"`
}

type modifierResolvedGroup struct {
	ID        string
	Name      string
	MinSelect int
	MaxSelect int
	Options   map[string]modifierResolvedOption
}

type modifierResolvedOption struct {
	ID    string
	Name  string
	Price float64
}

type bundleResolvedComponent struct {
	ProductID string  `json:"product_id"`
	Name      string  `json:"name"`
	Quantity  float64 `json:"quantity"`
	Track     bool    `json:"-"`
}

func normalizeModifierGroupInput(in *modifierGroupInput) error {
	in.StoreID = strings.TrimSpace(in.StoreID)
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	if in.StoreID == "" || in.Name == "" {
		return fmt.Errorf("Completa negocio y nombre del grupo")
	}
	if in.MinSelect < 0 {
		in.MinSelect = 0
	}
	if in.IsRequired && in.MinSelect == 0 {
		in.MinSelect = 1
	}
	if in.MaxSelect < 1 {
		in.MaxSelect = 1
	}
	if in.MaxSelect < in.MinSelect {
		return fmt.Errorf("El máximo de selecciones no puede ser menor que el mínimo")
	}
	clean := make([]modifierOptionInput, 0, len(in.Options))
	for idx, option := range in.Options {
		option.Name = strings.TrimSpace(option.Name)
		if option.Name == "" {
			continue
		}
		if option.SortOrder <= 0 {
			option.SortOrder = (idx + 1) * 10
		}
		clean = append(clean, option)
	}
	if len(clean) == 0 {
		return fmt.Errorf("Agrega al menos una opción al grupo")
	}
	in.Options = clean
	return nil
}

func (s *Server) listModifierGroups(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,name,coalesce(description,''),min_select,max_select,is_required,is_active,sort_order,created_at,updated_at FROM modifier_groups WHERE store_id=$1 ORDER BY sort_order,name`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los modificadores")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, description string
		var minSelect, maxSelect, sortOrder int
		var required, active bool
		var created, updated any
		if rows.Scan(&id, &name, &description, &minSelect, &maxSelect, &required, &active, &sortOrder, &created, &updated) != nil {
			continue
		}
		options := []map[string]any{}
		if optionRows, qerr := s.db.Query(r.Context(), `SELECT id::text,name,price_delta,is_active,sort_order FROM modifier_options WHERE group_id=$1 ORDER BY sort_order,name`, id); qerr == nil {
			for optionRows.Next() {
				var oid, oname string
				var price float64
				var oactive bool
				var osort int
				if optionRows.Scan(&oid, &oname, &price, &oactive, &osort) == nil {
					options = append(options, map[string]any{"id": oid, "name": oname, "price_delta": price, "is_active": oactive, "sort_order": osort})
				}
			}
			optionRows.Close()
		}
		out = append(out, map[string]any{"id": id, "name": name, "description": description, "min_select": minSelect, "max_select": maxSelect, "is_required": required, "is_active": active, "sort_order": sortOrder, "options": options, "created_at": created, "updated_at": updated})
	}
	jsonOut(w, 200, out)
}

func replaceModifierOptions(ctx context.Context, tx pgx.Tx, groupID string, options []modifierOptionInput) error {
	if _, err := tx.Exec(ctx, `DELETE FROM modifier_options WHERE group_id=$1`, groupID); err != nil {
		return err
	}
	for idx, option := range options {
		active := true
		if option.IsActive != nil {
			active = *option.IsActive
		}
		sortOrder := option.SortOrder
		if sortOrder <= 0 {
			sortOrder = (idx + 1) * 10
		}
		if _, err := tx.Exec(ctx, `INSERT INTO modifier_options(group_id,name,price_delta,is_active,sort_order) VALUES($1,$2,$3,$4,$5)`, groupID, strings.TrimSpace(option.Name), option.Price, active, sortOrder); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) createModifierGroup(w http.ResponseWriter, r *http.Request) {
	var in modifierGroupInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if err := normalizeModifierGroupInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
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
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el grupo")
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	if err = tx.QueryRow(r.Context(), `INSERT INTO modifier_groups(store_id,name,description,min_select,max_select,is_required,is_active,sort_order) VALUES($1,$2,nullif($3,''),$4,$5,$6,$7,$8) RETURNING id::text`, in.StoreID, in.Name, in.Description, in.MinSelect, in.MaxSelect, in.IsRequired, active, in.SortOrder).Scan(&id); err != nil {
		jsonErr(w, 409, "No se pudo crear el grupo")
		return
	}
	if err = replaceModifierOptions(r.Context(), tx, id, in.Options); err != nil {
		jsonErr(w, 500, "No se pudieron guardar las opciones")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el grupo")
		return
	}
	jsonOut(w, 201, map[string]string{"id": id})
}

func (s *Server) updateModifierGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in modifierGroupInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if err := normalizeModifierGroupInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
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
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el grupo")
		return
	}
	defer tx.Rollback(r.Context())
	res, err := tx.Exec(r.Context(), `UPDATE modifier_groups SET name=$1,description=nullif($2,''),min_select=$3,max_select=$4,is_required=$5,is_active=$6,sort_order=$7,updated_at=now() WHERE id=$8 AND store_id=$9`, in.Name, in.Description, in.MinSelect, in.MaxSelect, in.IsRequired, active, in.SortOrder, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Grupo no encontrado")
		return
	}
	if err = replaceModifierOptions(r.Context(), tx, id, in.Options); err != nil {
		jsonErr(w, 500, "No se pudieron actualizar las opciones")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el grupo")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteModifierGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM modifier_groups WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Grupo no encontrado")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM modifier_groups WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listAllergens(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,name,icon,is_active,sort_order,created_at,updated_at FROM allergens WHERE store_id=$1 ORDER BY sort_order,name`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los alérgenos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, icon string
		var active bool
		var sortOrder int
		var created, updated any
		if rows.Scan(&id, &name, &icon, &active, &sortOrder, &created, &updated) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "icon": icon, "is_active": active, "sort_order": sortOrder, "created_at": created, "updated_at": updated})
		}
	}
	jsonOut(w, 200, out)
}

func normalizeAllergenInput(in *allergenInput) error {
	in.StoreID = strings.TrimSpace(in.StoreID)
	in.Name = strings.TrimSpace(in.Name)
	in.Icon = strings.TrimSpace(in.Icon)
	if in.StoreID == "" || in.Name == "" {
		return fmt.Errorf("Completa negocio y nombre del alérgeno")
	}
	return nil
}

func (s *Server) createAllergen(w http.ResponseWriter, r *http.Request) {
	var in allergenInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if err := normalizeAllergenInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
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
	if err := s.db.QueryRow(r.Context(), `INSERT INTO allergens(store_id,name,icon,is_active,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING id::text`, in.StoreID, in.Name, in.Icon, active, in.SortOrder).Scan(&id); err != nil {
		jsonErr(w, 409, "Ese alérgeno ya existe")
		return
	}
	jsonOut(w, 201, map[string]string{"id": id})
}

func (s *Server) updateAllergen(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in allergenInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if err := normalizeAllergenInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
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
	res, err := s.db.Exec(r.Context(), `UPDATE allergens SET name=$1,icon=$2,is_active=$3,sort_order=$4,updated_at=now() WHERE id=$5 AND store_id=$6`, in.Name, in.Icon, active, in.SortOrder, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Alérgeno no encontrado")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteAllergen(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM allergens WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Alérgeno no encontrado")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM allergens WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) getProductComposition(w http.ResponseWriter, r *http.Request) {
	productID := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM products WHERE id=$1`, productID).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Producto no encontrado")
		return
	}
	out, err := s.loadProductComposition(r.Context(), productID)
	if err != nil {
		jsonErr(w, 500, "No se pudo cargar la configuración del producto")
		return
	}
	jsonOut(w, 200, out)
}

func (s *Server) updateProductComposition(w http.ResponseWriter, r *http.Request) {
	productID := chi.URLParam(r, "id")
	var in productCompositionInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	in.StoreID = strings.TrimSpace(in.StoreID)
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el producto")
		return
	}
	defer tx.Rollback(r.Context())
	var exists bool
	_ = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM products WHERE id=$1 AND store_id=$2)`, productID, in.StoreID).Scan(&exists)
	if !exists {
		jsonErr(w, 404, "Producto no encontrado")
		return
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM product_modifier_groups WHERE product_id=$1`, productID); err != nil {
		jsonErr(w, 500, "No se pudieron actualizar los modificadores")
		return
	}
	for idx, groupID := range uniqueStrings(in.ModifierGroupIDs) {
		res, qerr := tx.Exec(r.Context(), `INSERT INTO product_modifier_groups(product_id,group_id,sort_order) SELECT $1,g.id,$3 FROM modifier_groups g WHERE g.id=$2 AND g.store_id=$4`, productID, groupID, (idx+1)*10, in.StoreID)
		if qerr != nil || res.RowsAffected() == 0 {
			jsonErr(w, 400, "Uno de los grupos de modificadores no pertenece al negocio")
			return
		}
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM bundle_components WHERE bundle_product_id=$1`, productID); err != nil {
		jsonErr(w, 500, "No se pudo actualizar el combo")
		return
	}
	for idx, component := range in.BundleComponents {
		component.ProductID = strings.TrimSpace(component.ProductID)
		if component.ProductID == "" || component.ProductID == productID {
			jsonErr(w, 400, "Selecciona componentes válidos para el combo")
			return
		}
		if component.Quantity <= 0 {
			component.Quantity = 1
		}
		res, qerr := tx.Exec(r.Context(), `INSERT INTO bundle_components(bundle_product_id,component_product_id,quantity,sort_order) SELECT $1,p.id,$3,$4 FROM products p WHERE p.id=$2 AND p.store_id=$5`, productID, component.ProductID, component.Quantity, func() int {
			if component.SortOrder > 0 {
				return component.SortOrder
			}
			return (idx + 1) * 10
		}(), in.StoreID)
		if qerr != nil || res.RowsAffected() == 0 {
			jsonErr(w, 400, "Uno de los productos del combo no pertenece al negocio")
			return
		}
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM product_allergens WHERE product_id=$1`, productID); err != nil {
		jsonErr(w, 500, "No se pudieron actualizar los alérgenos")
		return
	}
	for _, allergenID := range uniqueStrings(in.AllergenIDs) {
		res, qerr := tx.Exec(r.Context(), `INSERT INTO product_allergens(product_id,allergen_id) SELECT $1,a.id FROM allergens a WHERE a.id=$2 AND a.store_id=$3`, productID, allergenID, in.StoreID)
		if qerr != nil || res.RowsAffected() == 0 {
			jsonErr(w, 400, "Uno de los alérgenos no pertenece al negocio")
			return
		}
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM product_dietary_tags WHERE product_id=$1`, productID); err != nil {
		jsonErr(w, 500, "No se pudieron actualizar las etiquetas")
		return
	}
	for _, tag := range uniqueStrings(in.DietaryTags) {
		tag = strings.ToLower(strings.TrimSpace(tag))
		if tag == "" {
			continue
		}
		if _, err = tx.Exec(r.Context(), `INSERT INTO product_dietary_tags(product_id,tag) VALUES($1,$2)`, productID, tag); err != nil {
			jsonErr(w, 500, "No se pudieron guardar las etiquetas")
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la configuración")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func (s *Server) loadProductComposition(ctx context.Context, productID string) (map[string]any, error) {
	modifierIDs := []string{}
	modifierGroups := []map[string]any{}
	rows, err := s.db.Query(ctx, `SELECT g.id::text,g.name,coalesce(g.description,''),g.min_select,g.max_select,g.is_required,g.sort_order FROM product_modifier_groups pmg JOIN modifier_groups g ON g.id=pmg.group_id WHERE pmg.product_id=$1 AND g.is_active=true ORDER BY pmg.sort_order,g.sort_order,g.name`, productID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id, name, description string
		var minSelect, maxSelect, sortOrder int
		var required bool
		if rows.Scan(&id, &name, &description, &minSelect, &maxSelect, &required, &sortOrder) != nil {
			continue
		}
		modifierIDs = append(modifierIDs, id)
		options := []map[string]any{}
		if optionRows, qerr := s.db.Query(ctx, `SELECT id::text,name,price_delta,sort_order FROM modifier_options WHERE group_id=$1 AND is_active=true ORDER BY sort_order,name`, id); qerr == nil {
			for optionRows.Next() {
				var oid, oname string
				var price float64
				var osort int
				if optionRows.Scan(&oid, &oname, &price, &osort) == nil {
					options = append(options, map[string]any{"id": oid, "name": oname, "price_delta": price, "sort_order": osort})
				}
			}
			optionRows.Close()
		}
		modifierGroups = append(modifierGroups, map[string]any{"id": id, "name": name, "description": description, "min_select": minSelect, "max_select": maxSelect, "is_required": required, "sort_order": sortOrder, "options": options})
	}
	rows.Close()

	bundle := []map[string]any{}
	if rows, qerr := s.db.Query(ctx, `SELECT p.id::text,p.name,coalesce(p.image_url,''),bc.quantity,bc.sort_order FROM bundle_components bc JOIN products p ON p.id=bc.component_product_id WHERE bc.bundle_product_id=$1 ORDER BY bc.sort_order,p.name`, productID); qerr == nil {
		for rows.Next() {
			var id, name, image string
			var qty float64
			var sortOrder int
			if rows.Scan(&id, &name, &image, &qty, &sortOrder) == nil {
				bundle = append(bundle, map[string]any{"product_id": id, "name": name, "image_url": image, "quantity": qty, "sort_order": sortOrder})
			}
		}
		rows.Close()
	}
	allergenIDs := []string{}
	allergenRows := []map[string]any{}
	if rows, qerr := s.db.Query(ctx, `SELECT a.id::text,a.name,a.icon FROM product_allergens pa JOIN allergens a ON a.id=pa.allergen_id WHERE pa.product_id=$1 AND a.is_active=true ORDER BY a.sort_order,a.name`, productID); qerr == nil {
		for rows.Next() {
			var id, name, icon string
			if rows.Scan(&id, &name, &icon) == nil {
				allergenIDs = append(allergenIDs, id)
				allergenRows = append(allergenRows, map[string]any{"id": id, "name": name, "icon": icon})
			}
		}
		rows.Close()
	}
	dietaryTags := []string{}
	if rows, qerr := s.db.Query(ctx, `SELECT tag FROM product_dietary_tags WHERE product_id=$1 ORDER BY tag`, productID); qerr == nil {
		for rows.Next() {
			var tag string
			if rows.Scan(&tag) == nil {
				dietaryTags = append(dietaryTags, tag)
			}
		}
		rows.Close()
	}
	return map[string]any{"modifier_group_ids": modifierIDs, "modifier_groups": modifierGroups, "bundle_components": bundle, "allergen_ids": allergenIDs, "allergens": allergenRows, "dietary_tags": dietaryTags}, nil
}

func (s *Server) enrichProductComposition(ctx context.Context, product map[string]any) map[string]any {
	id, _ := product["id"].(string)
	if id == "" {
		return product
	}
	composition, err := s.loadProductComposition(ctx, id)
	if err != nil {
		product["modifier_group_ids"] = []string{}
		product["modifier_groups"] = []map[string]any{}
		product["bundle_components"] = []map[string]any{}
		product["allergen_ids"] = []string{}
		product["allergens"] = []map[string]any{}
		product["dietary_tags"] = []string{}
		return s.enrichProductExperience(ctx, product)
	}
	for key, value := range composition {
		product[key] = value
	}
	return s.enrichProductExperience(ctx, product)
}

func resolveModifierOptions(ctx context.Context, tx pgx.Tx, storeID, productID string, selectedIDs []string) ([]map[string]any, float64, error) {
	selectedSet := map[string]bool{}
	for _, id := range uniqueStrings(selectedIDs) {
		selectedSet[id] = true
	}
	rows, err := tx.Query(ctx, `SELECT g.id::text,g.name,g.min_select,g.max_select,coalesce(o.id::text,''),coalesce(o.name,''),coalesce(o.price_delta,0) FROM product_modifier_groups pmg JOIN modifier_groups g ON g.id=pmg.group_id LEFT JOIN modifier_options o ON o.group_id=g.id AND o.is_active=true WHERE pmg.product_id=$1 AND g.store_id=$2 AND g.is_active=true ORDER BY pmg.sort_order,g.sort_order,o.sort_order,o.name`, productID, storeID)
	if err != nil {
		return nil, 0, err
	}
	groups := map[string]*modifierResolvedGroup{}
	order := []string{}
	for rows.Next() {
		var gid, gname, oid, oname string
		var minSelect, maxSelect int
		var price float64
		if rows.Scan(&gid, &gname, &minSelect, &maxSelect, &oid, &oname, &price) != nil {
			continue
		}
		group := groups[gid]
		if group == nil {
			group = &modifierResolvedGroup{ID: gid, Name: gname, MinSelect: minSelect, MaxSelect: maxSelect, Options: map[string]modifierResolvedOption{}}
			groups[gid] = group
			order = append(order, gid)
		}
		if oid != "" {
			group.Options[oid] = modifierResolvedOption{ID: oid, Name: oname, Price: price}
		}
	}
	rows.Close()
	validSelected := map[string]bool{}
	normalized := []map[string]any{}
	priceDelta := 0.0
	for _, gid := range order {
		group := groups[gid]
		selected := []modifierResolvedOption{}
		for oid, option := range group.Options {
			if selectedSet[oid] {
				selected = append(selected, option)
				validSelected[oid] = true
			}
		}
		sort.Slice(selected, func(i, j int) bool { return selected[i].Name < selected[j].Name })
		if len(selected) < group.MinSelect {
			return nil, 0, fmt.Errorf("Selecciona al menos %d opción(es) en %s", group.MinSelect, group.Name)
		}
		if len(selected) > group.MaxSelect {
			return nil, 0, fmt.Errorf("Selecciona hasta %d opción(es) en %s", group.MaxSelect, group.Name)
		}
		for _, option := range selected {
			priceDelta += option.Price
			normalized = append(normalized, map[string]any{"source": "modifier", "group_id": group.ID, "group": group.Name, "option_id": option.ID, "name": option.Name, "price": option.Price})
		}
	}
	for id := range selectedSet {
		if !validSelected[id] {
			return nil, 0, fmt.Errorf("Una opción seleccionada no pertenece al producto")
		}
	}
	return normalized, priceDelta, nil
}

func resolveBundleComponents(ctx context.Context, tx pgx.Tx, storeID, bundleProductID string, orderQty float64) ([]bundleResolvedComponent, error) {
	rows, err := tx.Query(ctx, `SELECT p.id::text,p.name,bc.quantity,p.track_stock,coalesce(p.stock,0) FROM bundle_components bc JOIN products p ON p.id=bc.component_product_id WHERE bc.bundle_product_id=$1 AND p.store_id=$2 AND p.is_active=true ORDER BY bc.sort_order,p.name FOR UPDATE OF p`, bundleProductID, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []bundleResolvedComponent{}
	for rows.Next() {
		var component bundleResolvedComponent
		var stock float64
		if rows.Scan(&component.ProductID, &component.Name, &component.Quantity, &component.Track, &stock) != nil {
			continue
		}
		needed := component.Quantity * orderQty
		if component.Track && stock < needed {
			return nil, fmt.Errorf("No hay existencia suficiente de %s para completar el combo", component.Name)
		}
		out = append(out, component)
	}
	return out, nil
}

func bundleSnapshotExtras(components []bundleResolvedComponent) []map[string]any {
	out := make([]map[string]any, 0, len(components))
	for _, component := range components {
		out = append(out, map[string]any{"source": "bundle", "product_id": component.ProductID, "name": component.Name, "quantity": component.Quantity, "price": 0})
	}
	return out
}
