package httpx

import (
	"encoding/json"
	"net/http"
)

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]any{"ok": false, "error": msg})
}
func Decode(r *http.Request, v any) error { return json.NewDecoder(r.Body).Decode(v) }
