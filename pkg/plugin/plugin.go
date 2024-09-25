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
	httpOpts.Headers["Content-Type"] = "application/json"

	streamingOpts, err := settings.HTTPClientOptions(ctx)
	if err != nil {
		return nil, err
	}
	streamingOpts.ForwardHTTPHeaders = s.OAuthPassThru
	streamingOpts.Headers["Content-Type"] = "application/json"
	streamingOpts.Headers["Accept"] = "application/x-ndjson"

	client, err := newClient(s, httpOpts, streamingOpts)
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

func newClient(settings Settings, httpOpts httpclient.Options, streamingOpts httpclient.Options) (*humio.Client, error) {
	address, err := url.Parse(settings.BaseURL)
	if err != nil {
		return nil, err
	}
	return humio.NewClient(humio.Config{
		Address: address,
		Token:   settings.AccessToken,
	}, httpOpts, streamingOpts)
}

func (h *Handler) Dispose() {
	// Called before creating a new instance to allow plugin authors
	// to cleanup.
}
