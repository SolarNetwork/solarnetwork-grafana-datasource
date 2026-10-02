package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"

	"github.com/fxamacker/cbor/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func NewResourceMux(d *Datasource) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/nodes", d.getNodes)
	mux.HandleFunc("/sources", d.getSources)
	mux.HandleFunc("/metrics", d.getMetrics)
	return mux
}

func (d *Datasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	return d.resourceHandler.CallResource(ctx, req, sender)
}

func writeError(rw http.ResponseWriter, err error) {
	http.Error(rw, err.Error(), http.StatusInternalServerError)
}

type NodesResponse struct {
	Success bool   `cbor:"success"`
	Data    []int  `cbor:"data"`
	Message string `cbor:"message,omitempty"`
}

func (d *Datasource) getNodes(rw http.ResponseWriter, req *http.Request) {
	ctx := backend.PluginConfigFromContext(req.Context())
	client, err := d.GetQueryClient(ctx)
	if err != nil {
		writeError(rw, err)
		return
	}

	resp, err := client.Request(req.Context(), GET, "/solarquery/api/v1/sec/nodes", nil, nil, "application/cbor", true)
	if err != nil {
		writeError(rw, extractErrorResponse(resp, err))
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeError(rw, fmt.Errorf("read nodes response: %w", err))
		return
	}

	var parsed NodesResponse
	if err := cbor.Unmarshal(body, &parsed); err != nil {
		writeError(rw, fmt.Errorf("decode nodes response: %w", err))
		return
	}

	nodes := parsed.Data
	sort.Ints(nodes)
	body, err = json.Marshal(nodes)
	if err != nil {
		writeError(rw, err)
		return
	}

	rw.Header().Add("Content-Type", "application/json")
	_, err = rw.Write(body)
	if err != nil {
		return
	}
	rw.WriteHeader(http.StatusOK)
}

type SourceEntry struct {
	NodeId   int    `cbor:"nodeId"`
	SourceId string `cbor:"sourceId"`
}

type SourcesResponse struct {
	Success bool          `cbor:"success"`
	Data    []SourceEntry `cbor:"data"`
	Message string        `cbor:"message,omitempty"`
}

func (d *Datasource) getSources(rw http.ResponseWriter, req *http.Request) {
	ctx := backend.PluginConfigFromContext(req.Context())
	client, err := d.GetQueryClient(ctx)
	if err != nil {
		writeError(rw, err)
		return
	}

	nodeIds := req.URL.Query()["nodeIds"]
	params := url.Values{
		"nodeIds": append([]string(nil), nodeIds...),
	}
	resp, err := client.Request(req.Context(), GET, "/solarquery/api/v1/sec/nodes/sources", params, nil, "application/cbor", true)
	if err != nil {
		writeError(rw, extractErrorResponse(resp, err))
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeError(rw, fmt.Errorf("read nodes response: %w", err))
		return
	}

	var parsed SourcesResponse
	if err := cbor.Unmarshal(body, &parsed); err != nil {
		writeError(rw, fmt.Errorf("decode nodes response: %w", err))
		return
	}

	sources := make([]string, len(parsed.Data))
	for i, source := range parsed.Data {
		sources[i] = source.SourceId
	}
	sources = unique(sources)
	sort.Strings(sources)
	body, err = json.Marshal(sources)
	if err != nil {
		writeError(rw, err)
		return
	}

	rw.Header().Add("Content-Type", "application/json")
	_, err = rw.Write(body)
	if err != nil {
		return
	}
	rw.WriteHeader(http.StatusOK)
}

type StreamMetadataResponse struct {
	Success bool                  `cbor:"success"`
	Data    []DatumStreamMetadata `cbor:"data"`
	Message string                `cbor:"message,omitempty"`
}

func (d *Datasource) getMetrics(rw http.ResponseWriter, req *http.Request) {
	ctx := backend.PluginConfigFromContext(req.Context())
	client, err := d.GetQueryClient(ctx)
	if err != nil {
		writeError(rw, err)
		return
	}

	nodeIds := req.URL.Query()["nodeIds"]
	sourceIds := req.URL.Query()["sourceIds"]
	params := url.Values{
		"nodeIds": append([]string(nil), nodeIds...),
		"sourceIds": append([]string(nil), sourceIds...),
	}
	resp, err := client.Request(req.Context(), GET, "/solarquery/api/v1/sec/datum/stream/meta/node", params, nil, "application/cbor", true)
	if err != nil {
		writeError(rw, extractErrorResponse(resp, err))
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeError(rw, fmt.Errorf("read metadata response: %w", err))
		return
	}

	var parsed StreamMetadataResponse
	if err := cbor.Unmarshal(body, &parsed); err != nil {
		writeError(rw, fmt.Errorf("decode metadata response: %w", err))
		return
	}

	metrics := []string{}
	for _, stream := range parsed.Data {
		for _, i := range stream.Instantaneous {
			metrics = append(metrics, i)
		}
		for _, a := range stream.Accumulating {
			metrics = append(metrics, a)
		}
		for _, s := range stream.Status {
			metrics = append(metrics, s)
		}
	}
	metrics = unique(metrics)
	sort.Strings(metrics)
	body, err = json.Marshal(metrics)
	if err != nil {
		writeError(rw, err)
		return
	}

	rw.Header().Add("Content-Type", "application/json")
	_, err = rw.Write(body)
	if err != nil {
		return
	}
	rw.WriteHeader(http.StatusOK)
}

func unique[T comparable](values []T) []T {
	seen := make(map[T]struct{}, len(values))
	result := make([]T, 0, len(values))

	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}

		seen[value] = struct{}{}
		result = append(result, value)
	}

	return result
}
