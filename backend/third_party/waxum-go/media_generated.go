// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// MediaService provides access to Waxum media endpoints.
type MediaService struct{ client *Client }

// Download calls the corresponding Waxum endpoint. OpenAPI operationId: download_media.
func (s *MediaService) Download(ctx context.Context, sessionID string, body *DownloadMediaRequest) (*DownloadMediaResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/media/download"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result DownloadMediaResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
