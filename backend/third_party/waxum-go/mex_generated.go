// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// MEXService provides access to Waxum mex endpoints.
type MEXService struct{ client *Client }

// Mutate calls the corresponding Waxum endpoint. OpenAPI operationId: mex_mutate.
func (s *MEXService) Mutate(ctx context.Context, sessionID string, body *MexMutateRequest) (*MexApiResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/mex/mutate"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MexApiResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Query calls the corresponding Waxum endpoint. OpenAPI operationId: mex_query.
func (s *MEXService) Query(ctx context.Context, sessionID string, body *MexQueryRequest) (*MexApiResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/mex/query"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MexApiResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
