// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// BlockingService provides access to Waxum blocking endpoints.
type BlockingService struct{ client *Client }

// Block calls the corresponding Waxum endpoint. OpenAPI operationId: block_contact.
func (s *BlockingService) Block(ctx context.Context, sessionID string, body *BlockRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/blocking/block"
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

// IsBlocked calls the corresponding Waxum endpoint. OpenAPI operationId: is_blocked.
func (s *BlockingService) IsBlocked(ctx context.Context, sessionID string, jID string) (*BlockStatusResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/blocking/check/{jid}"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "jid", formatPathValue(jID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result BlockStatusResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// List calls the corresponding Waxum endpoint. OpenAPI operationId: get_blocklist.
func (s *BlockingService) List(ctx context.Context, sessionID string) (*BlocklistResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/blocking/list"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result BlocklistResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Unblock calls the corresponding Waxum endpoint. OpenAPI operationId: unblock_contact.
func (s *BlockingService) Unblock(ctx context.Context, sessionID string, body *BlockRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/blocking/unblock"
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
