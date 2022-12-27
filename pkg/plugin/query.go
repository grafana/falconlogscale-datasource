package plugin

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/araddon/dateparse"
	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
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

			converters := getConverters(r.Events)
			f, err := h.FrameMarshaller("events", r.Events, converters...)
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

type Events []map[string]any

func getConverters(events Events) []framestruct.FramestructOption {
	var converters []framestruct.FramestructOption
	for key, value := range events[0] {
		// There needs to be a better way to check to see if a field is a time
		// _bucket is defined by humio. it is a time group bucket
		if strings.Contains(key, "time") || key == "_bucket" {
			converters = append(converters, framestruct.WithConverterFor(key, converterForStringToTime))
			continue
		}
		_, err := converterForStringToInt64(value)
		if err == nil {
			converters = append(converters, framestruct.WithConverterFor(key, converterForStringToInt64))
			continue
		}
	}
	return converters
}

func converterForStringToTime(input any) (any, error) {
	var num int64
	switch v := input.(type) {
	case string:
		var err error
		num, err = strconv.ParseInt(v, 10, 64)
		if err != nil {
			if t, err := dateparse.ParseAny(v); err == nil {
				return t, nil
			}
			return input, nil
		}
	case float64:
		num = int64(v)
	case int64:
		num = v
	}
	p := time.Unix(0, num*int64(time.Millisecond))
	return &p, nil
}

func converterForStringToInt64(input any) (any, error) {
	num, err := strconv.ParseFloat(input.(string), 64)
	if err != nil {
		return nil, err
	}
	return &num, nil
}

func (h *Handler) queryRequest(q backend.DataQuery) (humio.Query, error) {
	var gr humio.Query
	if err := json.Unmarshal(q.JSON, &gr); err != nil {
		return humio.Query{}, err
	}

	startTime := strconv.FormatInt(q.TimeRange.From.UnixMilli(), 10)
	endTime := strconv.FormatInt(q.TimeRange.To.UnixMilli(), 10)

	gr.Start = startTime
	gr.End = endTime

	return gr, nil
}
