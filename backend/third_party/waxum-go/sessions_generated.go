// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// SessionsService provides access to Waxum sessions endpoints.
type SessionsService struct{ client *Client }

// List calls the corresponding Waxum endpoint. OpenAPI operationId: list_sessions.
func (s *SessionsService) List(ctx context.Context) (*SessionListResponse, *Response, error) {
	path := "/api/v1/sessions"
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result SessionListResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Create calls the corresponding Waxum endpoint. OpenAPI operationId: create_session.
func (s *SessionsService) Create(ctx context.Context, body *CreateSessionRequest) (*CreateSessionResponse, *Response, error) {
	path := "/api/v1/sessions"
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result CreateSessionResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Get calls the corresponding Waxum endpoint. OpenAPI operationId: get_session.
func (s *SessionsService) Get(ctx context.Context, sessionID string) (*SessionInfo, *Response, error) {
	path := "/api/v1/sessions/{session_id}"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result SessionInfo
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Delete calls the corresponding Waxum endpoint. OpenAPI operationId: delete_session.
func (s *SessionsService) Delete(ctx context.Context, sessionID string) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodDelete, path, nil)
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

// Connect calls the corresponding Waxum endpoint. OpenAPI operationId: connect_session.
func (s *SessionsService) Connect(ctx context.Context, sessionID string, body *ConnectRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/connect"
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

// GetDeviceInfo calls the corresponding Waxum endpoint. OpenAPI operationId: get_device_info.
func (s *SessionsService) GetDeviceInfo(ctx context.Context, sessionID string) (*DeviceInfo, *Response, error) {
	path := "/api/v1/sessions/{session_id}/device"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result DeviceInfo
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Disconnect calls the corresponding Waxum endpoint. OpenAPI operationId: disconnect_session.
func (s *SessionsService) Disconnect(ctx context.Context, sessionID string) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/disconnect"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, nil)
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

// Pair calls the corresponding Waxum endpoint. OpenAPI operationId: pair_session.
func (s *SessionsService) Pair(ctx context.Context, sessionID string, body *PairCodeRequest) (*PairCodeResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/pair"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result PairCodeResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// GetQRCode calls the corresponding Waxum endpoint. OpenAPI operationId: get_qr_code.
func (s *SessionsService) GetQRCode(ctx context.Context, sessionID string) (*QrCodeResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/qr"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result QrCodeResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// GetStatus calls the corresponding Waxum endpoint. OpenAPI operationId: get_session_status.
func (s *SessionsService) GetStatus(ctx context.Context, sessionID string) (*SessionStatusResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/status"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result SessionStatusResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
