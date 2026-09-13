// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// ContactsService provides access to Waxum contacts endpoints.
type ContactsService struct{ client *Client }

// ListParams contains optional query parameters for List.
type ListParams struct {
	Q      *string
	Limit  *int32
	Offset *int32
}

// List Paginated dump of locally-cached contacts for a session. Contacts are upserted automatically from appstate sync mutations, push-name updates, contact-notification stanzas, and inbound messages — no separate sync call required. OpenAPI operationId: list_contacts.
func (s *ContactsService) List(ctx context.Context, sessionID string, params *ListParams) (*StoredContactListResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/contacts"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	if params != nil {
		q := req.URL.Query()
		if params.Q != nil {
			q.Set("q", formatQueryValue(*params.Q))
		}
		if params.Limit != nil {
			q.Set("limit", formatQueryValue(*params.Limit))
		}
		if params.Offset != nil {
			q.Set("offset", formatQueryValue(*params.Offset))
		}
		req.URL.RawQuery = q.Encode()
	}
	var result StoredContactListResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// CheckOnWhatsApp calls the corresponding Waxum endpoint. OpenAPI operationId: check_on_whatsapp.
func (s *ContactsService) CheckOnWhatsApp(ctx context.Context, sessionID string, body *CheckOnWhatsAppRequest) (*CheckOnWhatsAppResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/contacts/check"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result CheckOnWhatsAppResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// GetContactInfo calls the corresponding Waxum endpoint. OpenAPI operationId: get_contact_info.
func (s *ContactsService) GetContactInfo(ctx context.Context, sessionID string, body *GetContactInfoRequest) (*ContactInfoResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/contacts/info"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result ContactInfoResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// GetUserInfo calls the corresponding Waxum endpoint. OpenAPI operationId: get_user_info.
func (s *ContactsService) GetUserInfo(ctx context.Context, sessionID string, body *GetUserInfoRequest) (*UserInfoResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/contacts/users"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result UserInfoResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// GetProfilePicture calls the corresponding Waxum endpoint. OpenAPI operationId: get_profile_picture.
func (s *ContactsService) GetProfilePicture(ctx context.Context, sessionID string, jID string) (*ProfilePictureResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/contacts/{jid}/picture"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "jid", formatPathValue(jID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result ProfilePictureResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
