package plugin

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource"
	"github.com/solarnetwork/solarnetwork-datasource/pkg/models"
)

const SecretPrefix = "SNWS2"
const DateFormat = "20060102"
const HashData = "snws2_request"
const RefId = "sk"

var (
	_ backend.CallResourceHandler   = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new datasource instance.
func NewDatasource(_ context.Context, _ backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	return &Datasource{}, nil
}

type Datasource struct{}

type SigningKeyInfo struct {
	Key   string    `json:"key"`
	Date  time.Time `json:"date"`
}

func (d *Datasource) Dispose() {
	// Clean up datasource instance resources.
}

func (d *Datasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	log.DefaultLogger.Info("CallResource called", "request", req)

	t := time.Now().UTC()
	secret := req.PluginContext.DataSourceInstanceSettings.DecryptedSecureJSONData["secret"]
	h := hmac.New(sha256.New, []byte(SecretPrefix + secret))
	h.Write([]byte(t.Format(DateFormat)))
	h2 := hmac.New(sha256.New, h.Sum(nil))
	h2.Write([]byte(HashData))
	key := hex.EncodeToString(h2.Sum(nil))
	info := &SigningKeyInfo {
		Key: key,
		Date: t,
	}

	return resource.SendJSON(sender, info)
}

// CheckHealth handles health checks sent from Grafana to the plugin.
func (d *Datasource) CheckHealth(_ context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	res := &backend.CheckHealthResult{}

	// verify token secret available
	config, err := models.LoadPluginSettings(*req.PluginContext.DataSourceInstanceSettings)

	if err != nil {
		res.Status = backend.HealthStatusError
		res.Message = "Unable to load settings"
		return res, nil
	}

	if config.Secrets.TokenSecret == "" {
		res.Status = backend.HealthStatusError
		res.Message = "API key is missing"
		return res, nil
	}

	res.Status = backend.HealthStatusOk
	res.Message = "Data source is working"
	return res, nil
}
