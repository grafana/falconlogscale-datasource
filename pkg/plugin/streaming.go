package plugin

import (
	"context"
	"encoding/json"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

func (h *Handler) SubscribeStream(context.Context, *backend.SubscribeStreamRequest) (*backend.SubscribeStreamResponse, error) {
	return &backend.SubscribeStreamResponse{
		Status: backend.SubscribeStreamStatusOK,
	}, nil
}

func (h *Handler) PublishStream(context.Context, *backend.PublishStreamRequest) (*backend.PublishStreamResponse, error) {
	return &backend.PublishStreamResponse{
		Status: backend.PublishStreamStatusPermissionDenied,
	}, nil
}

func (h *Handler) RunStream(ctx context.Context, req *backend.RunStreamRequest, sender *backend.StreamSender) error {

	var qr humio.Query
	if err := json.Unmarshal(req.Data, &qr); err != nil {
		return err
	}
	qr.Live = true

	var frames []*data.Frame

	if qr.QueryType == humio.QueryTypeLQL {
		res, err := h.QueryRunner.Run(qr)
		if err != nil {
			return err
		}

		for _, r := range res {
			if len(r.Events) == 0 {
				continue
			}

			converters := GetConverters(r.Events)
			f, err := h.FrameMarshaller("events", r.Events, converters...)
			if err != nil {
				return err
			}

			OrderFrameFieldsByMetaData(r.Metadata.FieldOrder, f)
			PrependTimestampField(f)

			if _, ok := r.Events[0]["_bucket"]; ok {
				f, err = ConvertToWideFormat(f)
				if err != nil {
					return err
				}
			}

			if qr.FormatAs == humio.FormatLogs {
				f.Meta = &data.FrameMeta{
					PreferredVisualization: data.VisTypeLogs,
				}
			}

			frames = append(frames, f)
		}
	}

	err := sender.SendFrame(
		frames[0],
		data.IncludeAll,
	)

	repository := qr.Repository

	// run in lambda func to be able to defer and delete the query job
	result, err := func() (*humio.QueryResult, error) {
		id, err := h.QueryRunner.JobQuerier.CreateJob(repository, query)

		if err != nil {
			return nil, err
		}

		defer func(id string) {
			// Humio will eventually delete the query when we stop polling and we can't do much about errors here.
			_ = qj.jobQuerier.DeleteJob(repository, id)
		}(id)

		var result humio.QueryResult
		poller := humio.QueryJobPoller{
			QueryJobs:  &qj.jobQuerier,
			Repository: repository,
			Id:         id,
		}
		result, err = poller.WaitAndPollContext(ctx)

		if err != nil {
			return nil, err
		}

		for !result.Done {
			result, err = poller.WaitAndPollContext(ctx)
			if err != nil {
				return nil, err
			}
		}

		return &result, nil
	}()

	if err != nil {
		log.DefaultLogger.Error("Humio query string error: %s\n", err.Error())
		return nil, err
	}

	r := humioToDatasourceResult(*result)
	return []humio.QueryResult{r}, nil
}
