package waxum

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	// DefaultBaseURL is the default address used by a local Waxum installation.
	DefaultBaseURL = "http://localhost:3451"
	// SDKVersion is the release version of this Go SDK.
	SDKVersion = "0.1.1"
	// APISpecVersion is the Waxum OpenAPI info.version used to generate this SDK.
	APISpecVersion               = "0.1.0"
	defaultMaxResponseBody int64 = 32 << 20 // 32 MiB
)

// RetryConfig controls automatic retry behavior. Retries are disabled by default.
type RetryConfig struct {
	MaxAttempts        int
	InitialBackoff     time.Duration
	MaxBackoff         time.Duration
	RetryUnsafeMethods bool
}

// Client is a concurrency-safe Waxum API client after construction.
type Client struct {
	baseURL         *url.URL
	token           string
	httpClient      *http.Client
	userAgent       string
	defaultHeaders  http.Header
	maxResponseBody int64
	retry           RetryConfig

	Sessions   *SessionsService
	Messages   *MessagesService
	Groups     *GroupsService
	Contacts   *ContactsService
	Media      *MediaService
	Calls      *CallsService
	Webhooks   *WebhooksService
	Presence   *PresenceService
	ChatState  *ChatStateService
	Privacy    *PrivacyService
	Blocking   *BlockingService
	MEX        *MEXService
	Newsletter *NewsletterService
	Operations *OperationsService
	NATS       *NATSService
	Status     *StatusService
}

// Option customizes a Client.
type Option func(*Client) error

// NewClient creates a Waxum API client. Token may be a static SUPERADMIN_TOKEN
// or a JWT accepted by the Waxum server.
func NewClient(token string, options ...Option) (*Client, error) {
	base, _ := url.Parse(DefaultBaseURL)
	c := &Client{
		baseURL:         base,
		token:           strings.TrimSpace(token),
		httpClient:      &http.Client{Timeout: 30 * time.Second},
		userAgent:       "waxum-go/" + SDKVersion,
		defaultHeaders:  make(http.Header),
		maxResponseBody: defaultMaxResponseBody,
		retry: RetryConfig{
			MaxAttempts:    1,
			InitialBackoff: 250 * time.Millisecond,
			MaxBackoff:     3 * time.Second,
		},
	}
	for _, option := range options {
		if option == nil {
			continue
		}
		if err := option(c); err != nil {
			return nil, err
		}
	}
	if c.baseURL == nil || c.baseURL.Scheme == "" || c.baseURL.Host == "" {
		return nil, errors.New("waxum: base URL must include scheme and host")
	}
	if c.httpClient == nil {
		return nil, errors.New("waxum: HTTP client cannot be nil")
	}
	if c.retry.MaxAttempts < 1 {
		c.retry.MaxAttempts = 1
	}

	c.Sessions = &SessionsService{client: c}
	c.Messages = &MessagesService{client: c}
	c.Groups = &GroupsService{client: c}
	c.Contacts = &ContactsService{client: c}
	c.Media = &MediaService{client: c}
	c.Calls = &CallsService{client: c}
	c.Webhooks = &WebhooksService{client: c}
	c.Presence = &PresenceService{client: c}
	c.ChatState = &ChatStateService{client: c}
	c.Privacy = &PrivacyService{client: c}
	c.Blocking = &BlockingService{client: c}
	c.MEX = &MEXService{client: c}
	c.Newsletter = &NewsletterService{client: c}
	c.Operations = &OperationsService{client: c}
	c.NATS = &NATSService{client: c}
	c.Status = &StatusService{client: c}
	return c, nil
}

// WithBaseURL changes the Waxum server address.
func WithBaseURL(rawURL string) Option {
	return func(c *Client) error {
		u, err := url.Parse(strings.TrimRight(strings.TrimSpace(rawURL), "/"))
		if err != nil {
			return fmt.Errorf("waxum: parse base URL: %w", err)
		}
		if u.Scheme == "" || u.Host == "" {
			return errors.New("waxum: base URL must include scheme and host")
		}
		c.baseURL = u
		return nil
	}
}

// WithHTTPClient injects a custom HTTP client.
func WithHTTPClient(httpClient *http.Client) Option {
	return func(c *Client) error {
		if httpClient == nil {
			return errors.New("waxum: HTTP client cannot be nil")
		}
		c.httpClient = httpClient
		return nil
	}
}

// WithTimeout sets the timeout on the SDK-owned HTTP client.
func WithTimeout(timeout time.Duration) Option {
	return func(c *Client) error {
		if timeout <= 0 {
			return errors.New("waxum: timeout must be greater than zero")
		}
		clone := *c.httpClient
		clone.Timeout = timeout
		c.httpClient = &clone
		return nil
	}
}

// WithUserAgent changes the User-Agent sent with every request.
func WithUserAgent(userAgent string) Option {
	return func(c *Client) error {
		if strings.TrimSpace(userAgent) == "" {
			return errors.New("waxum: user agent cannot be empty")
		}
		c.userAgent = strings.TrimSpace(userAgent)
		return nil
	}
}

// WithHeader adds a header to every request. Authorization, Content-Type and
// User-Agent remain controlled by the SDK for standard calls.
func WithHeader(name, value string) Option {
	return func(c *Client) error {
		name = http.CanonicalHeaderKey(strings.TrimSpace(name))
		if name == "" {
			return errors.New("waxum: header name cannot be empty")
		}
		c.defaultHeaders.Set(name, value)
		return nil
	}
}

// WithMaxResponseBody sets the maximum response body accepted by the client.
func WithMaxResponseBody(bytes int64) Option {
	return func(c *Client) error {
		if bytes <= 0 {
			return errors.New("waxum: max response body must be greater than zero")
		}
		c.maxResponseBody = bytes
		return nil
	}
}

// WithRetry enables bounded retries. By default only idempotent methods are
// retried for network failures, HTTP 429, 502, 503 and 504.
func WithRetry(config RetryConfig) Option {
	return func(c *Client) error {
		if config.MaxAttempts < 1 {
			return errors.New("waxum: retry MaxAttempts must be at least 1")
		}
		if config.InitialBackoff <= 0 {
			config.InitialBackoff = 250 * time.Millisecond
		}
		if config.MaxBackoff <= 0 {
			config.MaxBackoff = 3 * time.Second
		}
		if config.MaxBackoff < config.InitialBackoff {
			return errors.New("waxum: retry MaxBackoff cannot be less than InitialBackoff")
		}
		c.retry = config
		return nil
	}
}

// BaseURL returns a copy of the configured server URL.
func (c *Client) BaseURL() url.URL { return *c.baseURL }

// Response contains HTTP metadata and the raw response body.
type Response struct {
	StatusCode int
	Status     string
	Header     http.Header
	RequestID  string
	RawBody    []byte
}

// APIError is returned for non-2xx Waxum responses.
type APIError struct {
	StatusCode int
	Method     string
	URL        string
	Code       string
	Message    string
	RequestID  string
	Body       []byte
}

func (e *APIError) Error() string {
	message := e.Message
	if message == "" {
		message = http.StatusText(e.StatusCode)
	}
	if e.Code != "" && !strings.EqualFold(e.Code, message) {
		message = e.Code + ": " + message
	}
	return fmt.Sprintf("waxum: %s %s returned HTTP %d: %s", e.Method, e.URL, e.StatusCode, message)
}

// IsStatus reports whether err is an APIError with the requested status code.
func IsStatus(err error, statusCode int) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == statusCode
}

func (c *Client) newRequest(ctx context.Context, method, path string, body any) (*http.Request, error) {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("waxum: encode request body: %w", err)
		}
		reader = bytes.NewReader(payload)
	}
	return c.newRequestWithBody(ctx, method, path, "application/json", reader)
}

func (c *Client) newRequestWithBody(ctx context.Context, method, path, contentType string, body io.Reader) (*http.Request, error) {
	if ctx == nil {
		return nil, errors.New("waxum: context cannot be nil")
	}
	rel, err := url.Parse(path)
	if err != nil {
		return nil, fmt.Errorf("waxum: parse request path: %w", err)
	}
	endpoint := c.baseURL.ResolveReference(rel)
	req, err := http.NewRequestWithContext(ctx, method, endpoint.String(), body)
	if err != nil {
		return nil, fmt.Errorf("waxum: create request: %w", err)
	}
	for name, values := range c.defaultHeaders {
		for _, value := range values {
			req.Header.Add(name, value)
		}
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	if c.userAgent != "" {
		req.Header.Set("User-Agent", c.userAgent)
	}
	if body != nil && contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("Accept", "application/json")
	return req, nil
}

func (c *Client) do(req *http.Request, out any) (*Response, error) {
	if req == nil {
		return nil, errors.New("waxum: request cannot be nil")
	}
	attempts := c.retry.MaxAttempts
	if attempts < 1 {
		attempts = 1
	}
	if !c.retry.RetryUnsafeMethods && !isIdempotent(req.Method) {
		attempts = 1
	}

	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if attempt > 1 && req.Body != nil && req.Body != http.NoBody {
			if req.GetBody == nil {
				break
			}
			body, err := req.GetBody()
			if err != nil {
				return nil, fmt.Errorf("waxum: recreate request body: %w", err)
			}
			req.Body = body
		}

		httpResp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("waxum: execute request: %w", err)
			if attempt < attempts && req.Context().Err() == nil {
				if err := sleepContext(req.Context(), c.backoff(attempt, "")); err != nil {
					return nil, err
				}
				continue
			}
			return nil, lastErr
		}

		if attempt < attempts && isRetryStatus(httpResp.StatusCode) {
			retryAfter := httpResp.Header.Get("Retry-After")
			_, _ = io.Copy(io.Discard, io.LimitReader(httpResp.Body, 64<<10))
			_ = httpResp.Body.Close()
			if err := sleepContext(req.Context(), c.backoff(attempt, retryAfter)); err != nil {
				return nil, err
			}
			continue
		}
		resp, decodeErr := c.decodeResponse(req, httpResp, out)
		if decodeErr != nil && shouldRetrySessionCollectionWithTrailingSlash(req, decodeErr) {
			fallbackReq, fallbackErr := cloneRequestWithTrailingSlash(req)
			if fallbackErr != nil {
				return resp, fallbackErr
			}
			return c.do(fallbackReq, out)
		}
		return resp, decodeErr
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, errors.New("waxum: request could not be retried because its body is not replayable")
}

func shouldRetrySessionCollectionWithTrailingSlash(req *http.Request, err error) bool {
	if req == nil || req.URL == nil || req.URL.Path != "/api/v1/sessions" {
		return false
	}
	return IsStatus(err, http.StatusNotFound)
}

func cloneRequestWithTrailingSlash(req *http.Request) (*http.Request, error) {
	if req == nil || req.URL == nil {
		return nil, errors.New("waxum: request URL cannot be nil")
	}
	clone := req.Clone(req.Context())
	endpoint := *req.URL
	endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/"
	clone.URL = &endpoint
	if req.Body != nil && req.Body != http.NoBody {
		if req.GetBody == nil {
			return nil, errors.New("waxum: cannot replay request body for trailing-slash compatibility")
		}
		body, err := req.GetBody()
		if err != nil {
			return nil, fmt.Errorf("waxum: recreate compatibility request body: %w", err)
		}
		clone.Body = body
		clone.GetBody = req.GetBody
	}
	return clone, nil
}

func (c *Client) decodeResponse(req *http.Request, httpResp *http.Response, out any) (*Response, error) {
	defer httpResp.Body.Close()
	limited := io.LimitReader(httpResp.Body, c.maxResponseBody+1)
	payload, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("waxum: read response body: %w", err)
	}
	if int64(len(payload)) > c.maxResponseBody {
		return nil, fmt.Errorf("waxum: response body exceeds configured limit of %d bytes", c.maxResponseBody)
	}
	resp := &Response{
		StatusCode: httpResp.StatusCode,
		Status:     httpResp.Status,
		Header:     httpResp.Header.Clone(),
		RequestID:  requestID(httpResp.Header),
		RawBody:    append([]byte(nil), payload...),
	}
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		apiErr := &APIError{
			StatusCode: httpResp.StatusCode,
			Method:     req.Method,
			URL:        req.URL.String(),
			RequestID:  resp.RequestID,
			Body:       append([]byte(nil), payload...),
		}
		var envelope struct {
			Error   string `json:"error"`
			Code    string `json:"code"`
			Message string `json:"message"`
			Detail  string `json:"detail"`
		}
		if json.Unmarshal(payload, &envelope) == nil {
			apiErr.Code = firstNonEmpty(envelope.Code, envelope.Error)
			apiErr.Message = firstNonEmpty(envelope.Message, envelope.Detail)
		}
		if apiErr.Message == "" {
			apiErr.Message = strings.TrimSpace(string(payload))
		}
		return resp, apiErr
	}
	if out == nil || len(bytes.TrimSpace(payload)) == 0 || httpResp.StatusCode == http.StatusNoContent {
		return resp, nil
	}
	switch target := out.(type) {
	case *[]byte:
		*target = append((*target)[:0], payload...)
		return resp, nil
	case io.Writer:
		_, err := target.Write(payload)
		if err != nil {
			return resp, fmt.Errorf("waxum: write response: %w", err)
		}
		return resp, nil
	default:
		if err := json.Unmarshal(payload, out); err != nil {
			return resp, fmt.Errorf("waxum: decode response JSON: %w", err)
		}
		return resp, nil
	}
}

// Raw performs an authenticated request to an endpoint not yet represented by
// a generated service method. Path may include a query string.
func (c *Client) Raw(ctx context.Context, method, path string, body, out any) (*Response, error) {
	req, err := c.newRequest(ctx, method, path, body)
	if err != nil {
		return nil, err
	}
	return c.do(req, out)
}

// Health calls the public Waxum health endpoint.
func (c *Client) Health(ctx context.Context) (json.RawMessage, *Response, error) {
	var result json.RawMessage
	resp, err := c.Raw(ctx, http.MethodGet, "/health", nil, &result)
	return result, resp, err
}

func (c *Client) backoff(attempt int, retryAfter string) time.Duration {
	if retryAfter != "" {
		if seconds, err := strconv.Atoi(retryAfter); err == nil && seconds >= 0 {
			return time.Duration(seconds) * time.Second
		}
		if when, err := http.ParseTime(retryAfter); err == nil {
			if d := time.Until(when); d > 0 {
				return d
			}
		}
	}
	d := c.retry.InitialBackoff
	for i := 1; i < attempt; i++ {
		d *= 2
		if d >= c.retry.MaxBackoff {
			d = c.retry.MaxBackoff
			break
		}
	}
	if d <= 0 {
		return 0
	}
	jitter := time.Duration(rand.Int63n(int64(d/4 + 1)))
	return d + jitter
}

func sleepContext(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func isIdempotent(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodPut, http.MethodDelete:
		return true
	default:
		return false
	}
}

func isRetryStatus(code int) bool {
	return code == http.StatusTooManyRequests || code == http.StatusBadGateway || code == http.StatusServiceUnavailable || code == http.StatusGatewayTimeout
}

func requestID(header http.Header) string {
	return firstNonEmpty(header.Get("X-Request-ID"), header.Get("X-Correlation-ID"), header.Get("Traceparent"))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
