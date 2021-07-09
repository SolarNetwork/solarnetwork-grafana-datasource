package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"revolve-energy-solarnetwork-datasource-backend/pkg/plugin"
)

func main() {
	if err := datasource.Manage("revolve-energy-solarnetwork-datasource-backend", plugin.NewSolarNetworkDatasource, datasource.ManageOpts{}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}
