package waxum

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestClientListSessions(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/v1/sessions" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Fatalf("unexpected authorization: %q", got)
		}
		if got := r.Header.Get("User-Agent"); !strings.HasPrefix(got, "waxum-go/") {
			t.Fatalf("unexpected user agent: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"sessions":[{"id":"main","status":"logged_in","created_at":1,"updated_at":2,"is_logged_in":true}],"total":1}`)
	}))
	defer server.Close()

	client, err := NewClient("test-token", WithBaseURL(server.URL))
	if err != nil {
		t.Fatal(err)
	}
	result, response, err := client.Sessions.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || result.Total != 1 || result.Sessions[0].ID != "main" {
		t.Fatalf("unexpected result: %#v %#v", response, result)
	}
}

func TestAPIError(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Request-ID", "req-123")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":"Unauthorized","message":"Invalid token"}`)
	}))
	defer server.Close()
	client, _ := NewClient("bad", WithBaseURL(server.URL))
	_, _, err := client.Sessions.List(context.Background())
	if err == nil {
		t.Fatal("expected error")
	}
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.StatusCode != http.StatusUnauthorized || apiErr.Code != "Unauthorized" || apiErr.Message != "Invalid token" || apiErr.RequestID != "req-123" {
		t.Fatalf("unexpected API error: %#v", apiErr)
	}
	if !IsStatus(err, http.StatusUnauthorized) {
		t.Fatal("IsStatus returned false")
	}
}

func TestRetryGET(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = io.WriteString(w, `{"sessions":[],"total":0}`)
	}))
	defer server.Close()
	client, err := NewClient("token", WithBaseURL(server.URL), WithRetry(RetryConfig{
		MaxAttempts: 2, InitialBackoff: time.Millisecond, MaxBackoff: time.Millisecond,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := client.Sessions.List(context.Background()); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatalf("expected 2 calls, got %d", calls.Load())
	}
}

func TestCreateSessionJSON(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body CreateSessionRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.ID == nil || *body.ID != "store-1" {
			t.Fatalf("unexpected body: %#v", body)
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"session":{"id":"store-1","status":"connecting","created_at":1,"updated_at":1,"is_logged_in":false}}`)
	}))
	defer server.Close()
	client, _ := NewClient("token", WithBaseURL(server.URL))
	result, _, err := client.Sessions.Create(context.Background(), &CreateSessionRequest{ID: Ptr("store-1")})
	if err != nil {
		t.Fatal(err)
	}
	if result.Session.ID != "store-1" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestUploadMediaMultipart(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/sessions/main/media/upload" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		reader, err := r.MultipartReader()
		if err != nil {
			t.Fatal(err)
		}
		fields := map[string]string{}
		for {
			part, err := reader.NextPart()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				t.Fatal(err)
			}
			data, _ := io.ReadAll(part)
			fields[part.FormName()] = string(data)
		}
		if fields["file"] != "hello" || fields["media_type"] != "image" || fields["mimetype"] != "text/plain" {
			t.Fatalf("unexpected multipart fields: %#v", fields)
		}
		_, _ = io.WriteString(w, `{"url":"u","direct_path":"d","media_key":"k","file_sha256":"s","file_enc_sha256":"e","file_length":5,"media_type":"image","mimetype":"text/plain"}`)
	}))
	defer server.Close()
	client, _ := NewClient("token", WithBaseURL(server.URL))
	mediaType := MediaTypeImage
	result, _, err := client.Media.Upload(context.Background(), "main", UploadMediaRequest{
		Filename: "hello.txt", Reader: strings.NewReader("hello"), MediaType: &mediaType, MIMEType: "text/plain",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.FileLength != 5 {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestServicesInitialized(t *testing.T) {
	t.Parallel()
	client, err := NewClient("token")
	if err != nil {
		t.Fatal(err)
	}
	services := []any{client.Sessions, client.Messages, client.Groups, client.Contacts, client.Media, client.Calls, client.Webhooks, client.Presence, client.ChatState, client.Privacy, client.Blocking, client.MEX, client.Newsletter, client.Operations, client.NATS, client.Status}
	for i, service := range services {
		if service == nil {
			t.Fatalf("service %d is nil", i)
		}
	}
}

func TestSessionsListRetriesCollectionWithTrailingSlashOn404(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if r.URL.Path == "/api/v1/sessions" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path != "/api/v1/sessions/" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"sessions":[],"total":0}`)
	}))
	defer server.Close()

	client, err := NewClient("secret", WithBaseURL(server.URL))
	if err != nil {
		t.Fatal(err)
	}
	result, _, err := client.Sessions.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 0 {
		t.Fatalf("expected zero sessions, got %d", result.Total)
	}
	if len(paths) != 2 || paths[0] != "/api/v1/sessions" || paths[1] != "/api/v1/sessions/" {
		t.Fatalf("unexpected compatibility sequence: %#v", paths)
	}
}

func TestSessionsCreateReplaysBodyForTrailingSlashCompatibility(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if r.URL.Path == "/api/v1/sessions" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path != "/api/v1/sessions/" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		var body CreateSessionRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.ID == nil || *body.ID != "WAMERCIO" {
			t.Fatalf("request body was not replayed: %#v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"session":{"id":"WAMERCIO","status":"connecting","created_at":1,"updated_at":1,"is_logged_in":false}}`)
	}))
	defer server.Close()

	client, err := NewClient("secret", WithBaseURL(server.URL))
	if err != nil {
		t.Fatal(err)
	}
	result, _, err := client.Sessions.Create(context.Background(), &CreateSessionRequest{ID: Ptr("WAMERCIO")})
	if err != nil {
		t.Fatal(err)
	}
	if result.Session.ID != "WAMERCIO" {
		t.Fatalf("unexpected session id %q", result.Session.ID)
	}
	if len(paths) != 2 {
		t.Fatalf("expected canonical request plus compatibility retry, got %#v", paths)
	}
}
