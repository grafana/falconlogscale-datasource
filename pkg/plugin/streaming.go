package plugin

import (
	"context"
	"encoding/json"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
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
	qr.Repository = "humio-organization-audit"
	qr.LSQL = "css"
	qr.Start = "1m"
	c := make(chan humio.QueryResult)
	go func() {
		for r := range c {
			// f2 := data.NewFrame("testdata",
			// 	data.NewField("Time", nil, make([]time.Time, 1)),
			// 	data.NewField("Value", nil, make([]float64, 1)),
			// 	data.NewField("Min", nil, make([]float64, 1)),
			// 	data.NewField("Max", nil, make([]float64, 1)),
			// )
			// sender.SendFrame(f2, data.IncludeAll)
			if len(r.Events) == 0 {
				continue
			}

			converters := GetConverters(r.Events)
			f, _ := h.FrameMarshaller("events", r.Events, converters...)
			// if err != nil {
			// 	return err
			// }

			OrderFrameFieldsByMetaData(r.Metadata.FieldOrder, f)
			PrependTimestampField(f)

			// if _, ok := r.Events[0]["_bucket"]; ok {
			// 	f, err = ConvertToWideFormat(f)
			// 	if err != nil {
			// 		return err
			// 	}
			// }

			// if qr.FormatAs == humio.FormatLogs {
			// 	f.Meta = &data.FrameMeta{
			// 		PreferredVisualization: data.VisTypeLogs,
			// 	}
			// }
			sender.SendFrame(f, data.IncludeAll)
		}
	}()
	h.QueryRunner.RunChannel(ctx, qr, &c)
	//c <- humio.QueryResult{}
	return nil
}
