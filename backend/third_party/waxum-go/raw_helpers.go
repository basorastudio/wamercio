package waxum

import (
	"context"
	"net/http"
)

// DownloadCallRecording downloads the WAV produced by calls started with record=true.
// The endpoint is documented by Waxum but is not present in the supplied OpenAPI file.
func (s *CallsService) DownloadCallRecording(ctx context.Context, sessionID, callID string) ([]byte, *Response, error) {
	path := "/api/v1/sessions/{session_id}/calls/{call_id}/recording.wav"
	path = replacePathParam(path, "session_id", sessionID)
	path = replacePathParam(path, "call_id", callID)
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Accept", "audio/wav")
	var result []byte
	resp, err := s.client.do(req, &result)
	return result, resp, err
}
