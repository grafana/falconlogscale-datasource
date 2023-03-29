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

			converters := GetConverters(r.Events)
			f, err := h.FrameMarshaller("events", r.Events, converters...)

			OrderFrameFieldsByMetaData(r.Metadata.FieldOrder, f)

			if q.QueryType == "logs" {
				f.Meta = &data.FrameMeta{
					PreferredVisualization: data.VisTypeLogs,
				}
			}
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

func OrderFrameFieldsByMetaData(fieldOrder []string, f *data.Frame) {
	if fieldOrder != nil && len(fieldOrder) != 0 {
		var fields []*data.Field
		for _, fieldName := range fieldOrder {
			for _, field := range f.Fields {
				if field.Name == fieldName {
					fields = append(fields, field)
				}
			}
		}
		f.Fields = fields
	}
}

type Events []map[string]any

func GetConverters(events Events) []framestruct.FramestructOption {
	var converters []framestruct.FramestructOption
	// search through all event fields and return every field name with a value
	fieldNames := make(map[string]any)
	for _, event := range events {
		for k, val := range event {
			if fieldNames[k] == nil {
				fieldNames[k] = val
			}
		}
	}
	for key := range fieldNames {
		switch key {
		case "@timestamp", "@ingesttimestamp", "@timestamp.nanos", "@collect.timestamp", "_now", "_end", "_start", "_bucket":
			converters = append(converters, framestruct.WithConverterFor(key, ConverterForStringToTime))
		case "_count", "_sum", "_avg", "_length", "_rate", "_eventFieldCount", "_eventSize", "_geodistance", "_abs", "_arccos", "_arcsin", "_arctan", "_ceil", "_cos", "_cosh", "_deg2rad", "_exp", "_expm1", "_floor", "_log", "_log10", "_log1p", "_log2", "_mod", "_pow", "_rad2deg", "_sin", "_sinh", "_spherical2cartesian", "_sqrt", "_tan", "_tanh", "_max", "_min", "_range", "_shannonentropy":
			converters = append(converters, framestruct.WithConverterFor(key, ConverterForStringToInt64))
		default:
			if strings.HasSuffix(key, "_x") {
				converters = append(converters, framestruct.WithConverterFor(key, ConverterForStringToInt64))
			}
		}
	}
	return converters
}

func ConverterForStringToTime(input any) (any, error) {
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

func ConverterForStringToInt64(input any) (any, error) {
	num, err := strconv.ParseFloat(input.(string), 64)
	if err != nil {
		return nil, nil
	}
	return num, nil
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
