package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strconv"
	"time"

	"github.com/araddon/dateparse"
	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
	"github.com/grafana/grafana-plugin-sdk-go/experimental/errorsource"
)

// QueryData handles multiple queries and returns multiple responses.
func (h *Handler) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {

	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		qr, err := h.queryRequest(q)
		if err != nil {
			errorsource.AddErrorToResponse(q.RefID, response, err)
			continue
		}

		authHeaders := map[string]string{
			backend.OAuthIdentityTokenHeaderName:   req.GetHTTPHeader(backend.OAuthIdentityTokenHeaderName),
			backend.OAuthIdentityIDTokenHeaderName: req.GetHTTPHeader(backend.OAuthIdentityIDTokenHeaderName),
		}
		h.QueryRunner.SetAuthHeaders(authHeaders)

		var frames []*data.Frame
		if qr.QueryType == humio.QueryTypeRepositories {
			repos, err := h.QueryRunner.GetAllRepoNames()
			if err != nil {
				return nil, err
			}

			f, err := h.FrameMarshaller("repositories", humio.ConvertRepos(repos))
			if err != nil {
				return nil, err
			}

			frames = append(frames, f)
		}

		if qr.QueryType == humio.QueryTypeLQL {
			err = ValidateQuery(qr)
			if err != nil {
				errorsource.AddErrorToResponse(q.RefID, response, err)
				continue
			}

			res, err := h.QueryRunner.Run(qr)
			if err != nil {
				errorsource.AddErrorToResponse(q.RefID, response, err)
				continue
			}

			for _, r := range res {
				if len(r.Events) == 0 {
					continue
				}

				f, err := BuildDataFrame(qr.FormatAs, h.FrameMarshaller, r)
				if err != nil {
					errorsource.AddErrorToResponse(q.RefID, response, err)
					continue
				}

				frames = append(frames, f)
			}
		}

		if len(frames) > 0 {
			response.Responses[q.RefID] = backend.DataResponse{Frames: frames}
		}
	}

	return response, nil
}

func BuildDataFrame(formatAs string, fm FrameMarshallerFunc, r humio.QueryResult) (*data.Frame, error) {
	// if our query is for template variable options, then we do not want to use the default frame marshaller so everything will be strings
	if formatAs == humio.FormatVariable {
		f, err := fm("events", r.Events)
		if err != nil {
			return nil, err
		}
		return f, nil
	}

	converters := GetConverters(r.Events)
	f, err := fm("events", r.Events, converters...)
	if err != nil {
		return nil, err
	}

	OrderFrameFieldsByMetaData(r.Metadata.FieldOrder, f)
	PrependTimestampField(f)

	if _, ok := r.Events[0]["_bucket"]; ok {
		f, err = ConvertToWideFormat(f)
		if err != nil {
			return nil, err
		}
	}

	if formatAs == humio.FormatLogs {
		f.Meta = &data.FrameMeta{
			PreferredVisualization: data.VisTypeLogs,
		}
	}

	return f, nil
}

func ConvertToWideFormat(frame *data.Frame) (*data.Frame, error) {
	if frame.TimeSeriesSchema().Type == data.TimeSeriesTypeLong {
		var err error
		frame, err = data.LongToWide(frame, &data.FillMissing{Mode: data.FillModeNull})
		if err != nil {
			return nil, err
		}
	}
	return frame, nil
}

func OrderFrameFieldsByMetaData(fieldOrder []string, f *data.Frame) {
	if len(fieldOrder) != 0 {
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

func PrependTimestampField(f *data.Frame) {
	timestampIndex := slices.IndexFunc[[]*data.Field, *data.Field](f.Fields, func(f *data.Field) bool {
		if f != nil && f.Name == "@timestamp" {
			return true
		}
		return false
	})
	if timestampIndex > -1 {
		timestampField := f.Fields[timestampIndex]
		removedTimestamp := slices.Delete[[]*data.Field, *data.Field](f.Fields, timestampIndex, timestampIndex+1)
		f.Fields = append([]*data.Field{timestampField}, removedTimestamp...)
	}
}

type Events []map[string]any

func GetConverters(events Events) []framestruct.FramestructOption {
	var converters []framestruct.FramestructOption
	// search through all event fields and return every field name with a value
	fieldNames := make(map[string]any)
	for _, event := range events {
		for k, val := range event {
			if val == nil {
				continue
			}
			if fieldNames[k] == nil {
				fieldNames[k] = val
				continue
			}
			// lets insure num val is not a string.
			if _, ok := val.(string); !ok {
				continue
			}
			if _, err := strconv.ParseFloat(val.(string), 64); err != nil {
				fieldNames[k] = val
			}
		}
	}
	for key, v := range fieldNames {
		// Theses fields are defined by Humio and should be treated as time
		if key == "@timestamp" || key == "@ingesttimestamp" || key == "@timestamp.nanos" || key == "@collect.timestamp" || key == "_now" || key == "_end" || key == "_start" || key == "_bucket" {
			converters = append(converters, framestruct.WithConverterFor(key, ConverterForStringToTime))
			continue
		}
		_, err := ConverterForStringToFloat64(v)
		if err == nil {
			converters = append(converters, framestruct.WithConverterFor(key, ConverterForStringToFloat64))
			continue
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

func ConverterForStringToFloat64(input any) (any, error) {
	s, ok := input.(string)
	if !ok {
		return nil, errors.New("cannot convert to string")
	}
	num, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil, err
	}
	return num, nil
}

func (h *Handler) queryRequest(q backend.DataQuery) (humio.Query, error) {
	var gr humio.Query
	if err := json.Unmarshal(q.JSON, &gr); err != nil {
		return humio.Query{}, err
	}

	gr = MigrateRequest(gr)

	startTime := strconv.FormatInt(q.TimeRange.From.UnixMilli(), 10)
	endTime := strconv.FormatInt(q.TimeRange.To.UnixMilli(), 10)

	gr.Start = startTime
	gr.End = endTime

	return gr, nil
}

func ValidateQuery(q humio.Query) error {
	if q.Repository == "" {
		return errorsource.DownstreamError(errors.New("select a repository"), false)
	}
	return nil
}
