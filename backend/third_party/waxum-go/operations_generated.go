// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// OperationsService provides access to Waxum operations endpoints.
type OperationsService struct{ client *Client }

// GetHistorySync calls the corresponding Waxum endpoint. OpenAPI operationId: get_history_sync.
func (s *OperationsService) GetHistorySync(ctx context.Context, sessionID string) (*HistorySyncResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/history-sync"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result HistorySyncResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SetHistorySync calls the corresponding Waxum endpoint. OpenAPI operationId: set_history_sync.
func (s *OperationsService) SetHistorySync(ctx context.Context, sessionID string, body *HistorySyncRequest) (*HistorySyncResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/history-sync"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPut, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result HistorySyncResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// GetAutoReconnect calls the corresponding Waxum endpoint. OpenAPI operationId: get_auto_reconnect.
func (s *OperationsService) GetAutoReconnect(ctx context.Context, sessionID string) (*AutoReconnectResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/reconnect"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result AutoReconnectResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SetAutoReconnect calls the corresponding Waxum endpoint. OpenAPI operationId: set_auto_reconnect.
func (s *OperationsService) SetAutoReconnect(ctx context.Context, sessionID string, body *AutoReconnectRequest) (*AutoReconnectResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/reconnect"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPut, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result AutoReconnectResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// ReportSpam calls the corresponding Waxum endpoint. OpenAPI operationId: spam_report.
func (s *OperationsService) ReportSpam(ctx context.Context, sessionID string, body *SpamReportRequest) (*SpamReportResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/spam/report"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result SpamReportResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// PruneExpiredTCTokens calls the corresponding Waxum endpoint. OpenAPI operationId: tctoken_prune.
func (s *OperationsService) PruneExpiredTCTokens(ctx context.Context, sessionID string) (*TcTokenPruneResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/tctoken/expired"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodDelete, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result TcTokenPruneResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// IssueTCTokens calls the corresponding Waxum endpoint. OpenAPI operationId: tctoken_issue.
func (s *OperationsService) IssueTCTokens(ctx context.Context, sessionID string, body *TcTokenIssueRequest) (*TcTokenIssueResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/tctoken/issue"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result TcTokenIssueResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// ListTCTokens calls the corresponding Waxum endpoint. OpenAPI operationId: tctoken_list.
func (s *OperationsService) ListTCTokens(ctx context.Context, sessionID string) (*TcTokenListResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/tctoken/list"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result TcTokenListResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// GetTCToken calls the corresponding Waxum endpoint. OpenAPI operationId: tctoken_get.
func (s *OperationsService) GetTCToken(ctx context.Context, sessionID string, jID string) (*TcTokenGetResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/tctoken/{jid}"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "jid", formatPathValue(jID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result TcTokenGetResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
