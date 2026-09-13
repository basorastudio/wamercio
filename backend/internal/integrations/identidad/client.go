package identidad

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const (
	verifyPath          = "/api/v1/identidad/verificar"
	defaultResponseSize = int64(2 << 20)
)

// Client is a server-to-server client for Identidad API.
type Client struct {
	baseURL           string
	apiKey            string
	clientID          string
	applicationDomain string
	httpClient        *http.Client
	maxBodyBytes      int64
}

// Request describes a person or company identity verification.
type Request struct {
	SubjectType string `json:"tipo_sujeto"`
	Document    string `json:"documento"`
	Context     string `json:"contexto"`
}

// Person is the normalized person returned by Identidad API.
type Person struct {
	NationalID             string `json:"cedula"`
	FullName               string `json:"nombre_completo"`
	FirstNames             string `json:"nombres"`
	LastNames              string `json:"apellidos"`
	BirthDate              string `json:"fecha_nacimiento,omitempty"`
	Gender                 string `json:"sexo,omitempty"`
	ReliableNameSeparation bool   `json:"separacion_nombre_confiable"`
}

// Company is the normalized company returned by Identidad API.
type Company struct {
	RNC            string `json:"rnc"`
	LegalName      string `json:"razon_social"`
	CommercialName string `json:"nombre_comercial,omitempty"`
	Status         string `json:"estado,omitempty"`
	Active         bool   `json:"activa"`
}

// Result is the business result of an identity verification.
type Result struct {
	SubjectType          string   `json:"tipo_sujeto"`
	DocumentType         string   `json:"tipo_documento"`
	Document             string   `json:"documento"`
	Context              string   `json:"contexto,omitempty"`
	Valid                bool     `json:"valida"`
	Found                bool     `json:"encontrada"`
	CanAutocomplete      bool     `json:"puede_autocompletar"`
	RequiresConfirmation bool     `json:"requiere_confirmacion"`
	CanRegister          bool     `json:"puede_registrarse"`
	Reason               string   `json:"motivo,omitempty"`
	Source               string   `json:"fuente,omitempty"`
	Person               *Person  `json:"persona,omitempty"`
	Company              *Company `json:"empresa,omitempty"`
}

// Meta carries request correlation metadata returned by Identidad API.
type Meta struct {
	RequestID string `json:"request_id,omitempty"`
	Cached    bool   `json:"cached,omitempty"`
	Provider  string `json:"provider,omitempty"`
}

// APIError is returned for non-2xx responses or invalid upstream payloads.
type APIError struct {
	StatusCode int
	Code       string
	Message    string
	RequestID  string
	Cause      error
}

func (e *APIError) Error() string {
	if e == nil {
		return "error de Identidad API"
	}
	message := strings.TrimSpace(e.Message)
	if message == "" {
		message = "Identidad API rechazó la solicitud"
	}
	if e.Code != "" {
		return fmt.Sprintf("%s: %s", e.Code, message)
	}
	return message
}

func (e *APIError) Unwrap() error { return e.Cause }

// New creates a client. API credentials never leave the backend process.
func New(baseURL, apiKey, clientID, applicationDomain string, httpClient *http.Client) (*Client, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	apiKey = strings.TrimSpace(apiKey)
	clientID = strings.TrimSpace(clientID)
	applicationDomain, err := normalizeApplicationDomain(applicationDomain)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, errors.New("la URL de Identidad API es obligatoria")
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, errors.New("la URL de Identidad API debe ser HTTP o HTTPS")
	}
	if apiKey == "" {
		return nil, errors.New("la API key de Identidad API es obligatoria")
	}
	if clientID == "" {
		clientID = "wamercio"
	}
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{
		baseURL:           baseURL,
		apiKey:            apiKey,
		clientID:          clientID,
		applicationDomain: applicationDomain,
		httpClient:        httpClient,
		maxBodyBytes:      defaultResponseSize,
	}, nil
}

func normalizeApplicationDomain(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if strings.HasPrefix(value, "*.") {
		return "", errors.New("el dominio de aplicación de Identidad API debe ser un dominio concreto, no un comodín")
	}
	candidate := value
	if !strings.Contains(candidate, "://") {
		candidate = "https://" + candidate
	}
	parsed, err := url.Parse(candidate)
	if err != nil || parsed.Host == "" {
		return "", errors.New("el dominio de aplicación de Identidad API no es válido")
	}
	host := strings.ToLower(strings.Trim(strings.TrimSpace(parsed.Hostname()), "."))
	if host == "" || strings.ContainsAny(host, "/*") {
		return "", errors.New("el dominio de aplicación de Identidad API no es válido")
	}
	if len(host) > 253 {
		return "", errors.New("el dominio de aplicación de Identidad API es demasiado largo")
	}
	return host, nil
}

// Verify sends a verification request and propagates the WAMERCIO request ID.
func (c *Client) Verify(ctx context.Context, input Request, requestID string) (Result, Meta, error) {
	input.SubjectType = strings.ToLower(strings.TrimSpace(input.SubjectType))
	input.Document = strings.TrimSpace(input.Document)
	input.Context = strings.TrimSpace(input.Context)
	payload, err := json.Marshal(input)
	if err != nil {
		return Result{}, Meta{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+verifyPath, bytes.NewReader(payload))
	if err != nil {
		return Result{}, Meta{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("X-Client-ID", c.clientID)
	if c.applicationDomain != "" {
		req.Header.Set("X-Application-Domain", c.applicationDomain)
	}
	if input.Context != "" {
		req.Header.Set("X-Usage-Context", input.Context)
	}
	if requestID = strings.TrimSpace(requestID); requestID != "" {
		req.Header.Set("X-Request-ID", requestID)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Result{}, Meta{}, &APIError{
			StatusCode: http.StatusBadGateway,
			Code:       "IDENTITY_SERVICE_UNAVAILABLE",
			Message:    "No se pudo conectar con Identidad API.",
			Cause:      err,
		}
	}
	defer resp.Body.Close()

	body, readErr := io.ReadAll(io.LimitReader(resp.Body, c.maxBodyBytes+1))
	if readErr != nil {
		return Result{}, Meta{}, &APIError{StatusCode: http.StatusBadGateway, Code: "IDENTITY_INVALID_RESPONSE", Message: "No se pudo leer la respuesta de Identidad API.", Cause: readErr}
	}
	if int64(len(body)) > c.maxBodyBytes {
		return Result{}, Meta{}, &APIError{StatusCode: http.StatusBadGateway, Code: "IDENTITY_RESPONSE_TOO_LARGE", Message: "Identidad API devolvió una respuesta demasiado grande."}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Result{}, Meta{}, decodeAPIError(resp.StatusCode, resp.Header.Get("X-Request-ID"), body)
	}

	result, meta, err := decodeSuccess(body)
	if err != nil {
		return Result{}, Meta{}, &APIError{StatusCode: http.StatusBadGateway, Code: "IDENTITY_INVALID_RESPONSE", Message: "Identidad API devolvió una respuesta no válida.", RequestID: resp.Header.Get("X-Request-ID"), Cause: err}
	}
	if meta.RequestID == "" {
		meta.RequestID = strings.TrimSpace(resp.Header.Get("X-Request-ID"))
	}
	return result, meta, nil
}

type successEnvelope struct {
	Success *bool           `json:"success"`
	Data    json.RawMessage `json:"data"`
	Result  json.RawMessage `json:"result"`
	Meta    Meta            `json:"meta"`
	Error   json.RawMessage `json:"error"`
}

func decodeSuccess(body []byte) (Result, Meta, error) {
	var envelope successEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return Result{}, Meta{}, err
	}
	if envelope.Success != nil && !*envelope.Success {
		return Result{}, Meta{}, errors.New("la respuesta indicó success=false")
	}

	raw := envelope.Data
	if len(raw) == 0 || string(raw) == "null" {
		raw = envelope.Result
	}
	if len(raw) == 0 || string(raw) == "null" {
		raw = body
	}

	var result Result
	if err := json.Unmarshal(raw, &result); err != nil {
		return Result{}, Meta{}, err
	}
	if strings.TrimSpace(result.SubjectType) == "" && strings.TrimSpace(result.Document) == "" {
		return Result{}, Meta{}, errors.New("respuesta de identidad vacía")
	}
	return result, envelope.Meta, nil
}

func decodeAPIError(status int, headerRequestID string, body []byte) error {
	apiErr := &APIError{StatusCode: status, RequestID: strings.TrimSpace(headerRequestID)}
	var payload map[string]any
	if len(body) > 0 && json.Unmarshal(body, &payload) == nil {
		apiErr.Code = firstString(payload, "code", "error_code")
		apiErr.Message = firstString(payload, "message", "detail", "error_description")
		apiErr.RequestID = firstNonEmpty(apiErr.RequestID, firstString(payload, "request_id"))
		if raw, ok := payload["error"]; ok {
			switch value := raw.(type) {
			case string:
				apiErr.Message = firstNonEmpty(apiErr.Message, value)
			case map[string]any:
				apiErr.Code = firstNonEmpty(apiErr.Code, firstString(value, "code", "error_code"))
				apiErr.Message = firstNonEmpty(apiErr.Message, firstString(value, "message", "detail"))
				apiErr.RequestID = firstNonEmpty(apiErr.RequestID, firstString(value, "request_id"))
			}
		}
	}
	if apiErr.Code == "" {
		apiErr.Code = fmt.Sprintf("IDENTITY_HTTP_%d", status)
	}
	if apiErr.Message == "" {
		apiErr.Message = http.StatusText(status)
	}
	return apiErr
}

func firstString(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
