package query

import (
	"context"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/models"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

type QueryJob struct {
	context *models.QueryContext
}

func (qj *QueryJob) execute(ctx context.Context) (data.Frames, error) {
	//qj.runJob()
	//issues, err := iq.getIssues()
	// if err != nil {
	// 	return nil, err
	// }

	//frame stuff
	return nil, nil
}
