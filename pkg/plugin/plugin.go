package plugin

import (
	"context"
	"net/url"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
)

func NewDataSourceInstance(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	s, err := LoadSettings(settings)
	if err != nil {
		return nil, err
	}
	httpOpts, err := settings.HTTPClientOptions(ctx)
	if err != nil {
		return nil, err
	}
	httpOpts.ForwardHTTPHeaders = s.OAuthPassThru
	httpOpts.Header["Content-Type"] = []string{"application/json"}

	streamingOpts, err := settings.HTTPClientOptions(ctx)
	if err != nil {
		return nil, err
	}
	streamingOpts.ForwardHTTPHeaders = s.OAuthPassThru
	streamingOpts.Header["Content-Type"] = []string{"application/json"}
	streamingOpts.Header["Accept"] = []string{"application/x-ndjson"}
	streamingOpts.Timeouts.IdleConnTimeout = 0
	streamingOpts.Timeouts.KeepAlive = 0
	streamingOpts.Timeouts.Timeout = 0
	client, err := newClient(s, httpOpts, streamingOpts)
	if err != nil {
		return nil, err
	}
	resourceHandler := ResourceHandler(client, s)

	return NewHandler(
		client,
		humio.NewQueryRunner(client),
		httpadapter.New(resourceHandler),
		framestruct.ToDataFrame,
		s,
	), nil
}

func newClient(settings Settings, httpOpts httpclient.Options, streamingOpts httpclient.Options) (*humio.Client, error) {
	baseURL := settings.BaseURL
	if settings.Mode == "NGSIEM" {
		baseURL += "/humio"
	}
	address, err := url.Parse(baseURL)
	if err != nil {
		return nil, err
	}
	return humio.NewClient(humio.Config{
		Address: address,
		Token:   settings.AccessToken,
		OAuth2Config: humio.OAuth2Config{
			OAuth2:             settings.OAuth2,
			OAuth2ClientID:     settings.OAuth2ClientID,
			OAuth2ClientSecret: settings.OAuth2ClientSecret,
		},
	}, httpOpts, streamingOpts)
}

func (h *Handler) Dispose() {
	// Called before creating a new instance to allow plugin authors
	// to cleanup.
}
