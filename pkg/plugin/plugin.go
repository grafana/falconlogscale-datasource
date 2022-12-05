package plugin

import (
	"net/url"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
	humioAPI "github.com/humio/cli/api"
)

func NewDataSourceInstance(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	s, err := LoadSettings(settings)
	if err != nil {
		return nil, err
	}

	client, err := client(s.AccessToken, s.BaseURL)
	if err != nil {
		return nil, err
	}
	resourceHandler := ResourceHandler(client)

	return NewHandler(
		client,
		humio.NewQueryRunner(*client),
		httpadapter.New(resourceHandler),
		framestruct.ToDataFrame,
		s,
	), nil
}

func client(accessToken string, baseURL string) (*humioAPI.Client, error) {
	config := humioAPI.DefaultConfig()
	address, err := url.Parse(baseURL)
	if err != nil {
		return nil, err
	}
	config.Address = address
	config.Token = accessToken

	return humioAPI.NewClient(config), nil
}

func (h *Handler) Dispose() {
	// Called before creating a new instance to allow plugin authors
	// to cleanup.
}
