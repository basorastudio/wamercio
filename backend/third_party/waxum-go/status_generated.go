// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// StatusService provides access to Waxum status endpoints.
type StatusService struct{ client *Client }

// React calls the corresponding Waxum endpoint. OpenAPI operationId: send_status_reaction.
func (s *StatusService) React(ctx context.Context, sessionID string, body *StatusReactionRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/status/react"
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
