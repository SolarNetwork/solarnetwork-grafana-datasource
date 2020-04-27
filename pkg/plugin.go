package main

import (
	"github.com/grafana/grafana-plugin-model/go/datasource"
	plugin "github.com/hashicorp/go-plugin"
)

func main() {
	plugin.Serve(&plugin.ServeConfig{
		HandshakeConfig: plugin.HandshakeConfig{
			ProtocolVersion:  1,
			MagicCookieKey:   "grafana_plugin_type",
			MagicCookieValue: "datasource",
		},
		Plugins: map[string]plugin.Plugin{
			"revolve-enery-solarnetwork-backend-datasource": &datasource.DatasourcePluginImpl{Plugin: &SolarNetworkDatasource{}},
		},

		// A non-nil value here enables gRPC serving for this plugin...
		GRPCServer: plugin.DefaultGRPCServer,
	})
}
