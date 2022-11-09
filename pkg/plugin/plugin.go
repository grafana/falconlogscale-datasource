package plugin

import (
	"context"
	"net/url"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-starter-datasource-backend/pkg/models"
	humio "github.com/humio/cli/api"
)

// Make sure Datasource implements required methods.
var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

type Datasource struct {
	Client humio.Client
}

// QueryData handles multiple queries and returns multiple responses.
func (ds *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {

	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		log.DefaultLogger.Debug("QueryData", "request", q.JSON)
		//res := jq.NewQueryHandler(*ds.Client, q, ds.Version).Query(ctx)
		//response.Responses[q.RefID] = res
	}

	return response, nil
}

func (ds *Datasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	_, err := ds.Client.HealthString()

	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Data source is working",
	}, nil
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

func (ds *Datasource) Dispose() {
	// Called before creating a new instance to allow plugin authors
	// to cleanup.
}

func NewDataSourceInstance(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	datasourceSettings, err := models.LoadSettings(settings)
	if err != nil {
		return nil, err
	}

	config := humio.DefaultConfig()
	config.Address, err = url.Parse(datasourceSettings.BaseURL)
	if err != nil {
		return nil, err
	}
	config.Token = datasourceSettings.AccessToken

	return &Datasource{
		Client: *humio.NewClient(config),
	}, nil
}

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
