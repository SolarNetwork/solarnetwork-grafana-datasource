package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/fxamacker/cbor/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

type Message struct {
	Created    time.Time
	SourceId   string
	Properties map[string]any
}

func (d *Datasource) SubscribeStream(_ context.Context, req *backend.SubscribeStreamRequest) (*backend.SubscribeStreamResponse, error) {
	settings := req.PluginContext.DataSourceInstanceSettings
	token, _, _, broker, err := extractSettings(settings)
	if err != nil {
		return nil, fmt.Errorf("extract settings: %w", err)
	}
	if token == "" {
		return nil, fmt.Errorf("API token not configured")
	}
	if broker == "" {
		return nil, fmt.Errorf("MQTT broker not configured")
	}

	secret := settings.DecryptedSecureJSONData["secret"]
	if secret == "" {
		return nil, fmt.Errorf("API secret not configured")
	}

	return &backend.SubscribeStreamResponse{
		Status: backend.SubscribeStreamStatusOK,
	}, nil
}

// Stream publishing is not supported
func (d *Datasource) PublishStream(context.Context, *backend.PublishStreamRequest) (*backend.PublishStreamResponse, error) {
	return &backend.PublishStreamResponse{
		Status: backend.PublishStreamStatusPermissionDenied,
	}, nil
}

var cache = NewMQTTClientCache()

func (d *Datasource) RunStream(ctx context.Context, req *backend.RunStreamRequest, sender *backend.StreamSender) error {
	q := Query{}
	json.Unmarshal(req.Data, &q)
	settings := req.PluginContext.DataSourceInstanceSettings
	token, _, _, broker, err := extractSettings(settings)
	if err != nil {
		return fmt.Errorf("extract settings: %w", err)
	}

	secret := settings.DecryptedSecureJSONData["secret"]
	if secret == "" {
		return fmt.Errorf("API secret not configured")
	}

	client, err := cache.Get(broker, token, secret)
	if err != nil {
		return err
	}

	var subscriptions []string
	for _, nodeId := range q.NodeIDs {
		for _, sourceId := range q.SourceIDs {
			topic := fmt.Sprintf("node/%d/datum/0/%s", nodeId, antToMQTTPattern(sourceId))
			subscriptions = append(subscriptions, topic)
		}
	}
	consumer, err := client.Subscribe(subscriptions...)

	defer consumer.Close()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case msg := <-consumer.Messages():
			nodeId, sourceId, parsed := parseTopic(msg.Topic)
			if !parsed {
				log.DefaultLogger.Error("Failed to parse topic", "error", err)
				continue
			}

			var message Message
			if err := cbor.Unmarshal(msg.Payload, &message); err != nil {
				log.DefaultLogger.Error("Failed to decode CBOR", "error", err)
				continue
			}

			frameName := fmt.Sprintf("%s %s", nodeId, sourceId)
			frame := data.NewFrame(frameName)
			frame.Fields = append(frame.Fields, data.NewField("time", nil, []time.Time{time.Time(message.Created)}))
			for _, metric := range q.Metrics {
				val, err := toFloat64(message.Properties[metric])
				if err != nil {
					log.DefaultLogger.Error("Failed to get float for metric")
				}
				frame.Fields = append(frame.Fields, data.NewField(metric, nil, []float64{val}))
			}

			if err := sender.SendFrame(frame, data.IncludeAll); err != nil {
				log.DefaultLogger.Error("Failed send frame", "error", err)
			}
		}
	}

	return nil
}

// expected format is: user/+/node/{nodeId}/datum/0/{sourceId}
var topicRegexp = regexp.MustCompile(`^user/[^/]+/node/([^/]+)/datum/0/(.+)$`)

func parseTopic(topic string) (nodeId, sourceId string, parsed bool) {
	matches := topicRegexp.FindStringSubmatch(topic)
	if matches == nil {
		return "", "", false
	}

	return matches[1], matches[2], true
}

func (m *Message) UnmarshalCBOR(data []byte) error {
	var raw map[string]cbor.RawMessage

	if err := cbor.Unmarshal(data, &raw); err != nil {
		return err
	}

	m.Properties = make(map[string]any)

	for k, v := range raw {
		switch k {
		case "created":
			var ms int64
			if err := cbor.Unmarshal(v, &ms); err != nil {
				return err
			}
			m.Created = time.UnixMilli(ms)

		case "sourceId":
			if err := cbor.Unmarshal(v, &m.SourceId); err != nil {
				return err
			}

		default:
			var value any
			if err := cbor.Unmarshal(v, &value); err != nil {
				return err
			}
			m.Properties[k] = value
		}
	}

	return nil
}

func antToMQTTPattern(ant string) string {
	parts := strings.Split(ant, "/")

	for i, part := range parts {
		switch part {
		case "**":
			if i == len(parts) - 1 {
				parts[i] = "#"
			}
		case "*":
			parts[i] = "+"
		}
	}

	return strings.Join(parts, "/")
}
