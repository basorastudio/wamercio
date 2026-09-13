// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// PrivacyService provides access to Waxum privacy endpoints.
type PrivacyService struct{ client *Client }

// GetSettings calls the corresponding Waxum endpoint. OpenAPI operationId: get_privacy_settings.
func (s *PrivacyService) GetSettings(ctx context.Context, sessionID string) (*PrivacySettingsResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/privacy/settings"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result PrivacySettingsResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
