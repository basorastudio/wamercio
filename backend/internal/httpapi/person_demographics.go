package httpapi

import (
	"strings"
	"time"
)

func normalizePersonBirthDate(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	for _, layout := range []string{"2006-01-02", "02/01/2006", "02-01-2006"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.Format("2006-01-02")
		}
	}
	return value
}

func normalizePersonGender(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "M", "MASCULINO", "MALE", "HOMBRE":
		return "M"
	case "F", "FEMENINO", "FEMALE", "MUJER":
		return "F"
	default:
		return strings.ToUpper(strings.TrimSpace(value))
	}
}

func validatePersonDemographics(birthDate, gender string) error {
	birthDate = normalizePersonBirthDate(birthDate)
	gender = normalizePersonGender(gender)
	if birthDate != "" {
		parsed, err := time.Parse("2006-01-02", birthDate)
		if err != nil {
			return badRequest("La fecha de nacimiento debe tener el formato DD/MM/AAAA")
		}
		now := time.Now()
		if parsed.After(now) || parsed.Year() < 1900 {
			return badRequest("La fecha de nacimiento no es válida")
		}
	}
	if gender != "" && gender != "M" && gender != "F" {
		return badRequest("Selecciona un género válido")
	}
	return nil
}
