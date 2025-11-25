package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/fxamacker/cbor/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

// QueryType indicates whether it's a list or a reading request
type QueryType string

const (
	QueryTypeList    QueryType = "listDatum"
	QueryTypeReading QueryType = "datumReading"
)

// Query comes from the client
type Query struct {
	RefID            string    `json:"refId"`
	QueryType        QueryType `json:"queryType"`
	NodeIDs          []int64   `json:"nodeIds"`
	SourceIDs        []string  `json:"sourceIds"`
	Metrics          []string  `json:"metrics"`
	Aggregation      string    `json:"aggregation"`
	CombiningType    string    `json:"combiningType,omitempty"`
	DatumReadingType string    `json:"datumReadingType,omitempty"`
}

// QueryData handles queries sent from Grafana
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	response := backend.NewQueryDataResponse()
	settings := req.PluginContext.DataSourceInstanceSettings
	token, host, proxy, err := extractSettings(settings)
	if err != nil {
		return nil, fmt.Errorf("extract settings: %w", err)
	}

	secret := settings.DecryptedSecureJSONData["secret"]
	if secret == "" {
		return nil, fmt.Errorf("API secret not configured")
	}

	client := NewClient(host, proxy, &Credentials{Token: token, Secret: secret}, nil, nil)

	for _, q := range req.Queries {
		res := d.processQuery(ctx, client, q)
		response.Responses[q.RefID] = res
	}

	return response, nil
}

func extractSettings(settings *backend.DataSourceInstanceSettings) (token, host, proxy string, err error) {
	var jsonData map[string]interface{}
	if err := json.Unmarshal(settings.JSONData, &jsonData); err != nil {
		return "", "", "", fmt.Errorf("parse JSON data: %w", err)
	}

	if t, ok := jsonData["token"].(string); ok {
		token = t
	}
	if h, ok := jsonData["host"].(string); ok {
		host = h
	}
	if p, ok := jsonData["proxy"].(string); ok {
		proxy = p
	}

	// Extract just the hostname if a full URL was provided
	if host != "" && strings.HasPrefix(host, "http") {
		if u, err := url.Parse(host); err == nil {
			host = u.Host
		}
	}
	if proxy != "" && strings.HasPrefix(proxy, "http") {
		if u, err := url.Parse(proxy); err == nil {
			proxy = u.Host
		}
	}

	return token, host, proxy, nil
}

func (d *Datasource) processQuery(ctx context.Context, client *Client, backendQuery backend.DataQuery) backend.DataResponse {
	response, _, _, _ := d.processQueryDebug(ctx, client, backendQuery)
	return response
}

// ProcessQueryDebug is like processQuery but also returns the raw stream response for debugging
func (d *Datasource) ProcessQueryDebug(ctx context.Context, client *Client, backendQuery backend.DataQuery) (backend.DataResponse, *StreamResponse, Query, url.Values) {
	return d.processQueryDebug(ctx, client, backendQuery)
}

func (d *Datasource) processQueryDebug(ctx context.Context, client *Client, backendQuery backend.DataQuery) (backend.DataResponse, *StreamResponse, Query, url.Values) {
	var response backend.DataResponse
	var query Query

	if err := json.Unmarshal(backendQuery.JSON, &query); err != nil {
		response.Error = fmt.Errorf("unmarshal query: %w", err)
		return response, nil, query, nil
	}
	query.RefID = backendQuery.RefID

	params := buildQueryParams(query, backendQuery.TimeRange)

	var streamResp *StreamResponse
	var err error

	if query.QueryType == QueryTypeReading {
		streamResp, err = client.StreamReading(ctx, params)
	} else {
		streamResp, err = client.StreamDatum(ctx, params)
	}

	if err != nil {
		response.Error = fmt.Errorf("query request: %w", err)
		return response, streamResp, query, params
	}

	if !streamResp.Success {
		response.Error = fmt.Errorf("query failed: %s", streamResp.Message)
		return response, streamResp, query, params
	}

	frames, err := streamResponseToFrames(streamResp, query)
	if err != nil {
		response.Error = fmt.Errorf("convert response: %w", err)
		return response, streamResp, query, params
	}

	response.Frames = frames
	return response, streamResp, query, params
}

func buildQueryParams(query Query, timeRange backend.TimeRange) url.Values {
	params := url.Values{}

	isCombining := query.CombiningType != "" &&
		!strings.EqualFold(query.CombiningType, "none")

	if len(query.NodeIDs) > 0 {
		nodeStrs := make([]string, len(query.NodeIDs))
		for i, n := range query.NodeIDs {
			nodeStrs[i] = strconv.FormatInt(n, 10)
		}
		params.Set("nodeIds", strings.Join(nodeStrs, ","))

		if isCombining && len(query.NodeIDs) > 1 {
			params.Set("nodeIdMaps", "-1:"+strings.Join(nodeStrs, ","))
		}
	}

	if len(query.SourceIDs) > 0 {
		params.Set("sourceIds", strings.Join(query.SourceIDs, ","))

		if isCombining {
			params.Set("sourceIdMaps", query.CombiningType+":"+strings.Join(query.SourceIDs, ","))
			params.Set("withoutTotalResultsCount", "true")
		}
	}

	if isCombining {
		params.Set("combiningType", query.CombiningType)
	}

	params.Set("startDate", timeRange.From.UTC().Format(time.RFC3339))
	params.Set("endDate", timeRange.To.UTC().Format(time.RFC3339))

	if query.Aggregation != "" && query.Aggregation != "auto" && query.Aggregation != "None" {
		params.Set("aggregation", query.Aggregation)
	} else if isCombining {
		params.Set("aggregation", "FiveMinute")
	}

	if query.QueryType == QueryTypeReading && query.DatumReadingType != "" {
		params.Set("readingType", query.DatumReadingType)
	}

	return params
}

func streamResponseToFrames(resp *StreamResponse, query Query) (data.Frames, error) {
	if len(resp.Meta) == 0 || len(resp.Data) == 0 {
		return data.Frames{}, nil
	}

	metaByIndex := make(map[int]*DatumStreamMetadata)
	for i := range resp.Meta {
		metaByIndex[i] = &resp.Meta[i]
	}

	rowsByStream := make(map[int][][]interface{})
	for _, rawRow := range resp.Data {
		row, ok := rawRow.([]interface{})
		if !ok || len(row) < 2 {
			continue
		}

		metaIdx, err := toInt(row[0])
		if err != nil {
			continue
		}

		rowsByStream[metaIdx] = append(rowsByStream[metaIdx], row)
	}

	var frames data.Frames

	for metaIdx, rows := range rowsByStream {
		meta, ok := metaByIndex[metaIdx]
		if !ok {
			continue
		}

		frame, err := buildFrame(meta, rows, query)
		if err != nil {
			continue
		}

		frames = append(frames, frame)
	}

	return frames, nil
}

// fieldInfo describes where a metric is located within the stream row layout.
type fieldInfo struct {
	propType string // "i" (instantaneous), "a" (accumulating), or "s" (status)
	index    int    // index within that property type
}

// buildFieldLookup creates a map from metric name to its location in the row.
func buildFieldLookup(meta *DatumStreamMetadata) map[string]fieldInfo {
	lookup := make(map[string]fieldInfo)
	for i, name := range meta.Instantaneous {
		lookup[name] = fieldInfo{"i", i}
	}
	for i, name := range meta.Accumulating {
		lookup[name] = fieldInfo{"a", i}
	}
	for i, name := range meta.Status {
		lookup[name] = fieldInfo{"s", i}
	}
	return lookup
}

// filterRequestedMetrics returns the subset of requested metrics that exist in the lookup.
func filterRequestedMetrics(requested []string, lookup map[string]fieldInfo) []string {
	var result []string
	for _, metric := range requested {
		if _, ok := lookup[metric]; ok {
			result = append(result, metric)
		}
	}
	return result
}

// parseTimestamp extracts the timestamp from a row, handling both datum and aggregate formats.
// Returns the timestamp in milliseconds and whether this is an aggregate row.
func parseTimestamp(row []interface{}) (ts int64, isAggregate bool, ok bool) {
	if len(row) < 2 {
		return 0, false, false
	}

	if tsArray, isArr := row[1].([]interface{}); isArr && len(tsArray) >= 1 {
		// Aggregate format: [startTs, endTs] - use endTs if available, else startTs
		isAggregate = true
		if len(tsArray) >= 2 && tsArray[1] != nil {
			ts, _ = toInt64(tsArray[1])
		} else {
			ts, _ = toInt64(tsArray[0])
		}
		return ts, true, true
	}

	// Datum format: single timestamp
	ts, err := toInt64(row[1])
	return ts, false, err == nil
}

// extractFieldValue extracts a field value from a row at the given index.
// For aggregate rows, extracts the first element (avg for instantaneous, diff for accumulating).
func extractFieldValue(row []interface{}, rowIdx int, isAggregate bool) float64 {
	if rowIdx >= len(row) || row[rowIdx] == nil {
		return 0
	}

	if isAggregate {
		if arr, ok := row[rowIdx].([]interface{}); ok && len(arr) > 0 {
			val, _ := toFloat64(arr[0])
			return val
		}
		return 0
	}

	val, _ := toFloat64(row[rowIdx])
	return val
}

// calculateRowIndex returns the index within a row where a field's value is located.
func calculateRowIndex(info fieldInfo, iLen, aLen int) int {
	switch info.propType {
	case "i":
		return 2 + info.index
	case "a":
		return 2 + iLen + info.index
	case "s":
		return 2 + iLen + aLen + info.index
	}
	return -1
}

func buildFrame(meta *DatumStreamMetadata, rows [][]interface{}, query Query) (*data.Frame, error) {
	fieldLookup := buildFieldLookup(meta)
	wantedFields := filterRequestedMetrics(query.Metrics, fieldLookup)

	if len(wantedFields) == 0 {
		return nil, fmt.Errorf("no matching fields")
	}

	frameName := meta.SourceID
	if meta.ObjectID != 0 {
		frameName = fmt.Sprintf("%d %s", meta.ObjectID, meta.SourceID)
	}

	frame := data.NewFrame(frameName)
	frame.RefID = query.RefID

	times := make([]time.Time, 0, len(rows))
	valueArrays := make(map[string][]float64)
	for _, field := range wantedFields {
		valueArrays[field] = make([]float64, 0, len(rows))
	}

	iLen := len(meta.Instantaneous)
	aLen := len(meta.Accumulating)

	for _, row := range rows {
		ts, isAggregate, ok := parseTimestamp(row)
		if !ok {
			continue
		}
		times = append(times, time.UnixMilli(ts))

		for _, fieldName := range wantedFields {
			info := fieldLookup[fieldName]
			rowIdx := calculateRowIndex(info, iLen, aLen)
			val := extractFieldValue(row, rowIdx, isAggregate)
			valueArrays[fieldName] = append(valueArrays[fieldName], val)
		}
	}

	frame.Fields = append(frame.Fields, data.NewField("Time", nil, times))
	for _, field := range wantedFields {
		frame.Fields = append(frame.Fields, data.NewField(field, nil, valueArrays[field]))
	}

	return frame, nil
}

func toInt(v interface{}) (int, error) {
	i, err := toInt64(v)
	return int(i), err
}

func toInt64(v interface{}) (int64, error) {
	switch n := v.(type) {
	case int:
		return int64(n), nil
	case int64:
		return n, nil
	case uint64:
		return int64(n), nil
	case float64:
		return int64(n), nil
	case json.Number:
		return n.Int64()
	default:
		return 0, fmt.Errorf("cannot convert %T to int64", v)
	}
}

func toFloat64(v interface{}) (float64, error) {
	switch n := v.(type) {
	case int:
		return float64(n), nil
	case int64:
		return float64(n), nil
	case uint64:
		return float64(n), nil
	case float64:
		return n, nil
	case json.Number:
		return n.Float64()
	case cbor.Tag:
		// CBOR decimal fraction (tag 4): mantissa * 10^exponent
		if n.Number == 4 {
			if content, ok := n.Content.([]interface{}); ok && len(content) == 2 {
				exp, _ := toInt64(content[0])
				mantissa, _ := toInt64(content[1])
				return float64(mantissa) * math.Pow(10, float64(exp)), nil
			}
		}
		return 0, fmt.Errorf("unsupported CBOR tag %d", n.Number)
	default:
		return 0, fmt.Errorf("cannot convert %T to float64", v)
	}
}
