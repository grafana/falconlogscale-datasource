package plugin

import (
	"net/url"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
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

	return NewHandler(
		client,
		humio.NewQueryRunner(*client),
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

// func (ds *Datasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
// 	// TODO: add a filter to the jql or use anther query type
// 	q := `{ "jql": "" }`
// 	request := []byte(q)

// 	query := backend.DataQuery{JSON: request, QueryType: "issues"}
// 	query.QueryType = "issues"
// 	res := jq.NewQueryHandler(*ds.Client, query, ds.Version).Query(ctx)

// 	if res.Error != nil {
// 		return &backend.CheckHealthResult{
// 			Status:  backend.HealthStatusError,
// 			Message: res.Error.Error(),
// 		}, nil
// 	}

// 	return &backend.CheckHealthResult{
// 		Status:  backend.HealthStatusOk,
// 		Message: "Data source is working",
// 	}, nil
// }

func (h *Handler) Dispose() {
	// Called before creating a new instance to allow plugin authors
	// to cleanup.
}

// func NewDataSourceInstance(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
// 	datasourceSettings, err := LoadSettings(settings)
// 	if err != nil {
// 		return nil, err
// 	}

// 	config := humioAPI.DefaultConfig()
// 	config.Address, err = url.Parse(datasourceSettings.BaseURL)
// 	if err != nil {
// 		return nil, err
// 	}
// 	config.Token = datasourceSettings.AccessToken

// 	return &Datasource{
// 		Client: *humioAPI.NewClient(config),
// 	}, nil
// }

// NewDataSourceInstance ...
// func NewDataSourceInstance(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
// 	api := NewResourceAPI()
// 	queryDatasource := NewQueryDatasource(api)
// 	datasource := &splunkds.SplunkDataSource{
// 		API:               api,
// 		HealthDiagnostics: &splunkds.HealthDiagnostics{},
// 		QueryAPI:          queryDatasource,
// 	}
// 	datasource.InitResourceHandler()
// 	return datasource, nil
// }
