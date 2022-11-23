package plugin

import (
	"context"
	"encoding/json"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

// QueryData handles multiple queries and returns multiple responses.
func (h *Handler) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {

	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		qr, err := h.queryRequest(q)
		if err != nil {
			response.Responses[q.RefID] = backend.DataResponse{Error: err}
			continue
		}

		// if qr.DatasetSlug == "" {
		// 	continue
		// }

		res, err := h.QueryRunner.Run(qr)
		if err != nil {
			response.Responses[q.RefID] = backend.DataResponse{Error: err}
			continue
		}

		var frames []*data.Frame
		for _, r := range res {
			if len(r.Events) == 0 {
				continue
			}

			f, err := h.FrameMarshaller("", r.Events)
			if err != nil {
				response.Responses[q.RefID] = backend.DataResponse{Error: err}
				continue
			}

			frames = append(frames, f)
		}

		if len(frames) > 0 {
			response.Responses[q.RefID] = backend.DataResponse{Frames: frames}
		}
	}

	return response, nil
}

type grafanaQuery struct {
	DatasetSlug string      `json:"dataset"`
	IntervalMS  int64       `json:"intervalMs"`
	Query       humio.Query `json:"humioQuery"`
}

func (h *Handler) queryRequest(q backend.DataQuery) (humio.QueryRequest, error) {
	var gr grafanaQuery
	if err := json.Unmarshal(q.JSON, &gr); err != nil {
		return humio.QueryRequest{}, err
	}

	startTime := "10y" //q.TimeRange.From.String()
	endTime := ""      //q.TimeRange.To.String()

	qr := humio.QueryRequest{}
	qr.DatasetSlug = gr.DatasetSlug
	qr.Query = gr.Query
	qr.Query.Repository = gr.Query.Repository
	qr.Query.QueryString = gr.Query.QueryString
	qr.Query.Start = startTime
	qr.Query.End = endTime

	return qr, nil
}
