package plugin

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"
)

func TestDatumJSONRoundTrip(t *testing.T) {
	created := time.Date(2024, 5, 1, 12, 0, 0, 0, time.UTC)
	d := Datum{
		NodeID:    42,
		SourceID:  "/S1/B1/M1",
		Created:   created,
		LocalDate: "2024-05-01",
		LocalTime: "12:00",
		Samples: DatumSamples{
			Instantaneous: map[string]interface{}{"watts": 123.4},
			Accumulating:  map[string]interface{}{"wattHours": 987654.0},
			Status:        map[string]interface{}{"mode": "auto"},
			Tags:          []string{"online"},
		},
	}

	data, err := json.Marshal(d)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var roundTrip Datum
	if err := json.Unmarshal(data, &roundTrip); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if roundTrip.NodeID != d.NodeID || roundTrip.SourceID != d.SourceID || !roundTrip.Created.Equal(created) {
		t.Fatalf("unexpected identity fields: %#v", roundTrip)
	}
	if roundTrip.LocalDate != d.LocalDate || roundTrip.LocalTime != d.LocalTime {
		t.Fatalf("unexpected local fields: %#v", roundTrip)
	}

	if !reflect.DeepEqual(roundTrip.Samples, d.Samples) {
		t.Fatalf("samples mismatch: %#v vs %#v", roundTrip.Samples, d.Samples)
	}
}

func TestParseDatumWireJSON(t *testing.T) {
	raw := []byte(`{
		"created": "2011-10-05 11:00:00.000Z",
		"nodeId": 30,
		"sourceId": "Main",
		"localDate": "2011-10-06",
		"localTime": "00:00",
		"watts": 1065.228,
		"wattHours": 12775.876,
		"mode": "auto",
		"tags": ["consumption"]
	}`)

	d, err := UnmarshalDatumWireJSON(raw)
	if err != nil {
		t.Fatalf("parse wire: %v", err)
	}

	if d.NodeID != 30 || d.SourceID != "Main" {
		t.Fatalf("unexpected identity: %#v", d)
	}
	if got := d.Created.UTC().Format(datumWireTimeLayout); got != "2011-10-05 11:00:00.000Z" {
		t.Fatalf("unexpected created: %s", got)
	}
	if d.LocalDate != "2011-10-06" || d.LocalTime != "00:00" {
		t.Fatalf("unexpected local fields: %s %s", d.LocalDate, d.LocalTime)
	}
	if d.Samples.Instantaneous["watts"] != 1065.228 {
		t.Fatalf("missing watts sample: %#v", d.Samples.Instantaneous)
	}
	if d.Samples.Accumulating["wattHours"] != 12775.876 {
		t.Fatalf("missing wattHours sample: %#v", d.Samples.Accumulating)
	}
	if d.Samples.Status["mode"] != "auto" {
		t.Fatalf("missing mode status: %#v", d.Samples.Status)
	}
	if len(d.Samples.Tags) != 1 || d.Samples.Tags[0] != "consumption" {
		t.Fatalf("unexpected tags: %#v", d.Samples.Tags)
	}
}

func TestMarshalDatumWire(t *testing.T) {
	created := time.Date(2011, 10, 5, 11, 0, 0, 0, time.UTC)
	d := Datum{
		NodeID:    30,
		SourceID:  "Main",
		Created:   created,
		LocalDate: "2011-10-06",
		LocalTime: "00:00",
		Samples: DatumSamples{
			Instantaneous: map[string]interface{}{"watts": 1065.228},
			Accumulating:  map[string]interface{}{"wattHours": 12775.876},
			Status:        map[string]interface{}{"mode": "auto"},
			Tags:          []string{"consumption"},
		},
	}

	wire := MarshalDatumWireMap(d)

	wireJSON, err := json.Marshal(wire)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}

	var roundTrip map[string]interface{}
	if err := json.Unmarshal(wireJSON, &roundTrip); err != nil {
		t.Fatalf("unmarshal json: %v", err)
	}

	expected := map[string]interface{}{
		"created":   "2011-10-05 11:00:00.000Z",
		"nodeId":    float64(30),
		"sourceId":  "Main",
		"localDate": "2011-10-06",
		"localTime": "00:00",
		"watts":     1065.228,
		"wattHours": 12775.876,
		"mode":      "auto",
		"tags":      []interface{}{"consumption"},
	}

	if !reflect.DeepEqual(roundTrip, expected) {
		t.Fatalf("wire mismatch\nexpected: %#v\nactual:   %#v", expected, roundTrip)
	}
}

func TestCustomClassification(t *testing.T) {
	raw := map[string]interface{}{
		"created":    "2011-10-05 11:00:00.000Z",
		"nodeId":     30,
		"sourceId":   "Main",
		"customAcc":  5.5,
		"customI":    1.2,
		"customStat": "value",
	}

	spec := DefaultDatumFieldClassification()
	spec.Accumulating["customAcc"] = struct{}{}
	spec.Instantaneous["customI"] = struct{}{}
	spec.Status["customStat"] = struct{}{}

	d, err := UnmarshalDatumWireMapWithSpec(raw, spec)
	if err != nil {
		t.Fatalf("unmarshal with spec: %v", err)
	}

	if d.Samples.Accumulating["customAcc"] != 5.5 {
		t.Fatalf("expected customAcc accumulating, got %#v", d.Samples.Accumulating)
	}
	if d.Samples.Instantaneous["customI"] != 1.2 {
		t.Fatalf("expected customI instantaneous, got %#v", d.Samples.Instantaneous)
	}
	if d.Samples.Status["customStat"] != "value" {
		t.Fatalf("expected customStat status, got %#v", d.Samples.Status)
	}
}
