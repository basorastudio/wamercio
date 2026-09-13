package waxum

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
)

// UploadMediaRequest describes Waxum's multipart media upload.
type UploadMediaRequest struct {
	Filename  string
	Reader    io.Reader
	MediaType *MediaType
	MIMEType  string
}

// Upload uploads a media file using streaming multipart/form-data. This custom
// method is implemented manually because the current OpenAPI operation omits
// its request body schema.
func (s *MediaService) Upload(ctx context.Context, sessionID string, input UploadMediaRequest) (*UploadMediaResponse, *Response, error) {
	if input.Reader == nil {
		return nil, nil, errors.New("waxum: media reader cannot be nil")
	}
	filename := filepath.Base(input.Filename)
	if filename == "." || filename == "" {
		filename = "media.bin"
	}

	pipeReader, pipeWriter := io.Pipe()
	multipartWriter := multipart.NewWriter(pipeWriter)
	writeResult := make(chan error, 1)
	go func() {
		var writeErr error
		defer func() {
			if closeErr := multipartWriter.Close(); writeErr == nil && closeErr != nil {
				writeErr = closeErr
			}
			if closeErr := pipeWriter.CloseWithError(writeErr); writeErr == nil && closeErr != nil {
				writeErr = closeErr
			}
			writeResult <- writeErr
		}()

		part, err := multipartWriter.CreateFormFile("file", filename)
		if err != nil {
			writeErr = fmt.Errorf("waxum: create multipart file: %w", err)
			return
		}
		if _, err := io.Copy(part, input.Reader); err != nil {
			writeErr = fmt.Errorf("waxum: stream media file: %w", err)
			return
		}
		if input.MediaType != nil {
			if err := multipartWriter.WriteField("media_type", string(*input.MediaType)); err != nil {
				writeErr = fmt.Errorf("waxum: add media_type field: %w", err)
				return
			}
		}
		if input.MIMEType != "" {
			if err := multipartWriter.WriteField("mimetype", input.MIMEType); err != nil {
				writeErr = fmt.Errorf("waxum: add mimetype field: %w", err)
				return
			}
		}
	}()

	path := "/api/v1/sessions/{session_id}/media/upload"
	path = replacePathParam(path, "session_id", sessionID)
	req, err := s.client.newRequestWithBody(ctx, http.MethodPost, path, multipartWriter.FormDataContentType(), pipeReader)
	if err != nil {
		_ = pipeReader.CloseWithError(err)
		<-writeResult
		return nil, nil, err
	}
	var result UploadMediaResponse
	resp, requestErr := s.client.do(req, &result)
	_ = pipeReader.Close()
	writeErr := <-writeResult
	if requestErr != nil {
		return nil, resp, requestErr
	}
	if writeErr != nil {
		return nil, resp, writeErr
	}
	return &result, resp, nil
}

// UploadBytes is a convenience wrapper around Upload.
func (s *MediaService) UploadBytes(ctx context.Context, sessionID, filename string, data []byte, mediaType *MediaType, mimeType string) (*UploadMediaResponse, *Response, error) {
	return s.Upload(ctx, sessionID, UploadMediaRequest{
		Filename:  filename,
		Reader:    bytes.NewReader(data),
		MediaType: mediaType,
		MIMEType:  mimeType,
	})
}
