package plugin

import (
	"net/url"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
)

func NewDataSourceInstance(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	s, err := LoadSettings(settings)
	if err != nil {
		return nil, err
	}

	client, err := client(s.AccessToken, s.BaseURL, s.BasicAuthUser, s.BasicAuthPass)
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

func client(accessToken string, baseURL string, user string, pass string) (*humio.Client, error) {
	address, err := url.Parse(baseURL)
	address.User = url.UserPassword(user, pass)
	if err != nil {
		return nil, err
	}
	return humio.NewClient(humio.Config{Address: address, Token: accessToken}), nil
}

func (h *Handler) Dispose() {
	// Called before creating a new instance to allow plugin authors
	// to cleanup.
}
