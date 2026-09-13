package waxum

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"reflect"
	"regexp"
	"strings"
)

var nonDigit = regexp.MustCompile(`\D+`)

// Ptr returns a pointer to v and is useful for optional request fields.
func Ptr[T any](v T) *T { return &v }

// MediaFromURL creates media data backed by a public or server-reachable URL.
func MediaFromURL(rawURL string) MediaData { return MediaData{URL: Ptr(rawURL)} }

// MediaFromBytes creates media data backed by base64 content.
func MediaFromBytes(data []byte, mimeType string) MediaData {
	return MediaData{Data: Ptr(base64.StdEncoding.EncodeToString(data)), MIMEType: Ptr(mimeType)}
}

// UserJID converts a phone number to a WhatsApp user JID. It intentionally
// performs only punctuation cleanup and does not infer a country code.
func UserJID(phone string) string {
	if strings.Contains(phone, "@") {
		return phone
	}
	digits := nonDigit.ReplaceAllString(phone, "")
	if digits == "" {
		return ""
	}
	return digits + "@s.whatsapp.net"
}

func replacePathParam(path, name, value string) string {
	return strings.ReplaceAll(path, "{"+name+"}", url.PathEscape(value))
}

func formatPathValue(v any) string { return fmt.Sprint(v) }

func formatQueryValue(v any) string {
	rv := reflect.ValueOf(v)
	if rv.IsValid() && rv.Kind() == reflect.Bool {
		if rv.Bool() {
			return "true"
		}
		return "false"
	}
	return fmt.Sprint(v)
}
