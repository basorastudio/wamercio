// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// ChatStateService provides access to Waxum chatstate endpoints.
type ChatStateService struct{ client *Client }

// Send calls the corresponding Waxum endpoint. OpenAPI operationId: send_chatstate.
func (s *ChatStateService) Send(ctx context.Context, sessionID string, body *SendChatStateRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/chatstate/send"
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

// Typing calls the corresponding Waxum endpoint. OpenAPI operationId: send_typing.
func (s *ChatStateService) Typing(ctx context.Context, sessionID string, body *TypingRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/chatstate/typing"
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
