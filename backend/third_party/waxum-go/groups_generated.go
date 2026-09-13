// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// GroupsService provides access to Waxum groups endpoints.
type GroupsService struct{ client *Client }

// List calls the corresponding Waxum endpoint. OpenAPI operationId: list_groups.
func (s *GroupsService) List(ctx context.Context, sessionID string) (*GroupListResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result GroupListResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Create calls the corresponding Waxum endpoint. OpenAPI operationId: create_group.
func (s *GroupsService) Create(ctx context.Context, sessionID string, body *CreateGroupRequest) (*CreateGroupResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result CreateGroupResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Get calls the corresponding Waxum endpoint. OpenAPI operationId: get_group.
func (s *GroupsService) Get(ctx context.Context, sessionID string, groupJID string) (*GroupInfo, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result GroupInfo
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// PromoteParticipants calls the corresponding Waxum endpoint. OpenAPI operationId: promote_participants.
func (s *GroupsService) PromoteParticipants(ctx context.Context, sessionID string, groupJID string, body *ParticipantsRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/admins"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
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

// DemoteParticipants calls the corresponding Waxum endpoint. OpenAPI operationId: demote_participants.
func (s *GroupsService) DemoteParticipants(ctx context.Context, sessionID string, groupJID string, body *ParticipantsRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/admins"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
	req, err := s.client.newRequest(ctx, http.MethodDelete, path, body)
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

// SetDescription calls the corresponding Waxum endpoint. OpenAPI operationId: set_group_description.
func (s *GroupsService) SetDescription(ctx context.Context, sessionID string, groupJID string, body *SetDescriptionRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/description"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
	req, err := s.client.newRequest(ctx, http.MethodPut, path, body)
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

// GetInfo calls the corresponding Waxum endpoint. OpenAPI operationId: get_group_info.
func (s *GroupsService) GetInfo(ctx context.Context, sessionID string, groupJID string) (*GroupInfoCached, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/info"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result GroupInfoCached
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// GetInviteLinkParams contains optional query parameters for GetInviteLink.
type GetInviteLinkParams struct {
	Reset *bool
}

// GetInviteLink calls the corresponding Waxum endpoint. OpenAPI operationId: get_invite_link.
func (s *GroupsService) GetInviteLink(ctx context.Context, sessionID string, groupJID string, params *GetInviteLinkParams) (*InviteLinkResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/invite-link"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	if params != nil {
		q := req.URL.Query()
		if params.Reset != nil {
			q.Set("reset", formatQueryValue(*params.Reset))
		}
		req.URL.RawQuery = q.Encode()
	}
	var result InviteLinkResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// Leave calls the corresponding Waxum endpoint. OpenAPI operationId: leave_group.
func (s *GroupsService) Leave(ctx context.Context, sessionID string, groupJID string) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/leave"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
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

// AddParticipants calls the corresponding Waxum endpoint. OpenAPI operationId: add_participants.
func (s *GroupsService) AddParticipants(ctx context.Context, sessionID string, groupJID string, body *ParticipantsRequest) (*ParticipantsResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/participants"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result ParticipantsResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// RemoveParticipants calls the corresponding Waxum endpoint. OpenAPI operationId: remove_participants.
func (s *GroupsService) RemoveParticipants(ctx context.Context, sessionID string, groupJID string, body *ParticipantsRequest) (*ParticipantsResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/participants"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
	req, err := s.client.newRequest(ctx, http.MethodDelete, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result ParticipantsResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SetSettings calls the corresponding Waxum endpoint. OpenAPI operationId: set_group_settings.
func (s *GroupsService) SetSettings(ctx context.Context, sessionID string, groupJID string, body *SetGroupSettingsRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/settings"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
	req, err := s.client.newRequest(ctx, http.MethodPut, path, body)
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

// SetSubject calls the corresponding Waxum endpoint. OpenAPI operationId: set_group_subject.
func (s *GroupsService) SetSubject(ctx context.Context, sessionID string, groupJID string, body *SetSubjectRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/groups/{group_jid}/subject"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	path = replacePathParam(path, "group_jid", formatPathValue(groupJID))
	req, err := s.client.newRequest(ctx, http.MethodPut, path, body)
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
