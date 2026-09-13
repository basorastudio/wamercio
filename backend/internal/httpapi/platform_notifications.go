package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"wamercio/backend/internal/platform/tenancy"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const notificationTemplateSchemaSQL = `
CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'platform',
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  category text NOT NULL DEFAULT 'system',
  event_key text NOT NULL,
  name text NOT NULL,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  allow_business_override boolean NOT NULL DEFAULT true,
  created_by text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_templates_scope_check CHECK (scope IN ('platform','business')),
  CONSTRAINT notification_templates_channel_check CHECK (channel IN ('whatsapp')),
  CONSTRAINT notification_templates_scope_tenant_check CHECK (
    (scope='platform' AND tenant_id IS NULL) OR
    (scope='business' AND tenant_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_platform_event
  ON notification_templates(event_key) WHERE scope='platform';
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_business_event
  ON notification_templates(tenant_id,event_key) WHERE scope='business';
CREATE INDEX IF NOT EXISTS idx_notification_templates_scope_category
  ON notification_templates(scope,category,enabled,updated_at DESC);
`

var notificationTemplateEventPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,79}$`)
var notificationTemplateVariablePattern = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_.-]{1,64})\s*\}\}`)
var notificationTemplateUUIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

var defaultNotificationTemplates = []struct {
	Category              string
	EventKey              string
	Name                  string
	Body                  string
	AllowBusinessOverride bool
}{
	{"system", "system.welcome", "Bienvenida a WAMERCIO", "Hola {{cliente}}, bienvenido a {{negocio}}. Ya puedes utilizar los servicios disponibles en WAMERCIO.", true},
	{"registration", "registration.client.completed", "Registro de cliente completado", "Hola {{cliente}}, tu cuenta fue creada correctamente en {{negocio}}.", true},
	{"registration", "registration.owner.created", "Nuevo propietario registrado", "Hola {{cliente}}, tu acceso administrativo a {{negocio}} fue creado correctamente.", true},
	{"orders", "order.created", "Pedido recibido", "Hola {{cliente}}, recibimos tu pedido {{pedido_id}} en {{negocio}}. {{mensaje}}", true},
	{"orders", "order.status.changed", "Estado del pedido actualizado", "Hola {{cliente}}, tu pedido {{pedido_id}} cambió al estado: {{estado}}. {{mensaje}}", true},
	{"payments", "store_credit.payment.recorded", "Abono de fiado registrado", "Hola {{cliente}}, registramos un abono de RD$ {{monto}}. Saldo pendiente: RD$ {{saldo}}.", true},
	{"security", "security.access.changed", "Cambio de acceso", "Hola {{cliente}}, se realizó un cambio de seguridad en tu acceso a {{negocio}}.", true},
}

type platformNotificationTemplate struct {
	ID                    string          `json:"id"`
	Scope                 string          `json:"scope"`
	TenantID              string          `json:"tenant_id,omitempty"`
	TenantName            string          `json:"tenant_name,omitempty"`
	Channel               string          `json:"channel"`
	Category              string          `json:"category"`
	EventKey              string          `json:"event_key"`
	Name                  string          `json:"name"`
	Body                  string          `json:"body"`
	Variables             json.RawMessage `json:"variables"`
	Enabled               bool            `json:"enabled"`
	AllowBusinessOverride bool            `json:"allow_business_override"`
	CreatedBy             string          `json:"created_by"`
	UpdatedBy             string          `json:"updated_by"`
	CreatedAt             time.Time       `json:"created_at"`
	UpdatedAt             time.Time       `json:"updated_at"`
}

type notificationTemplateInput struct {
	Scope                 string `json:"scope"`
	TenantID              string `json:"tenant_id"`
	Category              string `json:"category"`
	EventKey              string `json:"event_key"`
	Name                  string `json:"name"`
	Body                  string `json:"body"`
	Enabled               *bool  `json:"enabled"`
	AllowBusinessOverride *bool  `json:"allow_business_override"`
}

func (s *Server) ensurePlatformNotificationTemplatesSchema(ctx context.Context) error {
	if s == nil || s.tenantManager == nil || s.tenantManager.CoreDB() == nil {
		return badRequest("El modo SaaS multi-tenant no está activo")
	}
	tx, err := s.tenantManager.CoreDB().Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, statement := range strings.Split(notificationTemplateSchemaSQL, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := tx.Exec(ctx, statement); err != nil {
			return err
		}
	}

	var seeded bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM platform_settings WHERE key='notification_templates_seeded_v1'
		)
	`).Scan(&seeded); err != nil {
		return err
	}
	if !seeded {
		for _, item := range defaultNotificationTemplates {
			variables, _ := json.Marshal(extractNotificationTemplateVariables(item.Body))
			if _, err := tx.Exec(ctx, `
				INSERT INTO notification_templates (
					scope,channel,category,event_key,name,body,variables,enabled,allow_business_override,created_by,updated_by
				) VALUES ('platform','whatsapp',$1,$2,$3,$4,$5::jsonb,true,$6,'system','system')
				ON CONFLICT DO NOTHING
			`, item.Category, item.EventKey, item.Name, item.Body, string(variables), item.AllowBusinessOverride); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO platform_settings (key,value,updated_at)
			VALUES ('notification_templates_seeded_v1','true'::jsonb,now())
			ON CONFLICT (key) DO NOTHING
		`); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func normalizeNotificationTemplateScope(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "business", "negocio", "tenant":
		return "business"
	default:
		return "platform"
	}
}

func normalizeNotificationTemplateCategory(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	replacer := strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")
	value = replacer.Replace(value)
	value = regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if value == "" {
		return "system"
	}
	if len(value) > 40 {
		value = strings.Trim(value[:40], "-")
	}
	return value
}

func cleanNotificationTemplateText(value string, max int) string {
	value = strings.ReplaceAll(value, "\x00", "")
	value = strings.TrimSpace(value)
	if len(value) > max {
		value = strings.TrimSpace(value[:max])
	}
	return value
}

func extractNotificationTemplateVariables(body string) []string {
	seen := map[string]bool{}
	variables := []string{}
	for _, match := range notificationTemplateVariablePattern.FindAllStringSubmatch(body, -1) {
		if len(match) < 2 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(match[1]))
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		variables = append(variables, key)
	}
	sort.Strings(variables)
	return variables
}

func (s *Server) validateNotificationTemplateInput(ctx context.Context, input notificationTemplateInput) (notificationTemplateInput, error) {
	input.Scope = normalizeNotificationTemplateScope(input.Scope)
	input.TenantID = strings.TrimSpace(input.TenantID)
	input.Category = normalizeNotificationTemplateCategory(input.Category)
	input.EventKey = strings.ToLower(strings.TrimSpace(input.EventKey))
	input.Name = cleanNotificationTemplateText(input.Name, 120)
	input.Body = cleanNotificationTemplateText(input.Body, 4000)
	if input.Name == "" {
		return input, badRequest("El nombre de la plantilla es obligatorio")
	}
	if !notificationTemplateEventPattern.MatchString(input.EventKey) {
		return input, badRequest("El evento debe usar letras minúsculas, números, puntos, guiones o guiones bajos")
	}
	if input.Body == "" {
		return input, badRequest("El mensaje de WhatsApp es obligatorio")
	}
	if input.Scope == "platform" {
		input.TenantID = ""
		return input, nil
	}
	if !notificationTemplateUUIDPattern.MatchString(input.TenantID) {
		return input, badRequest("Selecciona el negocio al que pertenece la plantilla")
	}
	var exists bool
	if err := s.tenantManager.CoreDB().QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1::uuid)`, input.TenantID).Scan(&exists); err != nil {
		return input, err
	}
	if !exists {
		return input, badRequest("El negocio seleccionado no existe")
	}
	return input, nil
}

func scanPlatformNotificationTemplate(row pgx.Row) (platformNotificationTemplate, error) {
	var item platformNotificationTemplate
	err := row.Scan(
		&item.ID,
		&item.Scope,
		&item.TenantID,
		&item.TenantName,
		&item.Channel,
		&item.Category,
		&item.EventKey,
		&item.Name,
		&item.Body,
		&item.Variables,
		&item.Enabled,
		&item.AllowBusinessOverride,
		&item.CreatedBy,
		&item.UpdatedBy,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	return item, err
}

func notificationTemplateSelect(where string) string {
	return `
		SELECT nt.id::text,nt.scope,COALESCE(nt.tenant_id::text,''),COALESCE(t.name,''),nt.channel,
		       nt.category,nt.event_key,nt.name,nt.body,COALESCE(nt.variables,'[]'::jsonb),nt.enabled,
		       nt.allow_business_override,nt.created_by,nt.updated_by,nt.created_at,nt.updated_at
		FROM notification_templates nt
		LEFT JOIN tenants t ON t.id=nt.tenant_id
	` + where
}

func (s *Server) listPlatformNotificationTemplates(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformNotificationTemplatesSchema(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	scope := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("scope")))
	if scope != "platform" && scope != "business" {
		scope = ""
	}
	tenantID := strings.TrimSpace(r.URL.Query().Get("tenant_id"))
	category := normalizeNotificationTemplateCategory(r.URL.Query().Get("category"))
	if strings.TrimSpace(r.URL.Query().Get("category")) == "" {
		category = ""
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), notificationTemplateSelect(`
		WHERE ($1='' OR nt.scope=$1)
		  AND ($2='' OR nt.tenant_id::text=$2)
		  AND ($3='' OR nt.category=$3)
		  AND ($4='' OR nt.name ILIKE '%' || $4 || '%' OR nt.event_key ILIKE '%' || $4 || '%' OR nt.body ILIKE '%' || $4 || '%')
		ORDER BY nt.scope ASC,COALESCE(t.name,''),nt.category,nt.name
	`), scope, tenantID, category, query)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformNotificationTemplate{}
	summary := map[string]int{"total": 0, "platform": 0, "business": 0, "enabled": 0}
	for rows.Next() {
		item, err := scanPlatformNotificationTemplate(rows)
		if err != nil {
			writeError(w, err)
			return
		}
		items = append(items, item)
		summary["total"]++
		summary[item.Scope]++
		if item.Enabled {
			summary["enabled"]++
		}
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "summary": summary})
}

func (s *Server) createPlatformNotificationTemplate(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformNotificationTemplatesSchema(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	var input notificationTemplateInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input, err := s.validateNotificationTemplateInput(r.Context(), input)
	if err != nil {
		writeError(w, err)
		return
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	allowOverride := input.Scope == "platform"
	if input.AllowBusinessOverride != nil {
		allowOverride = *input.AllowBusinessOverride
	}
	if input.Scope == "business" {
		allowOverride = false
	}
	variables, _ := json.Marshal(extractNotificationTemplateVariables(input.Body))
	actor := s.platformActor(r)
	item, err := scanPlatformNotificationTemplate(s.tenantManager.CoreDB().QueryRow(r.Context(), `
		WITH inserted AS (
			INSERT INTO notification_templates (
				scope,tenant_id,channel,category,event_key,name,body,variables,enabled,allow_business_override,created_by,updated_by
			) VALUES ($1,NULLIF($2,'')::uuid,'whatsapp',$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$10)
			RETURNING id
		)
		SELECT nt.id::text,nt.scope,COALESCE(nt.tenant_id::text,''),COALESCE(t.name,''),nt.channel,
		       nt.category,nt.event_key,nt.name,nt.body,COALESCE(nt.variables,'[]'::jsonb),nt.enabled,
		       nt.allow_business_override,nt.created_by,nt.updated_by,nt.created_at,nt.updated_at
		FROM notification_templates nt
		JOIN inserted ON inserted.id=nt.id
		LEFT JOIN tenants t ON t.id=nt.tenant_id
	`, input.Scope, input.TenantID, input.Category, input.EventKey, input.Name, input.Body, string(variables), enabled, allowOverride, actor))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, badRequest("Ya existe una plantilla para ese evento y alcance"))
			return
		}
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), actor, item.TenantID, "notification_template.create", map[string]any{"template_id": item.ID, "scope": item.Scope, "event_key": item.EventKey})
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) updatePlatformNotificationTemplate(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if !notificationTemplateUUIDPattern.MatchString(id) {
		writeError(w, badRequest("El identificador de la plantilla no es válido"))
		return
	}
	if err := s.ensurePlatformNotificationTemplatesSchema(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	var input notificationTemplateInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input, err := s.validateNotificationTemplateInput(r.Context(), input)
	if err != nil {
		writeError(w, err)
		return
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	allowOverride := input.Scope == "platform"
	if input.AllowBusinessOverride != nil {
		allowOverride = *input.AllowBusinessOverride
	}
	if input.Scope == "business" {
		allowOverride = false
	}
	variables, _ := json.Marshal(extractNotificationTemplateVariables(input.Body))
	actor := s.platformActor(r)
	item, err := scanPlatformNotificationTemplate(s.tenantManager.CoreDB().QueryRow(r.Context(), `
		WITH updated AS (
			UPDATE notification_templates SET
				scope=$2,tenant_id=NULLIF($3,'')::uuid,category=$4,event_key=$5,name=$6,body=$7,
				variables=$8::jsonb,enabled=$9,allow_business_override=$10,updated_by=$11,updated_at=now()
			WHERE id=$1::uuid RETURNING id
		)
		SELECT nt.id::text,nt.scope,COALESCE(nt.tenant_id::text,''),COALESCE(t.name,''),nt.channel,
		       nt.category,nt.event_key,nt.name,nt.body,COALESCE(nt.variables,'[]'::jsonb),nt.enabled,
		       nt.allow_business_override,nt.created_by,nt.updated_by,nt.created_at,nt.updated_at
		FROM notification_templates nt
		JOIN updated ON updated.id=nt.id
		LEFT JOIN tenants t ON t.id=nt.tenant_id
	`, id, input.Scope, input.TenantID, input.Category, input.EventKey, input.Name, input.Body, string(variables), enabled, allowOverride, actor))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, notFound("Plantilla no encontrada"))
		return
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, badRequest("Ya existe una plantilla para ese evento y alcance"))
			return
		}
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), actor, item.TenantID, "notification_template.update", map[string]any{"template_id": item.ID, "scope": item.Scope, "event_key": item.EventKey})
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deletePlatformNotificationTemplate(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformNotificationTemplatesSchema(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if !notificationTemplateUUIDPattern.MatchString(id) {
		writeError(w, badRequest("El identificador de la plantilla no es válido"))
		return
	}
	var tenantID, eventKey string
	err := s.tenantManager.CoreDB().QueryRow(r.Context(), `
		DELETE FROM notification_templates WHERE id=$1::uuid
		RETURNING COALESCE(tenant_id::text,''),event_key
	`, id).Scan(&tenantID, &eventKey)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, notFound("Plantilla no encontrada"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), tenantID, "notification_template.delete", map[string]any{"template_id": id, "event_key": eventKey})
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

type resolvedNotificationTemplate struct {
	Body                  string
	Enabled               bool
	AllowBusinessOverride bool
	Found                 bool
}

func (s *Server) notificationTemplateForEvent(ctx context.Context, tenantID, eventKey string) (resolvedNotificationTemplate, error) {
	if s == nil || s.tenantManager == nil || s.tenantManager.CoreDB() == nil {
		return resolvedNotificationTemplate{}, nil
	}
	var platformTemplate resolvedNotificationTemplate
	err := s.tenantManager.CoreDB().QueryRow(ctx, `
		SELECT body,enabled,allow_business_override,true
		FROM notification_templates
		WHERE scope='platform' AND event_key=$1
		LIMIT 1
	`, eventKey).Scan(&platformTemplate.Body, &platformTemplate.Enabled, &platformTemplate.AllowBusinessOverride, &platformTemplate.Found)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return resolvedNotificationTemplate{}, err
	}
	if platformTemplate.Found && !platformTemplate.AllowBusinessOverride {
		return platformTemplate, nil
	}
	if strings.TrimSpace(tenantID) != "" {
		var businessTemplate resolvedNotificationTemplate
		err = s.tenantManager.CoreDB().QueryRow(ctx, `
			SELECT body,enabled,false,true
			FROM notification_templates
			WHERE scope='business' AND tenant_id=$1::uuid AND event_key=$2
			LIMIT 1
		`, tenantID, eventKey).Scan(&businessTemplate.Body, &businessTemplate.Enabled, &businessTemplate.AllowBusinessOverride, &businessTemplate.Found)
		if err == nil && businessTemplate.Found && businessTemplate.Enabled {
			return businessTemplate, nil
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return resolvedNotificationTemplate{}, err
		}
	}
	return platformTemplate, nil
}

func notificationTemplateValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case float64:
		return strconv.FormatFloat(typed, 'f', 2, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', 2, 64)
	case json.Number:
		return typed.String()
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func renderNotificationTemplateBody(body string, values map[string]string) string {
	body = notificationTemplateVariablePattern.ReplaceAllStringFunc(body, func(match string) string {
		parts := notificationTemplateVariablePattern.FindStringSubmatch(match)
		if len(parts) < 2 {
			return ""
		}
		return values[strings.ToLower(strings.TrimSpace(parts[1]))]
	})
	lines := strings.Split(body, "\n")
	cleaned := make([]string, 0, len(lines))
	blank := false
	for _, line := range lines {
		line = strings.TrimRight(line, " \t")
		if strings.TrimSpace(line) == "" {
			if blank || len(cleaned) == 0 {
				continue
			}
			blank = true
			cleaned = append(cleaned, "")
			continue
		}
		blank = false
		cleaned = append(cleaned, line)
	}
	return strings.TrimSpace(strings.Join(cleaned, "\n"))
}

func (s *Server) renderWhatsAppNotification(ctx context.Context, notification whatsappNotificationRecord, customerName string) string {
	fallback := strings.TrimSpace(notification.Title)
	if message := strings.TrimSpace(notification.Message); message != "" {
		if fallback != "" {
			fallback += "\n\n"
		}
		fallback += message
	}
	tenantID := ""
	businessName := ""
	if tenant, ok := tenancy.FromContext(ctx); ok {
		tenantID = strings.TrimSpace(tenant.ID)
		businessName = strings.TrimSpace(tenant.Name)
	}
	resolved, err := s.notificationTemplateForEvent(ctx, tenantID, strings.TrimSpace(notification.EventType))
	if err != nil || !resolved.Found || !resolved.Enabled || strings.TrimSpace(resolved.Body) == "" {
		return fallback
	}
	values := map[string]string{
		"titulo":     strings.TrimSpace(notification.Title),
		"mensaje":    strings.TrimSpace(notification.Message),
		"evento":     strings.TrimSpace(notification.EventType),
		"negocio":    businessName,
		"cliente":    strings.TrimSpace(customerName),
		"plataforma": "WAMERCIO",
	}
	var data map[string]any
	if len(notification.Data) > 0 {
		_ = json.Unmarshal(notification.Data, &data)
	}
	for key, value := range data {
		values[strings.ToLower(strings.TrimSpace(key))] = notificationTemplateValue(value)
	}
	aliases := map[string][]string{
		"pedido_id": {"order_id", "orderid", "sale_id", "venta_id"},
		"total":     {"total", "amount", "monto"},
		"metodo":    {"method", "payment_method", "metodo"},
		"estado":    {"status", "estado"},
		"monto":     {"amount", "payment", "monto", "total"},
		"saldo":     {"remaining", "remaining_amount", "saldo"},
	}
	for target, candidates := range aliases {
		if values[target] != "" {
			continue
		}
		for _, candidate := range candidates {
			if value := values[candidate]; value != "" {
				values[target] = value
				break
			}
		}
	}
	body := renderNotificationTemplateBody(resolved.Body, values)
	if body == "" {
		return fallback
	}
	return body
}
