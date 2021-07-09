package plugin

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

const SecretPrefix = "SNWS2"
const DateFormat = "20060102"
const HashData = "snws2_request"
const RefId = "sk"

type SolarNetworkDatasource struct {}

type SigningKeyInfo struct {
	Key   string    `json:"key"`
	Date  time.Time `json:"date"`
}

var (
	_ backend.CallResourceHandler = (*SolarNetworkDatasource)(nil)
	_ backend.CheckHealthHandler  = (*SolarNetworkDatasource)(nil)
)

func NewSolarNetworkDatasource(_ backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	return &SolarNetworkDatasource{}, nil
}

func (d *SolarNetworkDatasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
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

func (d *SolarNetworkDatasource) CheckHealth(_ context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	log.DefaultLogger.Info("CheckHealth called", "request", req)

	var status = backend.HealthStatusOk
	var message = "Data source is working"

	return &backend.CheckHealthResult{
		Status:  status,
		Message: message,
	}, nil
}
