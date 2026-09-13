// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// NewsletterService provides access to Waxum newsletter endpoints.
type NewsletterService struct{ client *Client }

// SendNewsletterAdminInvite calls the corresponding Waxum endpoint. OpenAPI operationId: send_newsletter_admin_invite.
func (s *NewsletterService) SendNewsletterAdminInvite(ctx context.Context, sessionID string, body *SendNewsletterAdminInviteRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/newsletter-admin-invite"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendNewsletterFollowerInvite calls the corresponding Waxum endpoint. OpenAPI operationId: send_newsletter_follower_invite.
func (s *NewsletterService) SendNewsletterFollowerInvite(ctx context.Context, sessionID string, body *SendNewsletterFollowerInviteRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/newsletter-follower-invite"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendNewsletterForward calls the corresponding Waxum endpoint. OpenAPI operationId: send_newsletter_forward.
func (s *NewsletterService) SendNewsletterForward(ctx context.Context, sessionID string, body *SendNewsletterForwardRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/newsletter-forward"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
