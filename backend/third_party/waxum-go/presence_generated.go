// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// PresenceService provides access to Waxum presence endpoints.
type PresenceService struct{ client *Client }

// Set calls the corresponding Waxum endpoint. OpenAPI operationId: set_presence.
func (s *PresenceService) Set(ctx context.Context, sessionID string, body *SetPresenceRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/presence/set"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result SuccessResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Subscribe calls the corresponding Waxum endpoint. OpenAPI operationId: subscribe_presence.
func (s *PresenceService) Subscribe(ctx context.Context, sessionID string, body *SubscribePresenceRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/presence/subscribe"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result SuccessResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
