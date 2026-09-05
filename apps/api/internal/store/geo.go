package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

type GeoTenantDeliveryConfig struct {
	TenantID, Name, Slug, GeoProvinceCode, GeoCityID, GeoNeighborhoodID, GeoID, GeoAddressLabel string
	Latitude, Longitude, DefaultDeliveryFee                                                     float64
}

func (s *Store) TenantDeliveryGeoConfig(ctx context.Context, slug string) (GeoTenantDeliveryConfig, error) {
	var x GeoTenantDeliveryConfig
	err := s.DB.QueryRow(ctx, `SELECT id::text,name,slug,coalesce(geo_province_code,''),coalesce(geo_city_id,''),coalesce(geo_neighborhood_id,''),coalesce(geo_id,''),coalesce(geo_address_label,''),coalesce(latitude::float8,0),coalesce(longitude::float8,0),default_delivery_fee FROM tenants WHERE slug=$1 AND active=true`, slug).Scan(&x.TenantID, &x.Name, &x.Slug, &x.GeoProvinceCode, &x.GeoCityID, &x.GeoNeighborhoodID, &x.GeoID, &x.GeoAddressLabel, &x.Latitude, &x.Longitude, &x.DefaultDeliveryFee)
	return x, err
}

type GeoDeliveryZoneInput struct {
	GeofenceID, Name, Category, ServiceType string
	Fee                                     float64
	Properties, Geometry                    any
	Priority                                int
}

func (s *Store) ImportGeoDeliveryZone(ctx context.Context, tenantID string, in GeoDeliveryZoneInput) (DeliveryZone, error) {
	if strings.TrimSpace(in.GeofenceID) == "" || strings.TrimSpace(in.Name) == "" {
		return DeliveryZone{}, errors.New("geocerca inválida")
	}
	if in.ServiceType == "" {
		in.ServiceType = "delivery"
	}
	if in.Priority == 0 {
		in.Priority = 100
	}
	props, _ := json.Marshal(in.Properties)
	geometry, _ := json.Marshal(in.Geometry)
	var z DeliveryZone
	err := s.DB.QueryRow(ctx, `INSERT INTO delivery_zones(tenant_id,name,fee,geo_geofence_id,geo_category,service_type,geo_properties,geo_geometry,priority,active)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
		ON CONFLICT(tenant_id,geo_geofence_id) WHERE geo_geofence_id IS NOT NULL
		DO UPDATE SET name=excluded.name,fee=excluded.fee,geo_category=excluded.geo_category,service_type=excluded.service_type,geo_properties=excluded.geo_properties,geo_geometry=excluded.geo_geometry,priority=excluded.priority,active=true
		RETURNING id::text,name,fee,coalesce(geo_geofence_id,''),coalesce(geo_category,''),service_type,priority,active`, tenantID, in.Name, in.Fee, in.GeofenceID, in.Category, in.ServiceType, props, geometry, in.Priority).Scan(&z.ID, &z.Name, &z.Fee, &z.GeoGeofenceID, &z.GeoCategory, &z.ServiceType, &z.Priority, &z.Active)
	z.GeoProperties = in.Properties
	z.GeoGeometry = in.Geometry
	return z, err
}

func (s *Store) DeliveryZoneByContainingGeofences(ctx context.Context, tenantID string, geofenceIDs []string) (DeliveryZone, bool, error) {
	if len(geofenceIDs) == 0 {
		return DeliveryZone{}, false, nil
	}
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,fee,coalesce(geo_geofence_id,''),coalesce(geo_category,''),service_type,priority,active FROM delivery_zones WHERE tenant_id=$1 AND active=true AND geo_geofence_id=ANY($2::text[]) ORDER BY priority,fee,name LIMIT 1`, tenantID, geofenceIDs)
	if err != nil {
		return DeliveryZone{}, false, err
	}
	defer rows.Close()
	if !rows.Next() {
		return DeliveryZone{}, false, nil
	}
	var z DeliveryZone
	if err := rows.Scan(&z.ID, &z.Name, &z.Fee, &z.GeoGeofenceID, &z.GeoCategory, &z.ServiceType, &z.Priority, &z.Active); err != nil {
		return DeliveryZone{}, false, err
	}
	return z, true, nil
}

func (s *Store) TenantHasGeoDeliveryZones(ctx context.Context, tenantID string) (bool, error) {
	var exists bool
	err := s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM delivery_zones WHERE tenant_id=$1 AND active=true AND geo_geofence_id IS NOT NULL)`, tenantID).Scan(&exists)
	return exists, err
}

type GeoAddressInput struct {
	ProvinceCode, CityID, NeighborhoodID, GeoID, Label, Source   string
	ProvinceName, CityName, NeighborhoodName, Address, Reference string
	Latitude, Longitude                                          float64
}

func (s *Store) UpdateTenantGeoAddress(ctx context.Context, tenantID string, in GeoAddressInput) error {
	_, err := s.DB.Exec(ctx, `UPDATE tenants SET geo_province_code=nullif($2,''),geo_city_id=nullif($3,''),geo_neighborhood_id=nullif($4,''),geo_id=nullif($5,''),geo_address_label=nullif($6,''),geo_address_source=nullif($7,''),latitude=nullif($8,0),longitude=nullif($9,0),sector=$10,address_line=$11,address_reference=$12,updated_at=now() WHERE id=$1`, tenantID, in.ProvinceCode, in.CityID, in.NeighborhoodID, in.GeoID, in.Label, in.Source, in.Latitude, in.Longitude, in.NeighborhoodName, in.Address, in.Reference)
	return err
}

func (s *Store) UpsertCustomerGeoAddress(ctx context.Context, tx pgx.Tx, customerID string, in GeoAddressInput) error {
	_, err := tx.Exec(ctx, `UPDATE customers SET geo_province_code=nullif($2,''),geo_city_id=nullif($3,''),geo_neighborhood_id=nullif($4,''),geo_id=nullif($5,''),geo_address_label=nullif($6,''),geo_address_source=nullif($7,''),latitude=nullif($8,0),longitude=nullif($9,0),province=$10,municipality=$11,sector=$12,address_line=$13,reference=$14 WHERE id=$1`, customerID, in.ProvinceCode, in.CityID, in.NeighborhoodID, in.GeoID, in.Label, in.Source, in.Latitude, in.Longitude, in.ProvinceName, in.CityName, in.NeighborhoodName, in.Address, in.Reference)
	return err
}

func (s *Store) DeliveryZone(ctx context.Context, tenantID, id string) (DeliveryZone, error) {
	var z DeliveryZone
	err := s.DB.QueryRow(ctx, `SELECT id::text,name,fee,coalesce(geo_geofence_id,''),coalesce(geo_category,''),service_type,priority,active FROM delivery_zones WHERE tenant_id=$1 AND id=$2`, tenantID, id).Scan(&z.ID, &z.Name, &z.Fee, &z.GeoGeofenceID, &z.GeoCategory, &z.ServiceType, &z.Priority, &z.Active)
	if errors.Is(err, pgx.ErrNoRows) {
		return z, errors.New("zona no encontrada")
	}
	return z, err
}
