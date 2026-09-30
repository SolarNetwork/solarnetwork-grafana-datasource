package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/fxamacker/cbor/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func (d *Datasource) CallResource(
	ctx context.Context,
	req *backend.CallResourceRequest,
	sender backend.CallResourceResponseSender,
) error {
	log.DefaultLogger.Info("CallResource called", "method", req.Method, "path", req.Path)

	switch req.Path {
	case "nodes":
		return d.getNodes(ctx, req, sender)
	default:
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusNotFound,
		})
	}
}

type NodesResponse struct {
	Success bool   `cbor:"success"`
	Data    []int  `cbor:"data"`
	Message string `cbor:"message,omitempty"`
}

type NodesResult []int

func (d *Datasource) getNodes(
	ctx context.Context,
	req *backend.CallResourceRequest,
	sender backend.CallResourceResponseSender,
) error {
	client, err := d.GetQueryClient(req.PluginContext)
	if err != nil {
		return err
	}

	resp, err := client.Request(ctx, GET, "/solarquery/api/v1/sec/nodes", nil, nil, "application/cbor", true)
	if err != nil {
		return extractErrorResponse(resp, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read nodes response: %w", err)
	}

	var parsed NodesResponse
	if err := cbor.Unmarshal(body, &parsed); err != nil {
		return fmt.Errorf("decode nodes response: %w", err)
	}

	body, err = json.Marshal(parsed.Data)
	if err != nil {
		return err
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: http.StatusOK,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
		Body: body,
	})
}
