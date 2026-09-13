package database

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var safeDatabaseNamePattern = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)

func DatabaseNameFromURL(databaseURL string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(databaseURL))
	if err != nil {
		return "", fmt.Errorf("parse database url: %w", err)
	}
	name := strings.Trim(strings.TrimSpace(u.Path), "/")
	if name == "" {
		return "", fmt.Errorf("database url no contiene nombre de base")
	}
	return name, nil
}

func databaseURLWithName(databaseURL, databaseName string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(databaseURL))
	if err != nil {
		return "", fmt.Errorf("parse database url: %w", err)
	}
	if u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("database url inválida")
	}
	u.Path = "/" + strings.TrimSpace(databaseName)
	return u.String(), nil
}

func maintenanceDatabaseURL(databaseURL string) (string, error) {
	return databaseURLWithName(databaseURL, "postgres")
}

func EnsureDatabaseForURL(ctx context.Context, databaseURL string) error {
	databaseName, err := DatabaseNameFromURL(databaseURL)
	if err != nil {
		return err
	}
	maintenanceURL, err := maintenanceDatabaseURL(databaseURL)
	if err != nil {
		return err
	}
	adminDB, err := Connect(ctx, maintenanceURL)
	if err != nil {
		targetDB, targetErr := Connect(ctx, databaseURL)
		if targetErr == nil {
			targetDB.Close()
			return nil
		}
		return fmt.Errorf("conectar a base de mantenimiento: %w", err)
	}
	defer adminDB.Close()
	return EnsureDatabase(ctx, adminDB, databaseName)
}

func EnsureDatabase(ctx context.Context, adminDB *pgxpool.Pool, databaseName string) error {
	databaseName = strings.TrimSpace(databaseName)
	if databaseName == "" {
		return fmt.Errorf("nombre de base vacío")
	}
	if !safeDatabaseNamePattern.MatchString(databaseName) {
		return fmt.Errorf("nombre de base inválido: %s", databaseName)
	}
	var exists bool
	if err := adminDB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)`, databaseName).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	_, err := adminDB.Exec(ctx, `CREATE DATABASE `+quoteIdentifier(databaseName))
	return err
}

func quoteIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func SyncExistingGlobalCustomers(ctx context.Context, coreDB, globalDB *pgxpool.Pool) error {
	var exists bool
	if err := coreDB.QueryRow(ctx, `SELECT to_regclass('public.global_customers') IS NOT NULL`).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return nil
	}
	rows, err := coreDB.Query(ctx, `
		SELECT id, name, national_id, whatsapp, whatsapp_display, national_id_digits, whatsapp_digits, country_code, dial_code, pin_hash,
		       province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng,
		       created_at, updated_at
		FROM global_customers
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	tx, err := globalDB.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		rollbackContext, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
		defer cancel()
		_ = tx.Rollback(rollbackContext)
	}()
	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE global_customers_sync
		(LIKE global_customers INCLUDING DEFAULTS)
		ON COMMIT DROP
	`); err != nil {
		return err
	}

	columns := []string{
		"id", "name", "national_id", "whatsapp", "whatsapp_display", "national_id_digits", "whatsapp_digits", "country_code", "dial_code", "pin_hash",
		"province", "province_code", "municipality", "municipality_code", "district_code", "neighborhood_id", "sector", "street", "street_number", "address_reference", "lat", "lng",
		"created_at", "updated_at",
	}
	source := &globalCustomerCopySource{rows: rows}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"global_customers_sync"}, columns, source); err != nil {
		return err
	}
	if err := source.Err(); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO global_customers (
			id, name, national_id, whatsapp, whatsapp_display, national_id_digits, whatsapp_digits, country_code, dial_code, pin_hash,
			province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng,
			created_at, updated_at
		)
		SELECT id, name, national_id, whatsapp, whatsapp_display, national_id_digits, whatsapp_digits, country_code, dial_code, pin_hash,
		       province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng,
		       created_at, updated_at
		FROM global_customers_sync
		ON CONFLICT (id) DO UPDATE SET
			name=EXCLUDED.name, national_id=EXCLUDED.national_id, whatsapp=EXCLUDED.whatsapp, whatsapp_display=EXCLUDED.whatsapp_display,
			national_id_digits=EXCLUDED.national_id_digits, whatsapp_digits=EXCLUDED.whatsapp_digits, country_code=EXCLUDED.country_code,
			dial_code=EXCLUDED.dial_code, pin_hash=EXCLUDED.pin_hash,
			province=EXCLUDED.province, province_code=EXCLUDED.province_code, municipality=EXCLUDED.municipality,
			municipality_code=EXCLUDED.municipality_code, district_code=EXCLUDED.district_code, neighborhood_id=EXCLUDED.neighborhood_id,
			sector=EXCLUDED.sector, street=EXCLUDED.street, street_number=EXCLUDED.street_number, address_reference=EXCLUDED.address_reference,
			lat=EXCLUDED.lat, lng=EXCLUDED.lng, updated_at=EXCLUDED.updated_at
	`); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type globalCustomerCopySource struct {
	rows   pgx.Rows
	values []any
	err    error
}

func (source *globalCustomerCopySource) Next() bool {
	return source.err == nil && source.rows.Next()
}

func (source *globalCustomerCopySource) Values() ([]any, error) {
	var id pgtype.UUID
	var name, nationalID, whatsapp, whatsappDisplay, nationalIDDigits, whatsappDigits, countryCode, dialCode, pinHash string
	var province, provinceCode, municipality, municipalityCode, districtCode, neighborhoodID, sector, street, streetNumber, addressReference, lat, lng string
	var createdAt, updatedAt time.Time
	source.err = source.rows.Scan(
		&id, &name, &nationalID, &whatsapp, &whatsappDisplay, &nationalIDDigits, &whatsappDigits, &countryCode, &dialCode, &pinHash,
		&province, &provinceCode, &municipality, &municipalityCode, &districtCode, &neighborhoodID, &sector, &street, &streetNumber, &addressReference, &lat, &lng,
		&createdAt, &updatedAt,
	)
	if source.err != nil {
		return nil, source.err
	}
	source.values = []any{
		id, name, nationalID, whatsapp, whatsappDisplay, nationalIDDigits, whatsappDigits, countryCode, dialCode, pinHash,
		province, provinceCode, municipality, municipalityCode, districtCode, neighborhoodID, sector, street, streetNumber, addressReference, lat, lng,
		createdAt, updatedAt,
	}
	return source.values, nil
}

func (source *globalCustomerCopySource) Err() error {
	if source.err != nil {
		return source.err
	}
	return source.rows.Err()
}
