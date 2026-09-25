package plugin

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"sync"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type MQTTClientCache struct {
	mu      sync.Mutex
	clients map[clientKey]*MQTTClient
}

type clientKey struct {
	broker   string
	username string
}

func NewMQTTClientCache() *MQTTClientCache {
	return &MQTTClientCache{
		clients: make(map[clientKey]*MQTTClient),
	}
}

func (c *MQTTClientCache) Get(broker, token, secret string) (*MQTTClient, error) {
	key := clientKey{
		broker:   broker,
		username: token,
	}

	// Might be held a bit long if lots of datasources connect at once
	c.mu.Lock()
	defer c.mu.Unlock()

	if client, ok := c.clients[key]; ok {
		return client, nil
	}



	now := time.Now()
	signedHeaders := map[string]string{
		"Host": "data.solarnetwork.net",
		"X-SN-Date": GetXSnDate(now),
	}
	signature := GenerateFluxSignature(token, secret, "GET", "/solarflux/auth", signedHeaders, now)

	b := make([]byte, 15)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	rand := base64.RawURLEncoding.EncodeToString(b)

	opts := mqtt.NewClientOptions()
	opts.AddBroker(broker)
	opts.SetClientID(token + rand)
	opts.SetUsername(token)
	opts.SetPassword(signature)

	var client *MQTTClient
	// These handlers should never get called before subs has been set
	opts.SetOnConnectHandler(func(_ mqtt.Client) {
		client.reconnect()
	})
	opts.SetDefaultPublishHandler(func(_ mqtt.Client, msg mqtt.Message) {
		client.handleMessage(msg)
	})

	rawClient := mqtt.NewClient(opts)

	client = NewMQTTClient(rawClient)

	conn := rawClient.Connect()
	if conn.Wait() && conn.Error() != nil {
		return nil, fmt.Errorf(
			"connect to MQTT broker %q: %w",
			broker,
			conn.Error(),
		)
	}

	log.DefaultLogger.Info("Connected to MQTT broker", "broker", broker)

	c.clients[key] = client

	return client, nil
}

type MQTTClient struct {
	mu sync.RWMutex
	client mqtt.Client
	subs map[string]map[*Consumer]struct{}
}

func NewMQTTClient(client mqtt.Client) *MQTTClient {
	return &MQTTClient{
		client: client,
		subs:   make(map[string]map[*Consumer]struct{}),
	}
}

type Consumer struct {
	client   *MQTTClient

	mu       sync.Mutex
	topics   map[string]struct{}
	messages chan MQTTMessage
	closed   bool
}

func (c *Consumer) Messages() <-chan MQTTMessage {
	return c.messages
}

func (c *Consumer) Close() error {
	return c.client.unsubscribe(c)
}

type MQTTMessage struct {
	Topic   string
	Payload []byte
}

func (c *MQTTClient) Subscribe(
	topics ...string,
) (*Consumer, error) {
	cons := &Consumer{
		client:   c,
		topics:   make(map[string]struct{}),
		messages: make(chan MQTTMessage, 100),
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	for _, topic := range topics {
		if _, exists := cons.topics[topic]; exists {
			continue
		}

		cons.topics[topic] = struct{}{}

		consumers := c.subs[topic]
		if consumers == nil {
			consumers = make(map[*Consumer]struct{})
			c.subs[topic] = consumers

			if err := c.subscribeLocked(topic); err != nil {
				delete(c.subs, topic)
				delete(cons.topics, topic)
				return nil, err
			}
		}

		consumers[cons] = struct{}{}
	}

	return cons, nil
}

func (c *MQTTClient) subscribeLocked(topic string) error {
	token := c.client.Subscribe(topic, 1, nil)

	if token.Wait() && token.Error() != nil {
		log.DefaultLogger.Info("Failed to subscribed to topic", "topic", topic, "error", token.Error())
		return token.Error()
	}

	log.DefaultLogger.Info("Subscribed to topic", "topic", topic)
	return nil
}

func (c *MQTTClient) unsubscribe(cons *Consumer) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if cons.closed {
		return nil
	}

	cons.closed = true

	for topic := range cons.topics {
		consumers := c.subs[topic]

		delete(consumers, cons)

		if len(consumers) == 0 {
			delete(c.subs, topic)

			token := c.client.Unsubscribe(topic)

			if token.Wait() && token.Error() != nil {
				return token.Error()
			}
		}
	}

	close(cons.messages)

	return nil
}

func (c *MQTTClient) handleMessage(
	msg mqtt.Message,
) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	for filter, consumers := range c.subs {
		if !topicMatches(filter, msg.Topic()) {
			continue
		}

		for consumer := range consumers {
			consumer.deliver(MQTTMessage{
				Topic:   msg.Topic(),
				Payload: append([]byte(nil), msg.Payload()...),
			})
		}
	}
}

func (c *MQTTClient) reconnect() {
	c.mu.RLock()
	defer c.mu.RUnlock()

	for topic := range c.subs {
		c.subscribeLocked(topic)
	}
}

func topicMatches(filter, topic string) bool {
	fp := strings.Split(filter, "/")
	tp := strings.Split(topic, "/")
	// remove user/###/
	tp = tp[min(2, len(tp)):]

	for i, f := range fp {
		if f == "#" {
			return i == len(fp) - 1
		}

		if i >= len(tp) {
			return false
		}

		if f != "+" && f != tp[i] {
			return false
		}
	}

	return len(fp) == len(tp)
}

func (c *Consumer) deliver(msg MQTTMessage) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return
	}

	select {
	case c.messages <- msg:
	default:
		// channel is full, let it drop
		log.DefaultLogger.Error("Failed to deliver MQTT message: channel full")
	}
}
