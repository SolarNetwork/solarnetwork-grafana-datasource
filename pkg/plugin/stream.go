package plugin

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/fxamacker/cbor/v2"
)

// DatumStreamMetadata describes a datum stream's metadata
type DatumStreamMetadata struct {
	StreamID       string            `json:"streamId"`
	ObjectID       int64             `json:"objectId"`
	SourceID       string            `json:"sourceId"`
	Zone           string            `json:"zone"`
	Kind           string            `json:"kind"`
	Location       map[string]string `json:"location,omitempty"`
	Instantaneous  []string          `json:"i,omitempty"`
	Accumulating   []string          `json:"a,omitempty"`
	Status         []string          `json:"s,omitempty"`
	OtherFieldData any               `json:"-"` // could be more in the future (from the API, that is)
}

// StreamResponse wraps datum stream responses. The Data field is left as is
// such that it can be decoded differently based on whether it's aggregated
type StreamResponse struct {
	Success bool                  `json:"success"`
	Meta    []DatumStreamMetadata `json:"meta"`
	Data    []any                 `json:"data"`
	Message string                `json:"message,omitempty"`
}

// StreamDatum requests /datum/stream/datum
func (c *Client) StreamDatum(ctx context.Context, params url.Values) (*StreamResponse, error) {
	return c.streamRequest(ctx, "/solarquery/api/v1/sec/datum/stream/datum", params)
}

// StreamReading requests /datum/stream/reading
func (c *Client) StreamReading(ctx context.Context, params url.Values) (*StreamResponse, error) {
	return c.streamRequest(ctx, "/solarquery/api/v1/sec/datum/stream/reading", params)
}

func (c *Client) streamRequest(ctx context.Context, path string, params url.Values) (*StreamResponse, error) {
	resp, err := c.Request(ctx, GET, path, params, nil, "application/cbor", true)
	if err != nil {
		return extractErrorResponse(resp, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read stream response: %w", err)
	}

	var parsed StreamResponse
	if err := cbor.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("decode stream response: %w", err)
	}

	return &parsed, nil
}

// extractErrorResponse attempts to extract a more detailed error message from
// the response body when a request fails so that it can be displayed in Grafana directly
func extractErrorResponse(resp *http.Response, originalErr error) (*StreamResponse, error) {
	if resp == nil || resp.Body == nil {
		return nil, originalErr
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil || len(body) == 0 {
		return nil, originalErr
	}

	// Try to decode as CBOR first to get structured error message
	var parsed StreamResponse
	if cbor.Unmarshal(body, &parsed) == nil && parsed.Message != "" {
		return &parsed, fmt.Errorf("%w (message: %s)", originalErr, parsed.Message)
	}

	// Fall back to plain text body
	return nil, fmt.Errorf("%w (body: %s)", originalErr, string(body))
}
