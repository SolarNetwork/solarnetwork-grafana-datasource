package plugin

import (
	"encoding/json"
	"fmt"
	"time"
)

// Datum represents a single datum identified by node, source, and timestamp.
//
// The "Samples" part is to match with how SolarNetwork internally thinks about
// datums according to the documentation, although it's not stricly necessary
// since the API doesn't deal with datums in that way.
type Datum struct {
	NodeID    int64        `json:"nodeId"`
	SourceID  string       `json:"sourceId"`
	Created   time.Time    `json:"created"`
	LocalDate string       `json:"localDate,omitempty"`
	LocalTime string       `json:"localTime,omitempty"`
	Samples   DatumSamples `json:"samples"`
}

// DatumSamples holds the classified measurement data for a datum.
type DatumSamples struct {
	Instantaneous map[string]interface{} `json:"i,omitempty"`
	Accumulating  map[string]interface{} `json:"a,omitempty"`
	Status        map[string]interface{} `json:"s,omitempty"`
	Tags          []string               `json:"t,omitempty"`
}

const datumWireTimeLayout = "2006-01-02 15:04:05.000Z"

var (
	datumMetaFields = map[string]struct{}{
		"created":   {},
		"nodeId":    {},
		"sourceId":  {},
		"localDate": {},
		"localTime": {},
		"tags":      {},
	}
)

// DatumFieldClassification allows callers to customize how sample fields are
// categorized when parsing the flattened wire representation.
//
// As in, is a measurement accumulating? Configure it here
type DatumFieldClassification struct {
	Instantaneous map[string]struct{}
	Accumulating  map[string]struct{}
	Status        map[string]struct{}
}

// DefaultDatumFieldClassification returns the standard SolarNetwork field
// classification mapping.
//
// This is taken from the SN documentation
func DefaultDatumFieldClassification() DatumFieldClassification {
	return DatumFieldClassification{
		Instantaneous: setFromStrings(
			"apparentPower",
			"current",
			"dcPower",
			"dcVoltage",
			"effectivePowerFactor",
			"frequency",
			"lineVoltage",
			"neutralCurrent",
			"phaseVoltage",
			"powerFactor",
			"reactivePower",
			"voltage",
			"watts",
			"atm",
			"co2",
			"dew",
			"humidity",
			"irradiance",
			"lux",
			"temp",
			"visibility",
		),
		Accumulating: setFromStrings(
			"wattHours",
		),
		Status: setFromStrings(
			"mode",
			"opState",
			"opStates",
			"phase",
			"sky",
			"skies",
		),
	}
}

func setFromStrings(vals ...string) map[string]struct{} {
	m := make(map[string]struct{}, len(vals))
	for _, v := range vals {
		m[v] = struct{}{}
	}
	return m
}

// UnmarshalDatumWireJSON parses a datum in the flattened wire shape into a Datum
// using the default field classification.
func UnmarshalDatumWireJSON(data []byte) (Datum, error) {
	return UnmarshalDatumWireJSONWithSpec(data, DefaultDatumFieldClassification())
}

// UnmarshalDatumWireJSONWithSpec parses a datum in the flattened wire shape into
// a Datum using a caller-provided field classification.
func UnmarshalDatumWireJSONWithSpec(data []byte, spec DatumFieldClassification) (Datum, error) {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return Datum{}, fmt.Errorf("parse wire datum: %w", err)
	}
	return UnmarshalDatumWireMapWithSpec(raw, spec)
}

// UnmarshalDatumWireMap converts a flattened datum map into a structured Datum
// using the default field classification.
func UnmarshalDatumWireMap(raw map[string]interface{}) (Datum, error) {
	return UnmarshalDatumWireMapWithSpec(raw, DefaultDatumFieldClassification())
}

// UnmarshalDatumWireMapWithSpec converts a flattened datum map into a structured
// Datum using a caller-provided field classification.
func UnmarshalDatumWireMapWithSpec(raw map[string]interface{}, spec DatumFieldClassification) (Datum, error) {
	var d Datum

	if v, ok := raw["nodeId"]; ok {
		id, err := toInt64(v)
		if err != nil {
			return Datum{}, fmt.Errorf("parse nodeId: %w", err)
		}
		d.NodeID = id
	}

	if v, ok := raw["sourceId"].(string); ok {
		d.SourceID = v
	}

	if v, ok := raw["created"].(string); ok && v != "" {
		t, err := time.Parse(datumWireTimeLayout, v)
		if err != nil {
			return Datum{}, fmt.Errorf("parse created: %w", err)
		}
		d.Created = t
	}

	if v, ok := raw["localDate"].(string); ok {
		d.LocalDate = v
	}
	if v, ok := raw["localTime"].(string); ok {
		d.LocalTime = v
	}

	if tags, ok := raw["tags"].([]interface{}); ok {
		for _, t := range tags {
			if s, ok := t.(string); ok {
				d.Samples.Tags = append(d.Samples.Tags, s)
			}
		}
	}

	for k, v := range raw {
		if _, isMeta := datumMetaFields[k]; isMeta {
			continue
		}
		storeSample(&d.Samples, k, v, spec)
	}

	return d, nil
}

// MarshalDatumWireMap marshals a Datum into the flattened wire representation.
func MarshalDatumWireMap(d Datum) map[string]interface{} {
	out := map[string]interface{}{
		"nodeId":   d.NodeID,
		"sourceId": d.SourceID,
		"created":  d.Created.UTC().Format(datumWireTimeLayout),
	}
	if d.LocalDate != "" {
		out["localDate"] = d.LocalDate
	}
	if d.LocalTime != "" {
		out["localTime"] = d.LocalTime
	}

	for k, v := range d.Samples.Instantaneous {
		out[k] = v
	}
	for k, v := range d.Samples.Accumulating {
		out[k] = v
	}
	for k, v := range d.Samples.Status {
		out[k] = v
	}
	if len(d.Samples.Tags) > 0 {
		out["tags"] = append([]string(nil), d.Samples.Tags...)
	}

	return out
}

func storeSample(s *DatumSamples, key string, val interface{}, spec DatumFieldClassification) {
	if _, ok := spec.Accumulating[key]; ok {
		if s.Accumulating == nil {
			s.Accumulating = make(map[string]interface{})
		}
		s.Accumulating[key] = val
		return
	}
	if _, ok := spec.Status[key]; ok {
		if s.Status == nil {
			s.Status = make(map[string]interface{})
		}
		s.Status[key] = val
		return
	}

	if _, ok := spec.Instantaneous[key]; ok {
		if s.Instantaneous == nil {
			s.Instantaneous = make(map[string]interface{})
		}
		s.Instantaneous[key] = val
		return
	}

	switch val.(type) {
	case string, bool:
		if s.Status == nil {
			s.Status = make(map[string]interface{})
		}
		s.Status[key] = val
	default:
		if s.Instantaneous == nil {
			s.Instantaneous = make(map[string]interface{})
		}
		s.Instantaneous[key] = val
	}
}

