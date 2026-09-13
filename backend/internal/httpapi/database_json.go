package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
)

// marshalJSONDatabaseValue serializes a value and returns JSON as text.
// Raw []byte values must not be passed directly to pgx for parameters cast as
// json/jsonb because pgx can encode them as bytea. PostgreSQL then receives a
// hexadecimal bytea representation instead of JSON and rejects it with 22P02.
func marshalJSONDatabaseValue(value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return validatedJSONDatabaseValue(encoded)
}

// validatedJSONDatabaseValue converts already encoded JSON to a text database
// parameter after validating it. This keeps JSON parameters consistent across
// direct pgx queries and generated sqlc queries.
func validatedJSONDatabaseValue(encoded []byte) (string, error) {
	trimmed := bytes.TrimSpace(encoded)
	if len(trimmed) == 0 || !json.Valid(trimmed) {
		return "", errors.New("invalid JSON database value")
	}
	return string(trimmed), nil
}
