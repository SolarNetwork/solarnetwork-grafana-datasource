package plugin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/fxamacker/cbor/v2"
)

func TestStreamDatum(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/solarquery/api/v1/sec/datum/stream/datum" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("nodeId"); got != "1" {
			t.Fatalf("missing query param: %s", got)
		}
		if r.Header.Get("accept") != "application/cbor" {
			t.Fatalf("unexpected accept header: %s", r.Header.Get("accept"))
		}
		payload := map[string]any{
			"success": true,
			"meta": []map[string]any{
				{
					"streamId": "abc",
					"objectId": 1,
					"sourceId": "/a",
					"zone":     "UTC",
					"kind":     "n",
					"i":        []string{"watts"},
				},
			},
			"data": []any{
				[]any{0, 1650667326308, 12326},
			},
		}
		buf, err := cbor.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal cbor: %v", err)
		}
		_, _ = w.Write(buf)
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	client := NewClient(u.Host, u.Host, nil, nil, server.Client())

	params := url.Values{}
	params.Set("nodeId", "1")

	resp, err := client.StreamDatum(context.Background(), params)
	if err != nil {
		t.Fatalf("stream datum: %v", err)
	}

	if !resp.Success || len(resp.Meta) != 1 || len(resp.Data) != 1 {
		t.Fatalf("unexpected response: %#v", resp)
	}
	if row, ok := resp.Data[0].([]any); !ok || len(row) != 3 || !numericEq(row[2], 12326) {
		t.Fatalf("unexpected data payload: %#v", resp.Data[0])
	}
}

func TestStreamReading(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/solarquery/api/v1/sec/datum/stream/reading" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("readingType"); got != "Difference" {
			t.Fatalf("missing readingType: %s", got)
		}
		payload := map[string]any{
			"success": true,
			"meta":    []any{},
			"data": []any{
				[]any{0, []any{1650667326308, nil}, []any{1, 2, 3}},
			},
		}
		buf, err := cbor.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal cbor: %v", err)
		}
		_, _ = w.Write(buf)
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	client := NewClient(u.Host, u.Host, nil, nil, server.Client())

	params := url.Values{}
	params.Set("readingType", "Difference")

	resp, err := client.StreamReading(context.Background(), params)
	if err != nil {
		t.Fatalf("stream reading: %v", err)
	}

	if !resp.Success || len(resp.Data) != 1 {
		t.Fatalf("unexpected response: %#v", resp)
	}
	row, ok := resp.Data[0].([]any)
	if !ok || len(row) != 3 {
		t.Fatalf("unexpected data payload: %#v", resp.Data[0])
	}
	rangeVal, ok := row[1].([]any)
	if !ok || len(rangeVal) != 2 || !numericEq(rangeVal[0], 1650667326308) {
		t.Fatalf("unexpected range payload: %#v", row[1])
	}
}

func numericEq(v any, expected int64) bool {
	got, err := toInt64(v)
	return err == nil && got == expected
}
