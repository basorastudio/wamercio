package identity

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL, apiKey, clientID, applicationDomain, hashSecret string
	http                                                     *http.Client
}

func New(baseURL, apiKey, clientID, applicationDomain, hashSecret string) *Client {
	return &Client{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  strings.TrimSpace(apiKey), clientID: strings.TrimSpace(clientID),
		applicationDomain: strings.TrimSpace(applicationDomain), hashSecret: hashSecret,
		http: &http.Client{Timeout: 12 * time.Second},
	}
}

func (c *Client) Configured() bool { return c.baseURL != "" && c.apiKey != "" }

type Person struct {
	Cedula, NombreCompleto, Nombres, Apellidos, PrimerNombre, SegundoNombre, PrimerApellido, SegundoApellido string
	FechaNacimiento, Sexo                                                                                    string
	SeparacionNombreConfiable                                                                                bool
}

type Company struct {
	RNC, RazonSocial, NombreComercial, Estado string
	Activa                                    bool
}

type Verification struct {
	TipoSujeto, TipoDocumento, Documento, Contexto                                 string
	Valida, Encontrada, PuedeAutocompletar, RequiereConfirmacion, PuedeRegistrarse bool
	Motivo, Fuente, RequestID                                                      string
	Person                                                                         *Person
	Company                                                                        *Company
}

type apiResponse struct {
	Success bool `json:"success"`
	Data    struct {
		TipoSujeto           string `json:"tipo_sujeto"`
		TipoDocumento        string `json:"tipo_documento"`
		Documento            string `json:"documento"`
		Contexto             string `json:"contexto"`
		Valida               bool   `json:"valida"`
		Encontrada           bool   `json:"encontrada"`
		PuedeAutocompletar   bool   `json:"puede_autocompletar"`
		RequiereConfirmacion bool   `json:"requiere_confirmacion"`
		PuedeRegistrarse     bool   `json:"puede_registrarse"`
		Motivo               string `json:"motivo"`
		Fuente               string `json:"fuente"`
		Persona              *struct {
			Cedula                    string `json:"cedula"`
			NombreCompleto            string `json:"nombre_completo"`
			Nombres                   string `json:"nombres"`
			Apellidos                 string `json:"apellidos"`
			PrimerNombre              string `json:"primer_nombre"`
			SegundoNombre             string `json:"segundo_nombre"`
			PrimerApellido            string `json:"primer_apellido"`
			SegundoApellido           string `json:"segundo_apellido"`
			FechaNacimiento           string `json:"fecha_nacimiento"`
			Sexo                      string `json:"sexo"`
			SeparacionNombreConfiable bool   `json:"separacion_nombre_confiable"`
		} `json:"persona"`
		Empresa *struct {
			RNC             string `json:"rnc"`
			RazonSocial     string `json:"razon_social"`
			NombreComercial string `json:"nombre_comercial"`
			Estado          string `json:"estado"`
			Activa          bool   `json:"activa"`
		} `json:"empresa"`
	} `json:"data"`
	Meta struct {
		RequestID string `json:"request_id"`
	} `json:"meta"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) Verify(ctx context.Context, subjectType, document, usageContext, requestID string) (Verification, error) {
	if !c.Configured() {
		return Verification{}, errors.New("Identidad API no está configurada")
	}
	subjectType = strings.TrimSpace(subjectType)
	if subjectType != "persona" && subjectType != "empresa" {
		return Verification{}, errors.New("tipo de sujeto inválido")
	}
	document = Digits(document)
	if document == "" {
		return Verification{}, errors.New("documento requerido")
	}
	body, _ := json.Marshal(map[string]any{"tipo_sujeto": subjectType, "documento": document, "contexto": usageContext})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v1/identidad/verificar", bytes.NewReader(body))
	if err != nil {
		return Verification{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", c.apiKey)
	if c.clientID != "" {
		req.Header.Set("X-Client-ID", c.clientID)
	}
	if c.applicationDomain != "" {
		req.Header.Set("X-Application-Domain", c.applicationDomain)
	}
	if usageContext != "" {
		req.Header.Set("X-Usage-Context", usageContext)
	}
	if requestID != "" {
		req.Header.Set("X-Request-ID", requestID)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return Verification{}, fmt.Errorf("Identidad no disponible: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var out apiResponse
	_ = json.Unmarshal(b, &out)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !out.Success {
		msg := "no fue posible verificar el documento"
		if out.Error != nil && strings.TrimSpace(out.Error.Message) != "" {
			msg = out.Error.Message
		}
		switch resp.StatusCode {
		case 404:
			msg = "documento no encontrado"
		case 422:
			msg = "el documento no supera la validación de checksum"
		case 429:
			msg = "se alcanzó temporalmente el límite de consultas de identidad"
		case 503, 504:
			msg = "el servicio de identidad está temporalmente no disponible"
		}
		return Verification{}, errors.New(msg)
	}
	v := Verification{TipoSujeto: out.Data.TipoSujeto, TipoDocumento: out.Data.TipoDocumento, Documento: out.Data.Documento, Contexto: out.Data.Contexto, Valida: out.Data.Valida, Encontrada: out.Data.Encontrada, PuedeAutocompletar: out.Data.PuedeAutocompletar, RequiereConfirmacion: out.Data.RequiereConfirmacion, PuedeRegistrarse: out.Data.PuedeRegistrarse, Motivo: out.Data.Motivo, Fuente: out.Data.Fuente, RequestID: out.Meta.RequestID}
	if out.Data.Persona != nil {
		p := out.Data.Persona
		v.Person = &Person{Cedula: p.Cedula, NombreCompleto: p.NombreCompleto, Nombres: p.Nombres, Apellidos: p.Apellidos, PrimerNombre: p.PrimerNombre, SegundoNombre: p.SegundoNombre, PrimerApellido: p.PrimerApellido, SegundoApellido: p.SegundoApellido, FechaNacimiento: p.FechaNacimiento, Sexo: p.Sexo, SeparacionNombreConfiable: p.SeparacionNombreConfiable}
	}
	if out.Data.Empresa != nil {
		e := out.Data.Empresa
		v.Company = &Company{RNC: e.RNC, RazonSocial: e.RazonSocial, NombreComercial: e.NombreComercial, Estado: e.Estado, Activa: e.Activa}
	}
	return v, nil
}

func Digits(v string) string {
	var b strings.Builder
	for _, r := range v {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func (c *Client) DocumentHash(document string) string {
	key := []byte(c.hashSecret)
	if len(key) == 0 {
		key = []byte("wamercio-identity")
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(Digits(document)))
	return hex.EncodeToString(mac.Sum(nil))
}

func MaskDocument(document string) string {
	d := Digits(document)
	if len(d) <= 4 {
		return strings.Repeat("*", len(d))
	}
	return strings.Repeat("*", len(d)-4) + d[len(d)-4:]
}
