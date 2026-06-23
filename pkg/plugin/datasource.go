package plugin

import (
	"context"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource"
	"github.com/solarnetwork/solarnetwork-datasource/pkg/models"
)

const RefId = "sk"

var (
	_ backend.CallResourceHandler   = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

func NewDatasource(_ context.Context, _ backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	return &Datasource{}, nil
}

type Datasource struct{}

type SigningKeyInfo struct {
	Key  string    `json:"key"`
	Date time.Time `json:"date"`
}

func (d *Datasource) Dispose() {}

func (d *Datasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Do not log the full request: it carries DecryptedSecureJSONData (the API secret).
	log.DefaultLogger.Info("CallResource called", "method", req.Method, "path", req.Path)

	t := time.Now().UTC()
	secret := req.PluginContext.DataSourceInstanceSettings.DecryptedSecureJSONData["secret"]
	key := GenerateSigningKeyHex(secret, t, "snws2_request")
	info := &SigningKeyInfo{
		Key:  key,
		Date: t,
	}

	return resource.SendJSON(sender, info)
}

// CheckHealth handles health checks sent from Grafana to the plugin.
func (d *Datasource) CheckHealth(_ context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	res := &backend.CheckHealthResult{}
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
