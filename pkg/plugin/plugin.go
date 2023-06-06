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

	client, err := client(s)
	if err != nil {
		return nil, err
	}
	resourceHandler := ResourceHandler(client)

	return NewHandler(
		client,
		humio.NewQueryRunner(client),
		httpadapter.New(resourceHandler),
		framestruct.ToDataFrame,
		s,
	), nil
}

func client(settings Settings) (*humio.Client, error) {
	address, err := url.Parse(settings.BaseURL)
	if err != nil {
		return nil, err
	}
	return humio.NewClient(humio.Config{
		Address:            address,
		Token:              settings.AccessToken,
		InsecureSkipVerify: settings.InsecureSkipVerify,
		TlsClientAuth:      settings.TlsClientAuth,
		TlsAuthWithCACert:  settings.TlsAuthWithCACert,
		TlsCACert:          settings.TlsCACert,
		TlsClientCert:      settings.TlsClientCert,
		TlsClientKey:       settings.TlsClientKey,
		TlsServerName:      settings.TlsServerName,
	})
}

func (h *Handler) Dispose() {
	// Called before creating a new instance to allow plugin authors
	// to cleanup.
}
