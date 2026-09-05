package store

import (
	"context"
	"errors"
)

type ProductImage struct {
	ID, URL  string
	Position int
}

type ProductOption struct {
	ID, Name   string
	PriceDelta float64
	Position   int
	Active     bool
}

type ProductOptionGroup struct {
	ID, Name                       string
	MinSelect, MaxSelect, Position int
	Required                       bool
	Options                        []ProductOption
}

type ProductAdminDetail struct {
	Product      Product
	Images       []ProductImage
	OptionGroups []ProductOptionGroup
}

type ProductWrite struct {
	CategoryID, Name, Description, Reference, PosCode, VideoURL, ImageURL string
	Price, PromoPrice, WeightKG, HeightCM, WidthCM, LengthCM              float64
	Featured, OnSale, TrackStock, Visible                                 bool
	Stock, Position                                                       int
}

func (s *Store) ProductAdmin(ctx context.Context, tenantID, id string) (ProductAdminDetail, error) {
	p, err := s.Product(ctx, tenantID, id)
	if err != nil {
		return ProductAdminDetail{}, err
	}
	rows, err := s.DB.Query(ctx, `SELECT id::text,url,position FROM product_images WHERE product_id=$1 ORDER BY position`, id)
	if err != nil {
		return ProductAdminDetail{}, err
	}
	defer rows.Close()
	var imgs []ProductImage
	for rows.Next() {
		var x ProductImage
		if err := rows.Scan(&x.ID, &x.URL, &x.Position); err != nil {
			return ProductAdminDetail{}, err
		}
		imgs = append(imgs, x)
	}
	gr, err := s.DB.Query(ctx, `SELECT id::text,name,min_select,max_select,required,position FROM product_option_groups WHERE product_id=$1 ORDER BY position,name`, id)
	if err != nil {
		return ProductAdminDetail{}, err
	}
	defer gr.Close()
	var groups []ProductOptionGroup
	for gr.Next() {
		var g ProductOptionGroup
		if err := gr.Scan(&g.ID, &g.Name, &g.MinSelect, &g.MaxSelect, &g.Required, &g.Position); err != nil {
			return ProductAdminDetail{}, err
		}
		orows, err := s.DB.Query(ctx, `SELECT id::text,name,price_delta,position,active FROM product_options WHERE group_id=$1 ORDER BY position,name`, g.ID)
		if err != nil {
			return ProductAdminDetail{}, err
		}
		for orows.Next() {
			var o ProductOption
			if err := orows.Scan(&o.ID, &o.Name, &o.PriceDelta, &o.Position, &o.Active); err != nil {
				orows.Close()
				return ProductAdminDetail{}, err
			}
			g.Options = append(g.Options, o)
		}
		orows.Close()
		groups = append(groups, g)
	}
	return ProductAdminDetail{Product: p, Images: imgs, OptionGroups: groups}, nil
}

func (s *Store) CreateProductFull(ctx context.Context, tenantID string, in ProductWrite) (Product, error) {
	ent, err := s.Entitlements(ctx, tenantID)
	if err == nil && ent.ProductLimit > 0 {
		count, countErr := s.ProductCount(ctx, tenantID)
		if countErr == nil && count >= ent.ProductLimit {
			return Product{}, errors.New("alcanzaste el límite de productos de tu plan")
		}
	}
	var x Product
	err = s.DB.QueryRow(ctx, `INSERT INTO products(tenant_id,category_id,name,description,reference,pos_code,video_url,price,promo_price,featured,on_sale,visible,active,track_stock,stock,position,weight_kg,height_cm,width_cm,length_cm) VALUES($1,$2,$3,$4,$5,$6,nullif($7,''),$8,nullif($9,0),$10,$11,$12,true,$13,$14,$15,nullif($16,0),nullif($17,0),nullif($18,0),nullif($19,0)) RETURNING id::text,category_id::text,name,coalesce(description,''),coalesce(reference,''),coalesce(pos_code,''),coalesce(video_url,''),'',price,coalesce(promo_price,0),coalesce(weight_kg,0),coalesce(height_cm,0),coalesce(width_cm,0),coalesce(length_cm,0),featured,on_sale,track_stock,stock`, tenantID, in.CategoryID, in.Name, in.Description, in.Reference, in.PosCode, in.VideoURL, in.Price, in.PromoPrice, in.Featured, in.OnSale, in.Visible, in.TrackStock, in.Stock, in.Position, in.WeightKG, in.HeightCM, in.WidthCM, in.LengthCM).Scan(&x.ID, &x.CategoryID, &x.Name, &x.Description, &x.Reference, &x.PosCode, &x.VideoURL, &x.ImageURL, &x.Price, &x.PromoPrice, &x.WeightKG, &x.HeightCM, &x.WidthCM, &x.LengthCM, &x.Featured, &x.OnSale, &x.TrackStock, &x.Stock)
	if err != nil {
		return x, err
	}
	if in.ImageURL != "" {
		_, _ = s.DB.Exec(ctx, `INSERT INTO product_images(product_id,url,position) VALUES($1,$2,0)`, x.ID, in.ImageURL)
		x.ImageURL = in.ImageURL
	}
	return x, nil
}
func (s *Store) UpdateProduct(ctx context.Context, tenantID, id string, in ProductWrite) (Product, error) {
	tag, err := s.DB.Exec(ctx, `UPDATE products SET category_id=$3,name=$4,description=$5,reference=$6,pos_code=$7,video_url=nullif($8,''),price=$9,promo_price=nullif($10,0),featured=$11,on_sale=$12,visible=$13,track_stock=$14,stock=$15,position=$16,weight_kg=nullif($17,0),height_cm=nullif($18,0),width_cm=nullif($19,0),length_cm=nullif($20,0),updated_at=now() WHERE tenant_id=$1 AND id=$2`, tenantID, id, in.CategoryID, in.Name, in.Description, in.Reference, in.PosCode, in.VideoURL, in.Price, in.PromoPrice, in.Featured, in.OnSale, in.Visible, in.TrackStock, in.Stock, in.Position, in.WeightKG, in.HeightCM, in.WidthCM, in.LengthCM)
	if err != nil {
		return Product{}, err
	}
	if tag.RowsAffected() == 0 {
		return Product{}, errors.New("producto no encontrado")
	}
	return s.Product(ctx, tenantID, id)
}
func (s *Store) DeleteProduct(ctx context.Context, tenantID, id string) error {
	tag, err := s.DB.Exec(ctx, `UPDATE products SET active=false,visible=false,updated_at=now() WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("producto no encontrado")
	}
	return nil
}
func (s *Store) AddProductImage(ctx context.Context, tenantID, productID, url string) (ProductImage, error) {
	var x ProductImage
	err := s.DB.QueryRow(ctx, `INSERT INTO product_images(product_id,url,position) SELECT p.id,$3,coalesce((SELECT max(position)+1 FROM product_images WHERE product_id=p.id),0) FROM products p WHERE p.tenant_id=$1 AND p.id=$2 RETURNING id::text,url,position`, tenantID, productID, url).Scan(&x.ID, &x.URL, &x.Position)
	return x, err
}
func (s *Store) DeleteProductImage(ctx context.Context, tenantID, productID, imageID string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM product_images i USING products p WHERE i.id=$3 AND i.product_id=p.id AND p.id=$2 AND p.tenant_id=$1`, tenantID, productID, imageID)
	return err
}
func (s *Store) AddOptionGroup(ctx context.Context, tenantID, productID string, g ProductOptionGroup) (ProductOptionGroup, error) {
	ent, entErr := s.Entitlements(ctx, tenantID)
	if entErr == nil && !ent.Variations {
		return g, errors.New("las variaciones no están incluidas en tu plan")
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return g, err
	}
	defer tx.Rollback(ctx)
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO product_option_groups(product_id,name,min_select,max_select,required,position) SELECT p.id,$3,$4,$5,$6,$7 FROM products p WHERE p.tenant_id=$1 AND p.id=$2 RETURNING id::text`, tenantID, productID, g.Name, g.MinSelect, g.MaxSelect, g.Required, g.Position).Scan(&id)
	if err != nil {
		return g, err
	}
	g.ID = id
	for i, o := range g.Options {
		if o.Name == "" {
			continue
		}
		var no ProductOption
		err = tx.QueryRow(ctx, `INSERT INTO product_options(group_id,name,price_delta,active,position) VALUES($1,$2,$3,true,$4) RETURNING id::text,name,price_delta,position,active`, id, o.Name, o.PriceDelta, i).Scan(&no.ID, &no.Name, &no.PriceDelta, &no.Position, &no.Active)
		if err != nil {
			return g, err
		}
		g.Options[i] = no
	}
	return g, tx.Commit(ctx)
}
func (s *Store) DeleteOptionGroup(ctx context.Context, tenantID, productID, groupID string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM product_option_groups g USING products p WHERE g.id=$3 AND g.product_id=p.id AND p.id=$2 AND p.tenant_id=$1`, tenantID, productID, groupID)
	return err
}
