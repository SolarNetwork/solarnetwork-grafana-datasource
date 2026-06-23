package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type HTTPMethod string

const (
	GET HTTPMethod = "GET"
)

type Credentials struct {
	Token  string
	Secret string
}

const DefaultHost = "data.solarnetwork.net"

var (
	ErrAuthentication = errors.New("authentication failed")
	ErrConnection     = errors.New("connection failed")
	ErrRetryExhausted = errors.New("retry attempts exhausted")
)

type RetryConfig struct {
	Total         int
	BackoffFactor time.Duration
	StatusCodes   []int
}

type Client struct {
	Host        string
	Proxy       string
	Credentials *Credentials
	Retry       *RetryConfig
	HTTPClient  *http.Client
}

func NewClient(host, proxy string, credentials *Credentials, retry *RetryConfig, httpClient *http.Client) *Client {
	if host == "" {
		host = DefaultHost
	}
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	return &Client{
		Host:        host,
		Proxy:       proxy,
		Credentials: credentials,
		Retry:       retry,
		HTTPClient:  httpClient,
	}
}

func (c *Client) shouldRetry(status int) bool {
	if c.Retry == nil || c.Retry.Total <= 0 {
		return false
	}
	for _, s := range c.Retry.StatusCodes {
		if s == status {
			return true
		}
	}
	return false
}

// Request performs an authenticated request to the SolarNetwork API
func (c *Client) Request(ctx context.Context, method HTTPMethod, path string, params url.Values, data interface{}, accept string, useProxy bool) (*http.Response, error) {
	if accept == "" {
		accept = "application/json"
	}

	attempt := 0
	for {
		req, err := c.prepareRequest(ctx, method, path, params, data, accept, useProxy)
		if err != nil {
			return nil, err
		}

		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			if c.shouldRetry(http.StatusServiceUnavailable) && attempt < c.Retry.Total {
				attempt++
				c.backoff(attempt)
				continue
			}
			return nil, fmt.Errorf("%w: %v", ErrConnection, err)
		}

		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return resp, fmt.Errorf("%w: status %d", ErrAuthentication, resp.StatusCode)
		}

		if c.shouldRetry(resp.StatusCode) && attempt < c.Retry.Total {
			resp.Body.Close()
			attempt++
			c.backoff(attempt)
			continue
		}

		if resp.StatusCode >= http.StatusBadRequest {
			return resp, fmt.Errorf("request failed with status %d", resp.StatusCode)
		}

		return resp, nil
	}
}

func (c *Client) backoff(attempt int) {
	if c.Retry == nil || c.Retry.BackoffFactor <= 0 {
		return
	}
	delay := time.Duration(attempt) * c.Retry.BackoffFactor
	time.Sleep(delay)
}

func (c *Client) prepareRequest(ctx context.Context, method HTTPMethod, path string, params url.Values, data interface{}, accept string, useProxy bool) (*http.Request, error) {
	now := time.Now().UTC()
	headers := map[string]string{
		"accept":    accept,
		"host":      c.Host,
		"x-sn-date": GetXSnDate(now),
	}

	var bodyBytes []byte
	if data != nil {
		var err error
		bodyBytes, err = json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("encode body: %w", err)
		}
	}

	if c.Credentials != nil {
		paramString := ""
		if params != nil {
			paramString = params.Encode()
		}
		auth := GenerateAuthHeader(
			c.Credentials.Token,
			c.Credentials.Secret,
			string(method),
			path,
			paramString,
			headers,
			string(bodyBytes),
			now,
		)
		headers["authorization"] = auth
	}

	baseHost := c.Host
	if useProxy && c.Proxy != "" {
		baseHost = c.Proxy
	}

	u := url.URL{
		Scheme: "https",
		Host:   baseHost,
		Path:   path,
	}
	if params != nil {
		u.RawQuery = params.Encode()
	}

	var body io.Reader
	if len(bodyBytes) > 0 {
		body = bytes.NewReader(bodyBytes)
	}

	req, err := http.NewRequestWithContext(ctx, string(method), u.String(), body)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	req.Host = c.Host
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if len(bodyBytes) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}

	return req, nil
}
