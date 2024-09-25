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

	client, err := newClient(s, httpOpts)
	if err != nil {
		return nil, err
	}
	resourceHandler := ResourceHandler(client)

	streamingHttpOpts, err := settings.HTTPClientOptions(ctx)
	if err != nil {
		return nil, err
	}
	streamingHttpOpts.ForwardHTTPHeaders = s.OAuthPassThru
	streamingHttpOpts.Headers["Content-Type"] = "application/json"
	streamingHttpOpts.Headers["Accept"] = "application/x-ndjson"
	// not sure if we will need time outs
	// streamingHttpOpts.Timeouts.IdleConnTimeout = 0
	// streamingHttpOpts.Timeouts.KeepAlive = 0
	// streamingHttpOpts.Timeouts.Timeout = 0
	streamingClient, err := newClient(s, streamingHttpOpts)
	if err != nil {
		return nil, err
	}

	return NewHandler(
		client,
		streamingClient,
		humio.NewQueryRunner(client),
		httpadapter.New(resourceHandler),
		framestruct.ToDataFrame,
		s,
	), nil
}

func newClient(settings Settings, httpOpts httpclient.Options) (*humio.Client, error) {
	address, err := url.Parse(settings.BaseURL)
	if err != nil {
		return nil, err
	}
	return humio.NewClient(humio.Config{
		Address: address,
		Token:   settings.AccessToken,
	}, httpOpts)
}

func (h *Handler) Dispose() {
	// Called before creating a new instance to allow plugin authors
	// to cleanup.
}
