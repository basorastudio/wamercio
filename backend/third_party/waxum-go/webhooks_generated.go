// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// WebhooksService provides access to Waxum webhooks endpoints.
type WebhooksService struct{ client *Client }

// List calls the corresponding Waxum endpoint. OpenAPI operationId: list_webhooks.
func (s *WebhooksService) List(ctx context.Context, sessionID string) (*WebhookListResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/webhooks"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result WebhookListResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Register calls the corresponding Waxum endpoint. OpenAPI operationId: register_webhook.
func (s *WebhooksService) Register(ctx context.Context, sessionID string, body *RegisterWebhookRequest) (*WebhookConfig, *Response, error) {
	path := "/api/v1/sessions/{session_id}/webhooks"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result WebhookConfig
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Unregister calls the corresponding Waxum endpoint. OpenAPI operationId: unregister_webhook.
func (s *WebhooksService) Unregister(ctx context.Context, sessionID string, webhookID string) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/webhooks/{webhook_id}"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "webhook_id", formatPathValue(webhookID))
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

// Reenable Manually flip a webhook row back to enabled=true after the auto-disable circuit muted it. Used by operators once the downstream target has been fixed. Also clears 'disabled_at' / 'disabled_reason' so the listing reflects the recovered state. OpenAPI operationId: reenable_webhook.
func (s *WebhooksService) Reenable(ctx context.Context, sessionID string, webhookID string) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/webhooks/{webhook_id}/enable"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "webhook_id", formatPathValue(webhookID))
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
