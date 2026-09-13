package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
)

const platformLegalSettingKey = "legal"

func defaultPlatformLegalSettings() map[string]any {
	return map[string]any{
		"version":            "1.0",
		"effective_date":     "16 de julio de 2026",
		"responsible_entity": "WAMERCIO",
		"jurisdiction":       "República Dominicana",
		"contact_email":      "soporte@wamercio.com",
		"contact_whatsapp":   "",
		"additional_title":   "Información legal y contacto",
		"additional_text":    "Para solicitudes relacionadas con estos documentos, corrección de datos o ejercicio de derechos, utiliza los canales oficiales de soporte de WAMERCIO.",
		"terms": map[string]any{
			"title": "Términos y condiciones",
			"intro": "Al crear o utilizar una cuenta, aceptas estas reglas de operación y seguridad.",
			"sections": []map[string]any{
				{"title": "Uso de la plataforma", "body": "WAMERCIO facilita la gestión de catálogos, ventas, inventario, clientes, fiado, caja, pedidos y entregas. Cada negocio es responsable de la información, precios, productos y servicios que publica."},
				{"title": "Pagos fuera de línea", "body": "Los pagos de los negocios se realizan en efectivo, por transferencia manual, mediante una terminal fiscal externa o por fiado autorizado. WAMERCIO no procesa, autoriza ni garantiza pagos electrónicos dentro del negocio."},
				{"title": "Cuentas y seguridad", "body": "El usuario debe proteger su PIN, verificar sus datos y notificar cualquier acceso no autorizado. Las acciones realizadas desde una cuenta autenticada pueden registrarse para fines de seguridad y auditoría."},
				{"title": "Ventas, devoluciones y fiado", "body": "Cada negocio define sus políticas comerciales. Las anulaciones, devoluciones, abonos y cierres de caja deben ser registrados por personal autorizado y pueden conservarse como historial operativo."},
				{"title": "Disponibilidad", "body": "La plataforma puede requerir mantenimiento, actualizaciones o interrupciones controladas. Se aplican respaldos y medidas de recuperación, pero ningún sistema puede garantizar disponibilidad absoluta."},
			},
		},
		"privacy": map[string]any{
			"title": "Política de privacidad y tratamiento de datos",
			"intro": "Esta política explica cómo se recopilan, utilizan, protegen y conservan los datos personales dentro de WAMERCIO.",
			"sections": []map[string]any{
				{"title": "Datos recopilados", "body": "Podemos tratar nombre, WhatsApp, cédula, direcciones, historial de pedidos, movimientos de fiado y datos técnicos necesarios para operar y proteger la plataforma."},
				{"title": "Finalidad del tratamiento", "body": "Los datos se utilizan para identificar usuarios, procesar pedidos, coordinar entregas, prevenir fraude, recuperar cuentas, generar reportes y cumplir obligaciones operativas o legales."},
				{"title": "Separación de negocios", "body": "Los datos operativos se aíslan por negocio. La identidad global del cliente permite utilizar WAMERCIO en distintos negocios sin crear cuentas duplicadas, manteniendo controles de acceso."},
				{"title": "Conservación y seguridad", "body": "Se aplican cifrado de transporte, controles de acceso, registros de auditoría y respaldos. Los datos se conservan durante el tiempo necesario para la operación, seguridad y cumplimiento aplicable."},
				{"title": "Derechos del titular", "body": "El usuario puede solicitar acceso, corrección, actualización o revisión de sus datos mediante los canales oficiales de soporte de WAMERCIO."},
			},
		},
	}
}

func cloneLegalMap(source map[string]any) map[string]any {
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func mergePlatformLegalSettings(raw map[string]any) map[string]any {
	defaults := defaultPlatformLegalSettings()
	merged := cloneLegalMap(defaults)
	for key, value := range raw {
		merged[key] = value
	}
	for _, key := range []string{"terms", "privacy"} {
		defaultDocument, _ := defaults[key].(map[string]any)
		resultDocument := cloneLegalMap(defaultDocument)
		if rawDocument, ok := raw[key].(map[string]any); ok {
			for documentKey, value := range rawDocument {
				resultDocument[documentKey] = value
			}
		}
		merged[key] = resultDocument
	}
	return merged
}

func (s *Server) readPublicLegalSettings(ctx context.Context) (map[string]any, error) {
	defaults := defaultPlatformLegalSettings()
	if s.tenantManager == nil {
		return defaults, nil
	}
	var rawBytes []byte
	err := s.tenantManager.CoreDB().QueryRow(ctx, `SELECT value FROM platform_settings WHERE key=$1`, platformLegalSettingKey).Scan(&rawBytes)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return defaults, nil
		}
		return nil, err
	}
	var raw map[string]any
	if len(rawBytes) > 0 {
		if err := json.Unmarshal(rawBytes, &raw); err != nil {
			return defaults, nil
		}
	}
	return mergePlatformLegalSettings(raw), nil
}

func (s *Server) publicLegalSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	legal, err := s.readPublicLegalSettings(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"legal": legal,
	})
}
