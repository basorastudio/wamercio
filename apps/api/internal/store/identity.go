package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

type VerifiedPerson struct {
	DocumentHash, DocumentMasked                       string
	FullName, GivenNames, Surnames                     string
	FirstName, SecondName, FirstSurname, SecondSurname string
	BirthDate, Sex                                     string
	NameSplitReliable                                  bool
	Source, RequestID                                  string
}

type VerifiedCompany struct {
	RNC, LegalName, TradeName, Status string
	Active                            bool
	Source, RequestID                 string
}

func (s *Store) UpsertIdentityPerson(ctx context.Context, tx pgx.Tx, p VerifiedPerson) (string, error) {
	if strings.TrimSpace(p.DocumentHash) == "" || strings.TrimSpace(p.FullName) == "" {
		return "", errors.New("identidad personal incompleta")
	}
	var id string
	err := tx.QueryRow(ctx, `INSERT INTO identity_people(document_hash,document_masked,full_name,given_names,surnames,first_name,second_name,first_surname,second_surname,birth_date,sex,name_split_reliable,source,last_request_id,verified_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,nullif($10,'')::date,$11,$12,$13,$14,now(),now())
      ON CONFLICT(document_hash) DO UPDATE SET document_masked=excluded.document_masked,full_name=excluded.full_name,given_names=excluded.given_names,surnames=excluded.surnames,first_name=excluded.first_name,second_name=excluded.second_name,first_surname=excluded.first_surname,second_surname=excluded.second_surname,birth_date=excluded.birth_date,sex=excluded.sex,name_split_reliable=excluded.name_split_reliable,source=excluded.source,last_request_id=excluded.last_request_id,verified_at=now(),updated_at=now()
      RETURNING id::text`, p.DocumentHash, p.DocumentMasked, p.FullName, p.GivenNames, p.Surnames, p.FirstName, p.SecondName, p.FirstSurname, p.SecondSurname, p.BirthDate, p.Sex, p.NameSplitReliable, p.Source, p.RequestID).Scan(&id)
	return id, err
}

func (s *Store) UpsertIdentityCompany(ctx context.Context, tx pgx.Tx, c VerifiedCompany) (string, error) {
	if strings.TrimSpace(c.RNC) == "" || strings.TrimSpace(c.LegalName) == "" {
		return "", errors.New("identidad empresarial incompleta")
	}
	var id string
	err := tx.QueryRow(ctx, `INSERT INTO identity_companies(rnc,legal_name,trade_name,status,active,source,last_request_id,verified_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())
      ON CONFLICT(rnc) DO UPDATE SET legal_name=excluded.legal_name,trade_name=excluded.trade_name,status=excluded.status,active=excluded.active,source=excluded.source,last_request_id=excluded.last_request_id,verified_at=now(),updated_at=now()
      RETURNING id::text`, c.RNC, c.LegalName, c.TradeName, c.Status, c.Active, c.Source, c.RequestID).Scan(&id)
	return id, err
}

func (s *Store) CachedIdentityPerson(ctx context.Context, documentHash string) (VerifiedPerson, bool, error) {
	var p VerifiedPerson
	err := s.DB.QueryRow(ctx, `SELECT document_hash,document_masked,full_name,coalesce(given_names,''),coalesce(surnames,''),coalesce(first_name,''),coalesce(second_name,''),coalesce(first_surname,''),coalesce(second_surname,''),coalesce(to_char(birth_date,'YYYY-MM-DD'),''),coalesce(sex,''),name_split_reliable,coalesce(source,''),coalesce(last_request_id,'') FROM identity_people WHERE document_hash=$1`, documentHash).Scan(&p.DocumentHash, &p.DocumentMasked, &p.FullName, &p.GivenNames, &p.Surnames, &p.FirstName, &p.SecondName, &p.FirstSurname, &p.SecondSurname, &p.BirthDate, &p.Sex, &p.NameSplitReliable, &p.Source, &p.RequestID)
	if errors.Is(err, pgx.ErrNoRows) {
		return VerifiedPerson{}, false, nil
	}
	return p, err == nil, err
}

type PublicCustomerInput struct {
	TenantSlug, WhatsApp, Email, Province, Municipality, Sector, Address, Reference string
	Person                                                                          VerifiedPerson
	GeoAddress                                                                      GeoAddressInput
}

type PublicCustomer struct {
	ID, Name, WhatsApp, Email, DocumentMasked, BirthDate, Sex string
	IdentityVerified                                          bool
}

func (s *Store) RegisterVerifiedCustomer(ctx context.Context, in PublicCustomerInput) (PublicCustomer, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return PublicCustomer{}, err
	}
	defer tx.Rollback(ctx)
	var tenantID string
	if err := tx.QueryRow(ctx, `SELECT id::text FROM tenants WHERE slug=$1 AND active=true`, in.TenantSlug).Scan(&tenantID); err != nil {
		return PublicCustomer{}, errors.New("negocio no encontrado")
	}
	personID, err := s.UpsertIdentityPerson(ctx, tx, in.Person)
	if err != nil {
		return PublicCustomer{}, err
	}
	var customerID string
	err = tx.QueryRow(ctx, `SELECT id::text FROM customers WHERE tenant_id=$1 AND identity_person_id=$2`, tenantID, personID).Scan(&customerID)
	if errors.Is(err, pgx.ErrNoRows) {
		var existingID, existingPerson string
		waErr := tx.QueryRow(ctx, `SELECT id::text,coalesce(identity_person_id::text,'') FROM customers WHERE tenant_id=$1 AND whatsapp=$2`, tenantID, in.WhatsApp).Scan(&existingID, &existingPerson)
		if waErr == nil {
			if existingPerson != "" && existingPerson != personID {
				return PublicCustomer{}, errors.New("este WhatsApp ya está asociado a otra identidad en el negocio")
			}
			customerID = existingID
			_, err = tx.Exec(ctx, `UPDATE customers SET identity_person_id=$3,identity_verified_at=now(),name=$4,email=nullif($5,''),province=$6,municipality=$7,sector=$8,address_line=$9,reference=$10,active=true WHERE tenant_id=$1 AND id=$2`, tenantID, customerID, personID, in.Person.FullName, in.Email, in.Province, in.Municipality, in.Sector, in.Address, in.Reference)
		} else if errors.Is(waErr, pgx.ErrNoRows) {
			err = tx.QueryRow(ctx, `INSERT INTO customers(tenant_id,identity_person_id,identity_verified_at,name,whatsapp,email,province,municipality,sector,address_line,reference,total_orders) VALUES($1,$2,now(),$3,$4,nullif($5,''),$6,$7,$8,$9,$10,0) RETURNING id::text`, tenantID, personID, in.Person.FullName, in.WhatsApp, in.Email, in.Province, in.Municipality, in.Sector, in.Address, in.Reference).Scan(&customerID)
		} else {
			err = waErr
		}
	} else if err == nil {
		_, err = tx.Exec(ctx, `UPDATE customers SET name=$3,whatsapp=$4,email=nullif($5,''),province=$6,municipality=$7,sector=$8,address_line=$9,reference=$10,identity_verified_at=now(),active=true WHERE tenant_id=$1 AND id=$2`, tenantID, customerID, in.Person.FullName, in.WhatsApp, in.Email, in.Province, in.Municipality, in.Sector, in.Address, in.Reference)
	}
	if err != nil {
		return PublicCustomer{}, err
	}
	if in.GeoAddress.ProvinceCode != "" {
		if err := s.UpsertCustomerGeoAddress(ctx, tx, customerID, in.GeoAddress); err != nil {
			return PublicCustomer{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return PublicCustomer{}, err
	}
	return PublicCustomer{ID: customerID, Name: in.Person.FullName, WhatsApp: in.WhatsApp, Email: in.Email, DocumentMasked: in.Person.DocumentMasked, BirthDate: in.Person.BirthDate, Sex: in.Person.Sex, IdentityVerified: true}, nil
}
