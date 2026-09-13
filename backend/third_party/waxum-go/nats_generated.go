// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"encoding/json"
	"net/http"
)

// NATSService provides access to Waxum nats endpoints.
type NATSService struct{ client *Client }

// Status Get NATS JetStream status OpenAPI operationId: nats_status.
func (s *NATSService) Status(ctx context.Context) (*NatsStatusResponse, *Response, error) {
	path := "/api/v1/nats/status"
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result NatsStatusResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// ListConsumers List NATS JetStream consumers OpenAPI operationId: nats_list_consumers.
func (s *NATSService) ListConsumers(ctx context.Context, streamName string) (*json.RawMessage, *Response, error) {
	path := "/api/v1/nats/streams/{stream_name}/consumers"
	path = replacePathParam(path, "stream_name", formatPathValue(streamName))
	req, err := s.client.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result json.RawMessage
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// PurgeStream Purge a NATS JetStream stream OpenAPI operationId: nats_purge_stream.
func (s *NATSService) PurgeStream(ctx context.Context, streamName string) (*json.RawMessage, *Response, error) {
	path := "/api/v1/nats/streams/{stream_name}/purge"
	path = replacePathParam(path, "stream_name", formatPathValue(streamName))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, nil)
	if err != nil {
		return nil, nil, err
	}
	var result json.RawMessage
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
