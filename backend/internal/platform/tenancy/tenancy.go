package tenancy

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"wamercio/backend/internal/config"
	"wamercio/backend/internal/platform/database"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/singleflight"
)

var slugPattern = regexp.MustCompile(`[^a-z0-9-]+`)

var latinSlugReplacer = strings.NewReplacer(
	"á", "a", "à", "a", "ä", "a", "â", "a", "ã", "a",
	"é", "e", "è", "e", "ë", "e", "ê", "e",
	"í", "i", "ì", "i", "ï", "i", "î", "i",
	"ó", "o", "ò", "o", "ö", "o", "ô", "o", "õ", "o",
	"ú", "u", "ù", "u", "ü", "u", "û", "u",
	"ñ", "n", "ç", "c",
	"Á", "a", "À", "a", "Ä", "a", "Â", "a", "Ã", "a",
	"É", "e", "È", "e", "Ë", "e", "Ê", "e",
	"Í", "i", "Ì", "i", "Ï", "i", "Î", "i",
	"Ó", "o", "Ò", "o", "Ö", "o", "Ô", "o", "Õ", "o",
	"Ú", "u", "Ù", "u", "Ü", "u", "Û", "u",
	"Ñ", "n", "Ç", "c",
)

type Tenant struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	Status       string    `json:"status"`
	PlanSlug     string    `json:"plan_slug"`
	Domain       string    `json:"domain"`
	DatabaseName string    `json:"database_name,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type tenantPool struct {
	tenant     Tenant
	pool       *pgxpool.Pool
	lastUsedAt time.Time
}

type PoolStats struct {
	ActivePools       int           `json:"activeTenantPools"`
	MaxPools          int           `json:"maxActiveTenantPools"`
	TenantMaxConns    int           `json:"tenantMaxConns"`
	TenantMinConns    int           `json:"tenantMinConns"`
	TTLMinutes        int           `json:"tenantPoolTtlMinutes"`
	TotalConns        int64         `json:"totalConnections"`
	AcquiredConns     int64         `json:"acquiredConnections"`
	IdleConns         int64         `json:"idleConnections"`
	EmptyAcquireCount int64         `json:"emptyAcquireCount"`
	AcquireDuration   time.Duration `json:"acquireDuration"`
}

type Manager struct {
	cfg           config.Config
	coreDB        *pgxpool.Pool
	mu            sync.RWMutex
	pools         map[string]*tenantPool
	byHost        map[string]Tenant
	bySlug        map[string]Tenant
	poolGroup     singleflight.Group
	lifecycleMu   sync.Mutex
	cleanerCancel context.CancelFunc
	cleanerDone   chan struct{}
	openingPools  int
}

func NewManager(cfg config.Config, coreDB *pgxpool.Pool) *Manager {
	return &Manager{cfg: cfg, coreDB: coreDB, pools: map[string]*tenantPool{}, byHost: map[string]Tenant{}, bySlug: map[string]Tenant{}}
}

func (m *Manager) CoreDB() *pgxpool.Pool { return m.coreDB }

func (m *Manager) EnsureProvisioningAuditBackfill(ctx context.Context) error {
	if m == nil || m.coreDB == nil {
		return nil
	}
	_, err := m.coreDB.Exec(ctx, `
		INSERT INTO platform_audit_logs (tenant_id, actor, action, details)
		SELECT t.id,
		       'system',
		       'tenant.create.recovered',
		       jsonb_build_object(
			   'name', t.name,
			   'slug', t.slug,
			   'domain', COALESCE(d.domain, ''),
			   'plan_slug', t.plan_slug,
			   'owner_id', COALESCE(t.owner_id::text, ''),
			   'recovered', true
		       )
		FROM tenants t
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		WHERE NOT EXISTS (
			SELECT 1
			FROM platform_audit_logs l
			WHERE l.tenant_id=t.id
			  AND l.action IN ('tenant.create','tenant.owner_create','tenant.create.recovered')
		)
	`)
	return err
}

func NormalizeSlug(value string) string {
	value = latinSlugReplacer.Replace(strings.TrimSpace(value))
	value = strings.ToLower(value)
	value = strings.ReplaceAll(value, "_", "-")
	value = slugPattern.ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if value == "" {
		return ""
	}
	if len(value) > 48 {
		value = strings.Trim(value[:48], "-")
	}
	return value
}

func CompactSlug(value string) string {
	return strings.ReplaceAll(NormalizeSlug(value), "-", "")
}

func initialsFromWords(value string) string {
	parts := strings.Split(NormalizeSlug(value), "-")
	initials := strings.Builder{}
	for _, part := range parts {
		if part == "" {
			continue
		}
		initials.WriteByte(part[0])
	}
	return initials.String()
}

func buildBusinessDisplayName(typeName, businessName string) string {
	typeName = strings.TrimSpace(typeName)
	businessName = strings.TrimSpace(businessName)
	if typeName == "" {
		return businessName
	}
	if businessName == "" {
		return typeName
	}
	if strings.HasPrefix(strings.ToLower(businessName), strings.ToLower(typeName)) {
		return businessName
	}
	return strings.TrimSpace(typeName + " " + businessName)
}

func BuildTenantSlug(typeName, businessName, province, municipality, neighborhood string) string {
	base := CompactSlug(buildBusinessDisplayName(typeName, businessName))
	if base == "" {
		base = CompactSlug(businessName)
	}
	if base == "" {
		return ""
	}
	locationCode := CompactSlug(initialsFromWords(province) + initialsFromWords(municipality) + initialsFromWords(neighborhood))
	if locationCode == "" {
		if len(base) > 48 {
			return base[:48]
		}
		return base
	}
	maxBase := 48 - len(locationCode) - 1
	if maxBase < 8 {
		maxBase = 8
	}
	if len(base) > maxBase {
		base = base[:maxBase]
	}
	return strings.Trim(NormalizeSlug(base+"-"+locationCode), "-")
}

func (m *Manager) uniqueTenantSlug(ctx context.Context, base string) (string, error) {
	return m.uniqueTenantSlugExcluding(ctx, base, "")
}

func (m *Manager) uniqueTenantSlugExcluding(ctx context.Context, base, tenantID string) (string, error) {
	base = NormalizeSlug(base)
	if base == "" {
		base = "business"
	}
	rootDomain := normalizeHost(m.cfg.RootDomain)
	for i := 0; i < 100; i++ {
		candidate := base
		if i > 0 {
			suffix := fmt.Sprintf("-%d", i+1)
			maxBase := 48 - len(suffix)
			if maxBase < 8 {
				maxBase = 8
			}
			trimmed := base
			if len(trimmed) > maxBase {
				trimmed = strings.Trim(trimmed[:maxBase], "-")
			}
			candidate = NormalizeSlug(trimmed + suffix)
		}
		domainCandidate := ""
		if rootDomain != "" {
			domainCandidate = candidate + "." + rootDomain
		}
		var exists bool
		err := m.coreDB.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM tenants WHERE slug=$1 AND ($2='' OR id::text<>$2)
				UNION ALL
				SELECT 1 FROM tenant_domains WHERE $3<>'' AND domain=$3 AND ($2='' OR tenant_id::text<>$2)
			)
		`, candidate, tenantID, domainCandidate).Scan(&exists)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("no se pudo generar un subdominio disponible para %s", base)
}

func DatabaseName(prefix, slug string) string {
	safe := strings.ReplaceAll(NormalizeSlug(slug), "-", "_")
	if len(prefix) > 40 {
		prefix = prefix[:40]
	}
	name := prefix + safe
	if len(name) <= 60 {
		return name
	}
	sum := sha1.Sum([]byte(name))
	digest := hex.EncodeToString(sum[:])[:8]
	maxSafe := 60 - len(prefix) - len(digest) - 1
	if maxSafe < 8 {
		maxSafe = 8
	}
	if len(safe) > maxSafe {
		safe = safe[:maxSafe]
	}
	return prefix + safe + "_" + digest
}

func onlyTenantDigits(value string) string {
	b := strings.Builder{}
	for _, r := range value {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func databaseTypePart(value string) string {
	typePart := CompactSlug(value)
	if typePart == "" {
		typePart = "business"
	}
	if len(typePart) > 24 {
		typePart = typePart[:24]
	}
	return typePart
}

func databaseSequenceLetters(index int) string {
	if index < 0 {
		index = 0
	}
	letters := "abcdefghijklmnopqrstuvwxyz"
	result := ""
	for {
		result = string(letters[index%26]) + result
		index = index/26 - 1
		if index < 0 {
			break
		}
	}
	return result
}

func businessDatabaseOwnerPrefix(ownerNationalID string) (string, error) {
	nationalIDDigits := onlyTenantDigits(ownerNationalID)
	if len(nationalIDDigits) != 11 {
		return "", fmt.Errorf("el propietario debe tener una cédula dominicana válida para generar la base de datos del negocio")
	}
	return "cp_" + nationalIDDigits + "_", nil
}

func businessDatabaseLocationCode(province, municipality, neighborhood string) (string, error) {
	code := CompactSlug(initialsFromWords(province) + initialsFromWords(municipality) + initialsFromWords(neighborhood))
	if code == "" {
		return "", fmt.Errorf("selecciona provincia, municipio/distrito y barrio para generar la base de datos del negocio")
	}
	if len(code) > 18 {
		code = code[:18]
	}
	return code, nil
}

func businessDatabaseName(prefix string, sequenceIndex int, locationCode string) string {
	return prefix + databaseSequenceLetters(sequenceIndex) + "_" + locationCode
}

func databaseSequenceFromName(name, prefix string) string {
	if !strings.HasPrefix(name, prefix) {
		return ""
	}
	rest := strings.TrimPrefix(name, prefix)
	if rest == "" {
		return ""
	}
	seq := strings.Split(rest, "_")[0]
	if seq == "" {
		return ""
	}
	for _, r := range seq {
		if r < 'a' || r > 'z' {
			return ""
		}
	}
	return seq
}

func (m *Manager) nextBusinessDatabaseName(ctx context.Context, ownerNationalID, province, municipality, neighborhood, tenantID string) (string, error) {
	prefix, err := businessDatabaseOwnerPrefix(ownerNationalID)
	if err != nil {
		return "", err
	}
	locationCode, err := businessDatabaseLocationCode(province, municipality, neighborhood)
	if err != nil {
		return "", err
	}
	usedSequences := map[string]bool{}
	rows, err := m.coreDB.Query(ctx, `
		SELECT database_name
		FROM tenant_databases
		WHERE database_name LIKE $1
		  AND ($2='' OR tenant_id::text<>$2)
	`, prefix+"%", tenantID)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return "", err
		}
		if seq := databaseSequenceFromName(name, prefix); seq != "" {
			usedSequences[seq] = true
		}
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	for i := 0; i < 702; i++ {
		seq := databaseSequenceLetters(i)
		candidate := businessDatabaseName(prefix, i, locationCode)
		if !safeDBName(candidate) {
			continue
		}
		if !usedSequences[seq] {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("no se pudo generar un nombre de base disponible para %s", strings.TrimSuffix(prefix, "_"))
}

func (m *Manager) RepairGeneratedSubdomains(ctx context.Context) error {
	rootDomain := normalizeHost(m.cfg.RootDomain)
	if rootDomain == "" {
		return nil
	}
	rows, err := m.coreDB.Query(ctx, `
		SELECT t.id::text, t.slug, COALESCE(t.metadata, '{}'::jsonb)::text
		FROM tenants t
		WHERE t.metadata ? 'business_type_name'
		   OR t.metadata ? 'business_name'
		   OR t.metadata ? 'province'
		   OR t.metadata ? 'municipality'
		   OR t.metadata ? 'neighborhood'
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type tenantMeta struct {
		BusinessName     string `json:"business_name"`
		BusinessTypeName string `json:"business_type_name"`
		Province         string `json:"province"`
		Municipality     string `json:"municipality"`
		Neighborhood     string `json:"neighborhood"`
	}

	type repairItem struct {
		ID          string
		CurrentSlug string
		DesiredSlug string
		Domain      string
	}

	items := []repairItem{}
	for rows.Next() {
		var id, currentSlug, raw string
		if err := rows.Scan(&id, &currentSlug, &raw); err != nil {
			return err
		}
		var meta tenantMeta
		if err := json.Unmarshal([]byte(raw), &meta); err != nil {
			continue
		}
		if strings.TrimSpace(meta.BusinessTypeName) == "" || strings.TrimSpace(meta.BusinessName) == "" {
			continue
		}
		if strings.TrimSpace(meta.Province) == "" || strings.TrimSpace(meta.Municipality) == "" || strings.TrimSpace(meta.Neighborhood) == "" {
			continue
		}
		desiredBase := BuildTenantSlug(meta.BusinessTypeName, meta.BusinessName, meta.Province, meta.Municipality, meta.Neighborhood)
		if desiredBase == "" {
			continue
		}
		currentNormalizedSlug := NormalizeSlug(currentSlug)
		desiredSlug := currentNormalizedSlug
		if desiredBase != currentNormalizedSlug {
			desiredSlug, err = m.uniqueTenantSlugExcluding(ctx, desiredBase, id)
			if err != nil {
				return err
			}
		}
		if desiredSlug == "" {
			continue
		}
		expectedDomain := desiredSlug + "." + rootDomain
		var unexpectedSubdomains int64
		if err := m.coreDB.QueryRow(ctx, `
			SELECT count(*)
			FROM tenant_domains
			WHERE tenant_id=$1::uuid AND type='subdomain' AND domain<>$2
		`, id, expectedDomain).Scan(&unexpectedSubdomains); err != nil {
			return err
		}
		var desiredDomainReady bool
		if err := m.coreDB.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM tenant_domains
				WHERE tenant_id=$1::uuid AND type='subdomain' AND domain=$2 AND is_primary=true
			)
		`, id, expectedDomain).Scan(&desiredDomainReady); err != nil {
			return err
		}
		if desiredSlug == currentNormalizedSlug && unexpectedSubdomains == 0 && desiredDomainReady {
			continue
		}
		items = append(items, repairItem{ID: id, CurrentSlug: currentSlug, DesiredSlug: desiredSlug, Domain: expectedDomain})
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(items) == 0 {
		return nil
	}

	tx, err := m.coreDB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, item := range items {
		if _, err := tx.Exec(ctx, `UPDATE tenants SET slug=$2, updated_at=now() WHERE id=$1::uuid`, item.ID, item.DesiredSlug); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `DELETE FROM tenant_domains WHERE tenant_id=$1::uuid AND type='subdomain' AND domain<>$2`, item.ID, item.Domain); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE tenant_domains SET is_primary=false WHERE tenant_id=$1::uuid`, item.ID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO tenant_domains (tenant_id, domain, type, is_primary, verified_at)
			VALUES ($1::uuid, $2, 'subdomain', true, now())
			ON CONFLICT (domain) DO UPDATE
			SET tenant_id=EXCLUDED.tenant_id, type='subdomain', is_primary=true, verified_at=COALESCE(tenant_domains.verified_at, now())
			WHERE tenant_domains.tenant_id=EXCLUDED.tenant_id
		`, item.ID, item.Domain); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	m.mu.Lock()
	m.byHost = map[string]Tenant{}
	m.bySlug = map[string]Tenant{}
	m.mu.Unlock()
	return nil
}

func (m *Manager) RepairGeneratedDatabaseNames(ctx context.Context) error {
	rows, err := m.coreDB.Query(ctx, `
		SELECT t.id::text,
		       t.created_at,
		       COALESCE(o.national_id_digits, ''),
		       COALESCE(db.database_name, ''),
		       COALESCE(t.metadata->>'province', ''),
		       COALESCE(t.metadata->>'municipality', ''),
		       COALESCE(t.metadata->>'neighborhood', '')
		FROM tenants t
		LEFT JOIN platform_owners o ON o.id=t.owner_id
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
		WHERE t.owner_id IS NOT NULL
		ORDER BY COALESCE(o.national_id_digits, ''), t.created_at, t.id
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type dbRepairItem struct {
		TenantID     string
		CurrentName  string
		DesiredName  string
		CreatedAt    time.Time
		GroupPrefix  string
		LocationCode string
	}

	groups := map[string][]dbRepairItem{}
	for rows.Next() {
		var item dbRepairItem
		var ownerNationalID, province, municipality, neighborhood string
		if err := rows.Scan(&item.TenantID, &item.CreatedAt, &ownerNationalID, &item.CurrentName, &province, &municipality, &neighborhood); err != nil {
			return err
		}
		prefix, err := businessDatabaseOwnerPrefix(ownerNationalID)
		if err != nil {
			continue
		}
		locationCode, err := businessDatabaseLocationCode(province, municipality, neighborhood)
		if err != nil {
			continue
		}
		item.GroupPrefix = prefix
		item.LocationCode = locationCode
		groups[prefix] = append(groups[prefix], item)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	items := []dbRepairItem{}
	for _, group := range groups {
		for i := range group {
			group[i].DesiredName = businessDatabaseName(group[i].GroupPrefix, i, group[i].LocationCode)
			if !safeDBName(group[i].DesiredName) || group[i].CurrentName == group[i].DesiredName {
				continue
			}
			items = append(items, group[i])
		}
	}
	if len(items) == 0 {
		return nil
	}

	for _, item := range items {
		var usedByOther bool
		if err := m.coreDB.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM tenant_databases
				WHERE database_name=$1 AND tenant_id::text<>$2
			)
		`, item.DesiredName, item.TenantID).Scan(&usedByOther); err != nil {
			return err
		}
		if usedByOther {
			return fmt.Errorf("la base de datos %s ya está asignada a otro negocio", item.DesiredName)
		}

		if strings.TrimSpace(item.CurrentName) != "" && item.CurrentName != item.DesiredName {
			currentExists, err := m.databaseExists(ctx, item.CurrentName)
			if err != nil {
				return err
			}
			desiredExists, err := m.databaseExists(ctx, item.DesiredName)
			if err != nil {
				return err
			}
			if currentExists && !desiredExists {
				if !safeDBName(item.CurrentName) || !safeDBName(item.DesiredName) {
					return fmt.Errorf("nombre de base inseguro al renombrar %s a %s", item.CurrentName, item.DesiredName)
				}
				if _, err := m.coreDB.Exec(ctx, `ALTER DATABASE `+quoteIdent(item.CurrentName)+` RENAME TO `+quoteIdent(item.DesiredName)); err != nil {
					return err
				}
			}
		}

		if err := m.ensureDatabase(ctx, item.DesiredName); err != nil {
			return err
		}
		if strings.TrimSpace(m.cfg.TenantMigrationsPath) != "" {
			if err := database.RunMigrations(ctx, m.cfg.TenantMigrationsPath, m.tenantDatabaseURL(item.DesiredName)); err != nil {
				return fmt.Errorf("migraciones tenant %s: %w", item.DesiredName, err)
			}
		}
		if _, err := m.coreDB.Exec(ctx, `
			INSERT INTO tenant_databases (tenant_id, database_name, status)
			VALUES ($1::uuid, $2, 'ready')
			ON CONFLICT (tenant_id) DO UPDATE
			SET database_name=EXCLUDED.database_name, status='ready', updated_at=now()
		`, item.TenantID, item.DesiredName); err != nil {
			return err
		}
	}

	m.mu.Lock()
	for key, entry := range m.pools {
		entry.pool.Close()
		delete(m.pools, key)
	}
	m.mu.Unlock()
	return nil
}

func (m *Manager) EnsureDefaultTenant(ctx context.Context) (Tenant, error) {
	slug := NormalizeSlug(m.cfg.DefaultTenantSlug)
	domain := strings.TrimSpace(m.cfg.DefaultTenantDomain)
	if domain == "" && strings.TrimSpace(m.cfg.RootDomain) != "" {
		domain = slug + "." + strings.TrimSpace(m.cfg.RootDomain)
	}
	name := strings.TrimSpace(m.cfg.DefaultTenantName)
	if name == "" {
		name = "Mi Negocio"
	}
	return m.ProvisionTenant(ctx, TenantProvisionInput{Name: name, Slug: slug, Domain: domain, PlanSlug: "starter"})
}

type TenantProvisionInput struct {
	ProvisioningKey    string   `json:"-"`
	Name               string   `json:"name"`
	BusinessName       string   `json:"business_name"`
	BusinessTypeID     string   `json:"business_type_id"`
	BusinessTypeName   string   `json:"business_type_name"`
	BusinessTypeSlug   string   `json:"business_type_slug"`
	RNC                string   `json:"rnc"`
	LegalName          string   `json:"legal_name"`
	CommercialName     string   `json:"commercial_name"`
	IdentityConfirmed  bool     `json:"identity_confirmed"`
	IdentityStatus     string   `json:"-"`
	IdentitySource     string   `json:"-"`
	IdentityRequestID  string   `json:"-"`
	IdentityVerifiedAt string   `json:"-"`
	Slug               string   `json:"slug"`
	Domain             string   `json:"domain"`
	PlanSlug           string   `json:"plan_slug"`
	OwnerName          string   `json:"owner_name"`
	OwnerWhatsapp      string   `json:"owner_whatsapp"`
	OwnerID            string   `json:"owner_id"`
	Province           string   `json:"province"`
	ProvinceCode       string   `json:"province_code"`
	Municipality       string   `json:"municipality"`
	MunicipalityCode   string   `json:"municipality_code"`
	DistrictCode       string   `json:"district_code"`
	Neighborhood       string   `json:"neighborhood"`
	NeighborhoodID     string   `json:"neighborhood_id"`
	Street             string   `json:"street"`
	Number             string   `json:"street_number"`
	Address            string   `json:"address"`
	Latitude           *float64 `json:"latitude"`
	Longitude          *float64 `json:"longitude"`
	LocationAccuracy   *float64 `json:"location_accuracy"`
	LocationSource     string   `json:"location_source"`
	AdminUsername      string   `json:"admin_username"`
	AdminPassword      string   `json:"admin_password"`
	AdminName          string   `json:"admin_name"`
	AdminLastName      string   `json:"admin_last_name"`
	AdminNationalID    string   `json:"admin_cedula"`
	AdminWhatsapp      string   `json:"admin_whatsapp"`
}

type TenantStatusUpdate struct {
	Status string `json:"status"`
}

func (m *Manager) ProvisionTenant(ctx context.Context, input TenantProvisionInput) (Tenant, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = "Mi Negocio"
	}
	businessTypeName := strings.TrimSpace(input.BusinessTypeName)
	businessName := strings.TrimSpace(input.BusinessName)
	if businessName == "" {
		businessName = name
	}
	if businessTypeName != "" {
		name = buildBusinessDisplayName(businessTypeName, businessName)
	}
	baseSlug := BuildTenantSlug(businessTypeName, businessName, input.Province, input.Municipality, input.Neighborhood)
	if baseSlug == "" {
		baseSlug = NormalizeSlug(firstNonEmpty(input.Slug, name))
	}
	slug, err := m.uniqueTenantSlug(ctx, baseSlug)
	if err != nil {
		return Tenant{}, err
	}
	plan := strings.TrimSpace(input.PlanSlug)
	if plan == "" {
		plan = "starter"
	}
	ownerID := strings.TrimSpace(input.OwnerID)
	ownerName := strings.TrimSpace(input.OwnerName)
	ownerWhatsapp := strings.TrimSpace(input.OwnerWhatsapp)
	ownerNationalID := onlyTenantDigits(input.AdminNationalID)
	if ownerID != "" {
		_ = m.coreDB.QueryRow(ctx, `
			SELECT COALESCE(NULLIF(name,''), trim(first_name || ' ' || last_name)), whatsapp, national_id_digits
			FROM platform_owners WHERE id=$1::uuid LIMIT 1
		`, ownerID).Scan(&ownerName, &ownerWhatsapp, &ownerNationalID)
	}
	rootDomain := normalizeHost(m.cfg.RootDomain)
	domain := ""
	if rootDomain != "" {
		domain = slug + "." + rootDomain
	} else {
		domain = normalizeHost(input.Domain)
	}
	metadata := map[string]any{
		"business_name":                strings.TrimSpace(input.BusinessName),
		"business_type_id":             strings.TrimSpace(input.BusinessTypeID),
		"business_type_name":           strings.TrimSpace(input.BusinessTypeName),
		"business_type_slug":           strings.TrimSpace(input.BusinessTypeSlug),
		"rnc":                          onlyTenantDigits(input.RNC),
		"legal_name":                   strings.TrimSpace(input.LegalName),
		"commercial_name":              strings.TrimSpace(input.CommercialName),
		"identity_verification_status": strings.TrimSpace(input.IdentityStatus),
		"identity_source":              strings.TrimSpace(input.IdentitySource),
		"identity_request_id":          strings.TrimSpace(input.IdentityRequestID),
		"identity_verified_at":         strings.TrimSpace(input.IdentityVerifiedAt),
		"identity_confirmed_by_user":   input.IdentityConfirmed,
		"province":                     strings.TrimSpace(input.Province),
		"province_code":                strings.TrimSpace(input.ProvinceCode),
		"municipality":                 strings.TrimSpace(input.Municipality),
		"municipality_code":            strings.TrimSpace(input.MunicipalityCode),
		"district_code":                strings.TrimSpace(input.DistrictCode),
		"neighborhood":                 strings.TrimSpace(input.Neighborhood),
		"neighborhood_id":              strings.TrimSpace(input.NeighborhoodID),
		"street":                       strings.TrimSpace(input.Street),
		"street_number":                strings.TrimSpace(input.Number),
		"address":                      strings.TrimSpace(input.Address),
		"delivery_scope":               "municipal",
	}
	metadataJSON, _ := json.Marshal(metadata)
	dbName, err := m.nextBusinessDatabaseName(ctx, ownerNationalID, input.Province, input.Municipality, input.Neighborhood, "")
	if err != nil {
		return Tenant{}, err
	}

	if err := m.resetUnassignedDatabase(ctx, dbName); err != nil {
		return Tenant{}, err
	}
	if err := m.ensureDatabase(ctx, dbName); err != nil {
		return Tenant{}, err
	}
	if err := m.markProvisioningStage(ctx, ownerID, input.ProvisioningKey, "database_created"); err != nil {
		return Tenant{}, err
	}
	if strings.TrimSpace(m.cfg.TenantMigrationsPath) != "" {
		if err := database.RunMigrations(ctx, m.cfg.TenantMigrationsPath, m.tenantDatabaseURL(dbName)); err != nil {
			return Tenant{}, fmt.Errorf("migraciones tenant %s: %w", slug, err)
		}
	}
	if err := m.markProvisioningStage(ctx, ownerID, input.ProvisioningKey, "migrations_applied"); err != nil {
		return Tenant{}, err
	}

	var tenant Tenant
	err = m.coreDB.QueryRow(ctx, `
		WITH upsert_tenant AS (
			INSERT INTO tenants (name, slug, status, plan_slug, owner_id, owner_name, owner_whatsapp, metadata)
			VALUES ($1,$2,'active',$3,NULLIF($4,'')::uuid,$5,$6,$9::jsonb)
			ON CONFLICT (slug) DO UPDATE
			SET name=EXCLUDED.name, plan_slug=EXCLUDED.plan_slug, owner_id=EXCLUDED.owner_id, owner_name=EXCLUDED.owner_name, owner_whatsapp=EXCLUDED.owner_whatsapp, metadata=EXCLUDED.metadata, updated_at=now()
			RETURNING id::text, name, slug, status, plan_slug, created_at
		), upsert_db AS (
			INSERT INTO tenant_databases (tenant_id, database_name, status)
			SELECT id::uuid, $7, 'ready' FROM upsert_tenant
			ON CONFLICT (tenant_id) DO UPDATE SET database_name=EXCLUDED.database_name, status='ready', updated_at=now()
			RETURNING tenant_id, database_name
		), upsert_domain AS (
			INSERT INTO tenant_domains (tenant_id, domain, type, is_primary, verified_at)
			SELECT id::uuid, NULLIF($8,''), CASE WHEN NULLIF($8,'') IS NULL THEN 'subdomain' ELSE 'subdomain' END, true, now() FROM upsert_tenant WHERE NULLIF($8,'') IS NOT NULL
			ON CONFLICT (domain) DO UPDATE SET tenant_id=EXCLUDED.tenant_id, is_primary=true, verified_at=COALESCE(tenant_domains.verified_at, now())
			RETURNING domain
		), mark_provisioning AS (
			UPDATE tenant_provisioning_requests
			SET tenant_id=(SELECT id::uuid FROM upsert_tenant), stage='tenant_registered',
			    stage_history=CASE WHEN stage='tenant_registered' THEN stage_history ELSE stage_history || jsonb_build_array('tenant_registered') END,
			    lease_expires_at=now() + interval '10 minutes', updated_at=now()
			WHERE owner_id=NULLIF($4,'')::uuid AND idempotency_key=NULLIF($10,'')
			RETURNING tenant_id
		)
		SELECT t.id, t.name, t.slug, t.status, t.plan_slug, COALESCE((SELECT domain FROM upsert_domain LIMIT 1), $8), d.database_name, t.created_at
		FROM upsert_tenant t JOIN upsert_db d ON d.tenant_id=t.id::uuid
	`, name, slug, plan, ownerID, ownerName, ownerWhatsapp, dbName, domain, string(metadataJSON), strings.TrimSpace(input.ProvisioningKey)).Scan(&tenant.ID, &tenant.Name, &tenant.Slug, &tenant.Status, &tenant.PlanSlug, &tenant.Domain, &tenant.DatabaseName, &tenant.CreatedAt)
	if err != nil {
		return Tenant{}, err
	}
	if err := m.markProvisioningStage(ctx, ownerID, input.ProvisioningKey, "domain_configured"); err != nil {
		return Tenant{}, err
	}

	if strings.TrimSpace(tenant.Domain) != "" {
		_, _ = m.coreDB.Exec(ctx, `DELETE FROM tenant_domains WHERE tenant_id=$1::uuid AND type='subdomain' AND domain<>$2`, tenant.ID, tenant.Domain)
		_, _ = m.coreDB.Exec(ctx, `UPDATE tenant_domains SET is_primary=false WHERE tenant_id=$1::uuid AND domain<>$2`, tenant.ID, tenant.Domain)
		_, _ = m.coreDB.Exec(ctx, `UPDATE tenant_domains SET is_primary=true, type='subdomain', verified_at=COALESCE(verified_at, now()) WHERE tenant_id=$1::uuid AND domain=$2`, tenant.ID, tenant.Domain)
	}

	_, _ = m.coreDB.Exec(ctx, `
		INSERT INTO subscriptions (tenant_id, plan_slug, status, billing_period)
		SELECT $1::uuid, $2, 'active', 'monthly'
		WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE tenant_id=$1::uuid)
	`, tenant.ID, tenant.PlanSlug)
	_, _ = m.coreDB.Exec(ctx, `
		UPDATE subscriptions SET plan_slug=$2, updated_at=now()
		WHERE id=(SELECT id FROM subscriptions WHERE tenant_id=$1::uuid ORDER BY created_at DESC LIMIT 1)
	`, tenant.ID, tenant.PlanSlug)
	m.remember(tenant)
	return tenant, nil
}

func (m *Manager) markProvisioningStage(ctx context.Context, ownerID, key, stage string) error {
	ownerID = strings.TrimSpace(ownerID)
	key = strings.TrimSpace(key)
	stage = strings.TrimSpace(stage)
	if ownerID == "" || key == "" || stage == "" {
		return nil
	}
	result, err := m.coreDB.Exec(ctx, `
		UPDATE tenant_provisioning_requests
		SET stage=$3,
		    stage_history=CASE WHEN stage=$3 THEN stage_history ELSE stage_history || jsonb_build_array($3) END,
		    lease_expires_at=now() + interval '10 minutes', updated_at=now()
		WHERE owner_id=$1::uuid AND idempotency_key=$2
	`, ownerID, key, stage)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("tenant provisioning request was not found")
	}
	return nil
}

func (m *Manager) ListTenants(ctx context.Context) ([]Tenant, error) {
	rows, err := m.coreDB.Query(ctx, `
		SELECT t.id::text, t.name, t.slug, t.status, t.plan_slug, COALESCE(d.domain,''), COALESCE(db.database_name,''), t.created_at
		FROM tenants t
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
		ORDER BY t.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Tenant{}
	for rows.Next() {
		var t Tenant
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.Status, &t.PlanSlug, &t.Domain, &t.DatabaseName, &t.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, t)
		m.remember(t)
	}
	return items, rows.Err()
}

func (m *Manager) UpdateTenantStatus(ctx context.Context, tenantID, status string) (Tenant, error) {
	status = strings.ToLower(strings.TrimSpace(status))
	switch status {
	case "active", "trial", "suspended", "disabled", "provisioning":
	default:
		return Tenant{}, fmt.Errorf("estado de tenant inválido: %s", status)
	}
	var tenant Tenant
	err := m.coreDB.QueryRow(ctx, `
		UPDATE tenants SET status=$2, updated_at=now() WHERE id=$1::uuid
		RETURNING id::text, name, slug, status, plan_slug, created_at
	`, tenantID, status).Scan(&tenant.ID, &tenant.Name, &tenant.Slug, &tenant.Status, &tenant.PlanSlug, &tenant.CreatedAt)
	if err != nil {
		return Tenant{}, err
	}
	_ = m.coreDB.QueryRow(ctx, `
		SELECT COALESCE(d.domain,''), COALESCE(db.database_name,'')
		FROM tenants t
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
		WHERE t.id=$1::uuid
	`, tenantID).Scan(&tenant.Domain, &tenant.DatabaseName)
	m.remember(tenant)
	return tenant, nil
}

func (m *Manager) DeleteTenant(ctx context.Context, tenantID string) (Tenant, error) {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return Tenant{}, fmt.Errorf("tenant requerido")
	}
	var tenant Tenant
	err := m.coreDB.QueryRow(ctx, `
		SELECT t.id::text, t.name, t.slug, t.status, t.plan_slug, COALESCE(d.domain,''), COALESCE(db.database_name,''), t.created_at
		FROM tenants t
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
		WHERE t.id=$1::uuid
		LIMIT 1
	`, tenantID).Scan(&tenant.ID, &tenant.Name, &tenant.Slug, &tenant.Status, &tenant.PlanSlug, &tenant.Domain, &tenant.DatabaseName, &tenant.CreatedAt)
	if err != nil {
		return Tenant{}, err
	}

	m.forgetTenant(tenant)
	if strings.TrimSpace(tenant.DatabaseName) != "" {
		if err := m.dropTenantDatabase(ctx, tenant.DatabaseName); err != nil {
			return Tenant{}, err
		}
	}

	if _, err := m.coreDB.Exec(ctx, `DELETE FROM tenants WHERE id=$1::uuid`, tenant.ID); err != nil {
		return Tenant{}, err
	}
	return tenant, nil
}

func (m *Manager) forgetTenant(tenant Tenant) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if entry := m.pools[tenant.ID]; entry != nil {
		entry.pool.Close()
		delete(m.pools, tenant.ID)
	}
	if tenant.Domain != "" {
		delete(m.byHost, normalizeHost(tenant.Domain))
	}
	if tenant.Slug != "" {
		delete(m.bySlug, NormalizeSlug(tenant.Slug))
	}
	m.poolGroup.Forget(tenant.ID)
}

func (m *Manager) resetUnassignedDatabase(ctx context.Context, databaseName string) error {
	databaseName = strings.TrimSpace(databaseName)
	if databaseName == "" {
		return nil
	}
	if !safeDBName(databaseName) {
		return fmt.Errorf("nombre de base de datos inseguro: %s", databaseName)
	}
	if m.protectedDatabaseName(databaseName) {
		return fmt.Errorf("la base de datos %s está protegida y no puede usarse como base de negocio", databaseName)
	}
	var assigned bool
	if err := m.coreDB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tenant_databases WHERE database_name=$1)`, databaseName).Scan(&assigned); err != nil {
		return err
	}
	if assigned {
		return nil
	}
	exists, err := m.databaseExists(ctx, databaseName)
	if err != nil || !exists {
		return err
	}
	return m.dropTenantDatabase(ctx, databaseName)
}

func (m *Manager) dropTenantDatabase(ctx context.Context, databaseName string) error {
	databaseName = strings.TrimSpace(databaseName)
	if databaseName == "" {
		return nil
	}
	if !safeDBName(databaseName) {
		return fmt.Errorf("nombre de base de datos inseguro: %s", databaseName)
	}
	if m.protectedDatabaseName(databaseName) {
		return fmt.Errorf("la base de datos %s está protegida y no se puede eliminar como tenant", databaseName)
	}
	exists, err := m.databaseExists(ctx, databaseName)
	if err != nil || !exists {
		return err
	}
	m.terminateDatabaseConnections(ctx, databaseName)
	if _, err := m.coreDB.Exec(ctx, `DROP DATABASE IF EXISTS `+quoteIdent(databaseName)+` WITH (FORCE)`); err == nil {
		return nil
	} else {
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "42601" {
			m.terminateDatabaseConnections(ctx, databaseName)
			if _, retryErr := m.coreDB.Exec(ctx, `DROP DATABASE IF EXISTS `+quoteIdent(databaseName)); retryErr == nil {
				return nil
			}
			return err
		}
	}
	m.terminateDatabaseConnections(ctx, databaseName)
	_, err = m.coreDB.Exec(ctx, `DROP DATABASE IF EXISTS `+quoteIdent(databaseName))
	return err
}

func (m *Manager) terminateDatabaseConnections(ctx context.Context, databaseName string) {
	_, _ = m.coreDB.Exec(ctx, `
		SELECT pg_terminate_backend(pid)
		FROM pg_stat_activity
		WHERE datname=$1 AND pid <> pg_backend_pid()
	`, databaseName)
}

func (m *Manager) protectedDatabaseName(databaseName string) bool {
	databaseName = strings.TrimSpace(databaseName)
	if databaseName == "" {
		return true
	}
	protected := map[string]bool{"postgres": true, "template0": true, "template1": true}
	for _, databaseURL := range []string{m.cfg.CentralDatabaseURL, m.cfg.GlobalCustomersDatabaseURL} {
		if name, err := database.DatabaseNameFromURL(databaseURL); err == nil && strings.TrimSpace(name) != "" {
			protected[strings.TrimSpace(name)] = true
		}
	}
	if strings.TrimSpace(m.cfg.GlobalCustomersDatabaseName) != "" {
		protected[strings.TrimSpace(m.cfg.GlobalCustomersDatabaseName)] = true
	}
	return protected[databaseName]
}

func (m *Manager) ResolveRequest(ctx context.Context, r *http.Request) (Tenant, *pgxpool.Pool, error) {
	tenant, err := m.ResolveRequestTenant(ctx, r)
	if err != nil {
		return Tenant{}, nil, err
	}
	pool, err := m.Pool(ctx, tenant)
	if err != nil {
		return Tenant{}, nil, err
	}
	return tenant, pool, nil
}

// ResolveRequestTenant resolves only tenant identity. Streaming endpoints use
// it to avoid retaining a database pool when they never execute tenant SQL.
func (m *Manager) ResolveRequestTenant(ctx context.Context, r *http.Request) (Tenant, error) {
	if ref := tenantRefFromRequest(r); ref != "" {
		return m.ResolveReference(ctx, ref)
	}

	host := forwardedHost(r)
	return m.ResolveHost(ctx, host)
}

func tenantRefFromRequest(r *http.Request) string {
	for _, header := range []string{"X-WAMERCIO-Tenant", "X-WAMERCIO-Tenant-Slug", "X-Tenant-Slug", "X-Tenant"} {
		if value := strings.TrimSpace(r.Header.Get(header)); value != "" {
			return value
		}
	}
	return strings.TrimSpace(r.URL.Query().Get("tenant"))
}

func (m *Manager) ResolveReference(ctx context.Context, value string) (Tenant, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return Tenant{}, fmt.Errorf("tenant no especificado")
	}
	host := normalizeHost(value)
	slug := NormalizeSlug(value)

	m.mu.RLock()
	if tenant, ok := m.bySlug[slug]; ok {
		m.mu.RUnlock()
		if tenantIsActive(tenant) {
			return tenant, nil
		}
		return Tenant{}, fmt.Errorf("tenant %s no está activo", tenant.Slug)
	}
	if host != "" {
		if tenant, ok := m.byHost[host]; ok {
			m.mu.RUnlock()
			if tenantIsActive(tenant) {
				return tenant, nil
			}
			return Tenant{}, fmt.Errorf("tenant %s no está activo", tenant.Slug)
		}
	}
	m.mu.RUnlock()

	var tenant Tenant
	err := m.coreDB.QueryRow(ctx, `
		SELECT t.id::text, t.name, t.slug, t.status, t.plan_slug, COALESCE(d.domain,''), COALESCE(db.database_name,''), t.created_at
		FROM tenants t
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
		WHERE t.slug=$1 OR t.id::text=$2 OR EXISTS (SELECT 1 FROM tenant_domains td WHERE td.tenant_id=t.id AND td.domain=$3)
		LIMIT 1
	`, slug, value, host).Scan(&tenant.ID, &tenant.Name, &tenant.Slug, &tenant.Status, &tenant.PlanSlug, &tenant.Domain, &tenant.DatabaseName, &tenant.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Tenant{}, fmt.Errorf("tenant no encontrado: %s", value)
	}
	if err != nil {
		return Tenant{}, err
	}
	if !tenantIsActive(tenant) {
		return Tenant{}, fmt.Errorf("tenant %s no está activo", tenant.Slug)
	}
	m.remember(tenant)
	return tenant, nil
}

func (m *Manager) ResolveHost(ctx context.Context, host string) (Tenant, error) {
	host = normalizeHost(host)
	rootDomain := normalizeHost(m.cfg.RootDomain)
	slug := ""
	if host == "" || isLocalHost(host) {
		return Tenant{}, fmt.Errorf("no se especificó un tenant activo")
	} else if rootDomain != "" && host == rootDomain {
		return Tenant{}, fmt.Errorf("%s es el dominio raíz reservado para los negocios y no identifica un tenant", host)
	} else if rootDomain != "" && strings.HasSuffix(host, "."+rootDomain) {
		slug = NormalizeSlug(strings.TrimSuffix(host, "."+rootDomain))
	}

	m.mu.RLock()
	if host != "" {
		if tenant, ok := m.byHost[host]; ok {
			m.mu.RUnlock()
			if tenantIsActive(tenant) {
				return tenant, nil
			}
			return Tenant{}, fmt.Errorf("tenant %s no está activo", tenant.Slug)
		}
	}
	if slug != "" {
		if tenant, ok := m.bySlug[slug]; ok {
			m.mu.RUnlock()
			if tenantIsActive(tenant) {
				return tenant, nil
			}
			return Tenant{}, fmt.Errorf("tenant %s no está activo", tenant.Slug)
		}
	}
	m.mu.RUnlock()

	var tenant Tenant
	err := m.coreDB.QueryRow(ctx, `
		SELECT t.id::text, t.name, t.slug, t.status, t.plan_slug, COALESCE(d.domain,''), COALESCE(db.database_name,''), t.created_at
		FROM tenants t
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
		WHERE ($1 <> '' AND EXISTS (SELECT 1 FROM tenant_domains td WHERE td.tenant_id=t.id AND td.domain=$1))
		   OR ($2 <> '' AND t.slug=$2)
		ORDER BY CASE WHEN EXISTS (SELECT 1 FROM tenant_domains td WHERE td.tenant_id=t.id AND td.domain=$1) THEN 0 ELSE 1 END
		LIMIT 1
	`, host, slug).Scan(&tenant.ID, &tenant.Name, &tenant.Slug, &tenant.Status, &tenant.PlanSlug, &tenant.Domain, &tenant.DatabaseName, &tenant.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Tenant{}, fmt.Errorf("tenant no encontrado para el dominio %q", host)
	}
	if err != nil {
		return Tenant{}, err
	}
	if !tenantIsActive(tenant) {
		return Tenant{}, fmt.Errorf("tenant %s no está activo", tenant.Slug)
	}
	m.remember(tenant)
	return tenant, nil
}

func tenantIsActive(tenant Tenant) bool { return tenant.Status == "active" || tenant.Status == "trial" }

func (m *Manager) Pool(ctx context.Context, tenant Tenant) (*pgxpool.Pool, error) {
	if tenant.DatabaseName == "" {
		return nil, fmt.Errorf("tenant %s no tiene base de datos asignada", tenant.Slug)
	}

	now := time.Now()
	m.mu.Lock()
	if entry := m.pools[tenant.ID]; entry != nil {
		entry.lastUsedAt = now
		pool := entry.pool
		m.mu.Unlock()
		return pool, nil
	}
	m.mu.Unlock()

	value, err, _ := m.poolGroup.Do(tenant.ID, func() (any, error) {
		return m.openPool(ctx, tenant)
	})
	if err != nil {
		return nil, err
	}
	pool, ok := value.(*pgxpool.Pool)
	if !ok || pool == nil {
		return nil, errors.New("tenant pool could not be initialized")
	}
	return pool, nil
}

func (m *Manager) openPool(ctx context.Context, tenant Tenant) (*pgxpool.Pool, error) {
	now := time.Now()
	m.mu.Lock()
	if entry := m.pools[tenant.ID]; entry != nil {
		entry.lastUsedAt = now
		pool := entry.pool
		m.mu.Unlock()
		return pool, nil
	}
	m.closeIdlePoolsLocked(now)
	maxPools := m.maxActivePools()
	if maxPools > 0 && len(m.pools)+m.openingPools >= maxPools {
		m.mu.Unlock()
		return nil, fmt.Errorf("la plataforma alcanzó el límite temporal de negocios activos (%d). Intenta nuevamente en unos segundos", maxPools)
	}
	m.openingPools++
	m.mu.Unlock()
	reservationActive := true
	defer func() {
		if reservationActive {
			m.mu.Lock()
			m.openingPools--
			m.mu.Unlock()
		}
	}()

	if err := m.ensureDatabase(ctx, tenant.DatabaseName); err != nil {
		return nil, err
	}
	if strings.TrimSpace(m.cfg.TenantMigrationsPath) != "" {
		if err := database.RunMigrations(ctx, m.cfg.TenantMigrationsPath, m.tenantDatabaseURL(tenant.DatabaseName)); err != nil {
			return nil, err
		}
	}

	pool, err := database.Connect(ctx, m.runtimeTenantDatabaseURL(tenant.DatabaseName), database.EnvPoolOptions("TENANT_DB", 0, 2))
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.openingPools--
	reservationActive = false
	if entry := m.pools[tenant.ID]; entry != nil {
		pool.Close()
		entry.lastUsedAt = now
		return entry.pool, nil
	}
	m.pools[tenant.ID] = &tenantPool{tenant: tenant, pool: pool, lastUsedAt: now}
	return pool, nil
}

func (m *Manager) StartPoolCleaner(ctx context.Context) {
	m.lifecycleMu.Lock()
	if m.cleanerCancel != nil {
		m.lifecycleMu.Unlock()
		return
	}
	cleanerContext, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	m.cleanerCancel = cancel
	m.cleanerDone = done
	m.lifecycleMu.Unlock()

	interval := time.Minute
	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-cleanerContext.Done():
				return
			case <-ticker.C:
				m.closeIdlePools()
			}
		}
	}()
}

func (m *Manager) ActiveTenants() []Tenant {
	if m == nil {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	items := make([]Tenant, 0, len(m.pools))
	for _, entry := range m.pools {
		if entry == nil || entry.pool == nil {
			continue
		}
		items = append(items, entry.tenant)
	}
	return items
}

func (m *Manager) PoolStats() PoolStats {
	m.mu.RLock()
	active := len(m.pools)
	var totalConns, acquiredConns, idleConns, emptyAcquireCount int64
	var acquireDuration time.Duration
	for _, entry := range m.pools {
		if entry == nil || entry.pool == nil {
			continue
		}
		stats := entry.pool.Stat()
		totalConns += int64(stats.TotalConns())
		acquiredConns += int64(stats.AcquiredConns())
		idleConns += int64(stats.IdleConns())
		emptyAcquireCount += stats.EmptyAcquireCount()
		acquireDuration += stats.AcquireDuration()
	}
	m.mu.RUnlock()
	return PoolStats{
		ActivePools:       active,
		MaxPools:          m.maxActivePools(),
		TenantMaxConns:    m.cfg.TenantDBMaxConns,
		TenantMinConns:    m.cfg.TenantDBMinConns,
		TTLMinutes:        m.poolTTLMinutes(),
		TotalConns:        totalConns,
		AcquiredConns:     acquiredConns,
		IdleConns:         idleConns,
		EmptyAcquireCount: emptyAcquireCount,
		AcquireDuration:   acquireDuration,
	}
}

func (m *Manager) closeIdlePools() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closeIdlePoolsLocked(time.Now())
}

func (m *Manager) closeIdlePoolsLocked(now time.Time) {
	ttl := time.Duration(m.poolTTLMinutes()) * time.Minute
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	for tenantID, entry := range m.pools {
		if now.Sub(entry.lastUsedAt) > ttl && entry.pool.Stat().AcquiredConns() == 0 {
			entry.pool.Close()
			delete(m.pools, tenantID)
		}
	}
}

func (m *Manager) poolTTLMinutes() int {
	if m.cfg.TenantPoolTTLMinutes <= 0 {
		return 5
	}
	return m.cfg.TenantPoolTTLMinutes
}

func (m *Manager) maxActivePools() int {
	if m.cfg.MaxActiveTenantPools <= 0 {
		return 20
	}
	return m.cfg.MaxActiveTenantPools
}

func (m *Manager) Close() {
	m.lifecycleMu.Lock()
	cancel := m.cleanerCancel
	done := m.cleanerDone
	m.cleanerCancel = nil
	m.cleanerDone = nil
	m.lifecycleMu.Unlock()
	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	for _, entry := range m.pools {
		entry.pool.Close()
	}
	m.pools = map[string]*tenantPool{}
}

func (m *Manager) tenantDatabaseURL(databaseName string) string {
	template := strings.TrimSpace(m.cfg.TenantDatabaseURLTemplate)
	if strings.Contains(template, "{{database}}") {
		return strings.ReplaceAll(template, "{{database}}", databaseName)
	}
	u, err := url.Parse(firstNonEmpty(template, m.cfg.CentralDatabaseURL))
	if err != nil {
		return firstNonEmpty(template, m.cfg.CentralDatabaseURL)
	}
	u.Path = "/" + databaseName
	return u.String()
}

func (m *Manager) runtimeTenantDatabaseURL(databaseName string) string {
	template := strings.TrimSpace(m.cfg.RuntimeTenantDatabaseURLTemplate)
	if template == "" {
		template = strings.TrimSpace(m.cfg.TenantDatabaseURLTemplate)
	}
	if strings.Contains(template, "{{database}}") {
		return strings.ReplaceAll(template, "{{database}}", databaseName)
	}
	u, err := url.Parse(firstNonEmpty(template, m.cfg.CentralDatabaseURL))
	if err != nil {
		return firstNonEmpty(template, m.cfg.CentralDatabaseURL)
	}
	u.Path = "/" + databaseName
	return u.String()
}

func (m *Manager) databaseExists(ctx context.Context, databaseName string) (bool, error) {
	var exists bool
	if err := m.coreDB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname=$1)`, databaseName).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (m *Manager) ensureDatabase(ctx context.Context, databaseName string) error {
	if !safeDBName(databaseName) {
		return fmt.Errorf("nombre de base de datos inseguro: %s", databaseName)
	}
	exists, err := m.databaseExists(ctx, databaseName)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	_, err = m.coreDB.Exec(ctx, `CREATE DATABASE `+quoteIdent(databaseName))
	return err
}

func (m *Manager) remember(t Tenant) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if t.Domain != "" {
		m.byHost[normalizeHost(t.Domain)] = t
	}
	m.bySlug[NormalizeSlug(t.Slug)] = t
}

func forwardedHost(r *http.Request) string {
	for _, header := range []string{"X-Forwarded-Host", "X-Original-Host", "Host"} {
		value := strings.TrimSpace(r.Header.Get(header))
		if value != "" {
			return value
		}
	}
	return r.Host
}

func normalizeHost(host string) string {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return ""
	}
	if strings.Contains(host, ",") {
		host = strings.TrimSpace(strings.Split(host, ",")[0])
	}
	if strings.Contains(host, ":") {
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		} else if strings.Count(host, ":") == 1 {
			host = strings.Split(host, ":")[0]
		}
	}
	host = strings.Trim(host, ".")
	return host
}

func isLocalHost(host string) bool {
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
}

func safeDBName(value string) bool {
	if value == "" || len(value) > 63 {
		return false
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return false
	}
	return true
}

func quoteIdent(value string) string { return `"` + strings.ReplaceAll(value, `"`, `""`) + `"` }

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

type tenantContextKey struct{}
type tenantPoolContextKey struct{}

type contextWithoutTenant struct {
	context.Context
}

func (ctx contextWithoutTenant) Value(key any) any {
	switch key.(type) {
	case tenantContextKey, tenantPoolContextKey:
		return nil
	default:
		return ctx.Context.Value(key)
	}
}

func WithTenant(ctx context.Context, tenant Tenant, pool *pgxpool.Pool) context.Context {
	ctx = context.WithValue(ctx, tenantContextKey{}, tenant)
	ctx = context.WithValue(ctx, tenantPoolContextKey{}, pool)
	return ctx
}

func FromContext(ctx context.Context) (Tenant, bool) {
	tenant, ok := ctx.Value(tenantContextKey{}).(Tenant)
	return tenant, ok
}

func PoolFromContext(ctx context.Context) (*pgxpool.Pool, bool) {
	pool, ok := ctx.Value(tenantPoolContextKey{}).(*pgxpool.Pool)
	return pool, ok && pool != nil
}

// WithoutTenant preserves cancellation, deadlines and unrelated values while
// routing a central-platform query through DBRouter's fallback pool.
func WithoutTenant(ctx context.Context) context.Context {
	return contextWithoutTenant{Context: ctx}
}

type DBRouter struct {
	fallback *pgxpool.Pool
}

func NewDBRouter(fallback *pgxpool.Pool) *DBRouter { return &DBRouter{fallback: fallback} }

func (r *DBRouter) pool(ctx context.Context) *pgxpool.Pool {
	if pool, ok := PoolFromContext(ctx); ok {
		return pool
	}
	return r.fallback
}

func (r *DBRouter) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return r.pool(ctx).Exec(ctx, sql, args...)
}

func (r *DBRouter) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return r.pool(ctx).Query(ctx, sql, args...)
}

func (r *DBRouter) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return r.pool(ctx).QueryRow(ctx, sql, args...)
}

func (r *DBRouter) BeginTx(ctx context.Context, opts pgx.TxOptions) (pgx.Tx, error) {
	return r.pool(ctx).BeginTx(ctx, opts)
}

func (r *DBRouter) Ping(ctx context.Context) error { return r.pool(ctx).Ping(ctx) }
