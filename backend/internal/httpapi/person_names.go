package httpapi

import (
	"strings"
	"unicode"
)

// normalizePersonName provides consistent, human-friendly capitalization for
// personal names received from forms, QR scans and identity providers.
// It collapses repeated whitespace and supports accented letters, apostrophes
// and hyphenated names without relying on locale-sensitive database functions.
func normalizePersonName(value string) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if value == "" {
		return ""
	}

	runes := []rune(strings.ToLower(value))
	capitalizeNext := true
	for index, current := range runes {
		if unicode.IsLetter(current) {
			if capitalizeNext {
				runes[index] = unicode.ToUpper(current)
			}
			capitalizeNext = false
			continue
		}
		if unicode.IsDigit(current) {
			capitalizeNext = false
			continue
		}
		switch current {
		case ' ', '-', '\'', '’', '.', '/':
			capitalizeNext = true
		default:
			capitalizeNext = false
		}
	}
	return string(runes)
}
