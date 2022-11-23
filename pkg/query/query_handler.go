package query

import (
	"context"
	"errors"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/models"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	humio "github.com/humio/cli/api"
)

// QueryHandler the handler of queries
type QueryHandler struct {
	context *models.QueryContext
}

// NewQueryHandler creates a new QueryHandler
func NewQueryHandler(client humio.Client, query backend.DataQuery) *QueryHandler {
	return &QueryHandler{
		context: &models.QueryContext{
			Query:  query,
			Client: client,
		},
	}
}

func (qh *QueryHandler) Query(ctx context.Context) backend.DataResponse {
	qm, err := models.ReadQuery(qh.context.Query)
	if err != nil {
		return backend.DataResponse{Error: err}
	}
	qh.context.Model = qm

	frames, err := qh.getExecutor(qm.Type).execute(ctx)
	return backend.DataResponse{Frames: frames, Error: err}
}

type queryExecutor interface {
	execute(ctx context.Context) (data.Frames, error)
}

func (qh *QueryHandler) getExecutor(kind string) queryExecutor {
	executors := map[string]queryExecutor{
		/*"queryJob"*/ "": &QueryJob{qh.context},
	}
	if executors[kind] != nil {
		return executors[kind]
	}
	return &QueryHandler{}
}

// fallback executor
func (qh *QueryHandler) execute(ctx context.Context) (data.Frames, error) {
	return nil, errors.New("Invalid Request")
}
