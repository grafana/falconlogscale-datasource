package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-starter-datasource-backend/pkg/plugin"
)

const dsId = "grafana-falconlogscale-datasource"

func main() {
	if err := datasource.Manage(dsId, plugin.NewDataSourceInstance, datasource.ManageOpts{}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}
