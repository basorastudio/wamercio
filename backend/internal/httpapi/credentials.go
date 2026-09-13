package httpapi

import (
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const defaultBcryptCost = 12

// hashAccessSecret creates a slow, salted hash for human-entered PINs and passwords.
// Bcrypt is intentionally used here instead of the fast SHA-256 helper used for
// request signatures, cache keys and other non-password purposes.
func hashAccessSecret(secret string) (string, error) {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return "", errors.New("access secret is empty")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(secret), defaultBcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// verifyAccessSecret supports transparent migration from the historical
// unsalted SHA-256 representation. The second return value indicates that the
// stored value should be replaced with a modern bcrypt hash after authentication.
func verifyAccessSecret(storedHash, candidate string) (valid bool, needsUpgrade bool) {
	storedHash = strings.TrimSpace(storedHash)
	candidate = strings.TrimSpace(candidate)
	if storedHash == "" || candidate == "" {
		return false, false
	}

	if strings.HasPrefix(storedHash, "$2a$") || strings.HasPrefix(storedHash, "$2b$") || strings.HasPrefix(storedHash, "$2y$") {
		return bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(candidate)) == nil, false
	}

	// Legacy WAMERCIO hashes are exactly 32 SHA-256 bytes encoded as 64 hex chars.
	if len(storedHash) == 64 {
		if _, err := hex.DecodeString(storedHash); err == nil {
			legacy := sha256Hex(candidate)
			return subtle.ConstantTimeCompare([]byte(strings.ToLower(storedHash)), []byte(legacy)) == 1, true
		}
	}
	return false, false
}

func upgradeAccessSecretHash(exec func(string) error, candidate string) error {
	hash, err := hashAccessSecret(candidate)
	if err != nil {
		return err
	}
	return exec(hash)
}

func validateAccessSecret(secret string) error {
	return validateAccessSecretLength(secret, defaultAccessPINLength)
}

func validateAccessSecretLength(secret string, length int) error {
	secret = strings.TrimSpace(secret)
	if len(secret) != length {
		return badRequest(accessPINLengthMessage(length))
	}
	for _, character := range secret {
		if character < '0' || character > '9' {
			return badRequest("El PIN solo puede contener números")
		}
	}
	return nil
}
