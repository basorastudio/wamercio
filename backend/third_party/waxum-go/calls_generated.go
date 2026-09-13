// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// CallsService provides access to Waxum calls endpoints.
type CallsService struct{ client *Client }

// Accept calls the corresponding Waxum endpoint. OpenAPI operationId: accept_call.
func (s *CallsService) Accept(ctx context.Context, sessionID string, body *AcceptCallRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/calls/accept"
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

// Play calls the corresponding Waxum endpoint. OpenAPI operationId: play_call.
func (s *CallsService) Play(ctx context.Context, sessionID string, body *PlayCallRequest) (*PlayCallResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/calls/play"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result PlayCallResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Reject calls the corresponding Waxum endpoint. OpenAPI operationId: reject_call.
func (s *CallsService) Reject(ctx context.Context, sessionID string, body *RejectCallRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/calls/reject"
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

// Ring calls the corresponding Waxum endpoint. OpenAPI operationId: ring_call.
func (s *CallsService) Ring(ctx context.Context, sessionID string, body *RingCallRequest) (*RingCallResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/calls/ring"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result RingCallResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Terminate calls the corresponding Waxum endpoint. OpenAPI operationId: terminate_call.
func (s *CallsService) Terminate(ctx context.Context, sessionID string, body *TerminateCallRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/calls/terminate"
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

// TTS calls the corresponding Waxum endpoint. OpenAPI operationId: tts_call.
func (s *CallsService) TTS(ctx context.Context, sessionID string, body *TtsCallRequest) (*TtsCallResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/calls/tts"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result TtsCallResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
