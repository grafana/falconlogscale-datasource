package plugin_test

import (
	"context"
	"testing"
	"time"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/falconlogscale-datasource-backend/pkg/plugin"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
	"github.com/grafana/grafana-plugin-sdk-go/experimental"
	"github.com/stretchr/testify/require"
)

type testContext struct {
	falconClient    *fakeFalconClient
	queryRunner     *fakeQueryRunner
	frameMarshaller *fakeFrameMarshaller
	callHandler     *fakeCallHandler
	settings        plugin.Settings
}

func setup(opts ...plugin.HandlerOption) (*plugin.Handler, testContext) {
	tc := testContext{
		falconClient: newFakeFalconClient(),
		queryRunner: &fakeQueryRunner{
			ret:  make(chan humio.QueryResult, 100),
			errs: make(chan error, 100),
		},
		frameMarshaller: &fakeFrameMarshaller{
			errs: make(chan error, 100),
		},
		callHandler: &fakeCallHandler{},
		settings: plugin.Settings{
			BaseURL:               "https://cloud.humio.com",
			AccessToken:           "1234abcd",
			AuthenticateWithToken: true,
		},
	}

	handler := plugin.NewHandler(
		tc.falconClient,
		tc.queryRunner,
		tc.callHandler,
		tc.frameMarshaller.ToDataFrame,
		tc.settings,
		opts...,
	)

	return handler, tc
}

func TestGetConverters(t *testing.T) {
	t.Run("gets all types", func(t *testing.T) {
		events := []map[string]any{{"_count": "100", "stringField": "hello", "@timestamp": "2020-01-01T00:00:00Z"}}
		converters := plugin.GetConverters(events)
		frames, _ := framestruct.ToDataFrame("field", events, converters...)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "converter_all_field_types", frames, true)
	})
	t.Run("gets number in second entry", func(t *testing.T) {
		events := []map[string]any{{}, {"_count": "3"}}
		converters := plugin.GetConverters(events)
		frames, _ := framestruct.ToDataFrame("field", events, converters...)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "convert_num_second", frames, true)
	})
	t.Run("gets inconsistent fields", func(t *testing.T) {
		events := []map[string]any{
			{"_count": "100", "stringField": "hello", "@timestamp": "2020-01-01T00:00:00Z"},
			{"stringField": "hello", "extraField": "extra"},
		}
		converters := plugin.GetConverters(events)
		frames, _ := framestruct.ToDataFrame("field", events, converters...)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "convert_inconsistent_fields", frames, true)
	})
	t.Run("gets inconsistent fields with nulls", func(t *testing.T) {
		events := []map[string]any{
			{"_count": "100", "stringField": "hello", "@timestamp": "2020-01-01T00:00:00Z"},
			{"_count": nil, "stringField": "hello", "extraField": "extra", "@timestamp": nil},
			{"_count": "100", "stringField": "hello", "extraField": nil},
		}
		converters := plugin.GetConverters(events)
		frames, _ := framestruct.ToDataFrame("field", events, converters...)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "convert_inconsistent_fields_null", frames, true)
	})
}

func TestOrderFrameFieldsByMetaData(t *testing.T) {
	t.Run("orders fields by meta data", func(t *testing.T) {
		frame := data.NewFrame("test",
			data.NewField("b", nil, []string{"a", "b", "c"}),
			data.NewField("c", nil, []string{"d", "e", "f"}),
			data.NewField("a", nil, []string{"g", "h", "i"}),
		)
		fieldOrder := []string{
			"a",
			"b",
			"c",
		}
		plugin.OrderFrameFieldsByMetaData(fieldOrder, frame)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "order_frame_fields", frame, false)
	})
	t.Run("orders fields by meta data with missing fields", func(t *testing.T) {
		frame := data.NewFrame("test",
			data.NewField("b", nil, []string{"a", "b", "c"}),
			data.NewField("c", nil, []string{"d", "e", "f"}),
			data.NewField("a", nil, []string{"g", "h", "i"}),
		)
		fieldOrder := []string{
			"a",
			"b",
			"c",
			"d",
		}
		plugin.OrderFrameFieldsByMetaData(fieldOrder, frame)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "order_frame_fields_missing", frame, false)
	})
	t.Run("orders fields by meta data with extra fields", func(t *testing.T) {
		frame := data.NewFrame("test",
			data.NewField("b", nil, []string{"a", "b", "c"}),
			data.NewField("c", nil, []string{"d", "e", "f"}),
			data.NewField("a", nil, []string{"g", "h", "i"}),
		)
		fieldOrder := []string{
			"a",
			"b",
		}
		plugin.OrderFrameFieldsByMetaData(fieldOrder, frame)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "order_frame_fields_extra", frame, false)
	})
	t.Run("do not order fields if no meta data", func(t *testing.T) {
		frame := data.NewFrame("test",
			data.NewField("b", nil, []string{"a", "b", "c"}),
			data.NewField("c", nil, []string{"d", "e", "f"}),
			data.NewField("a", nil, []string{"g", "h", "i"}),
		)
		fieldOrder := []string{}
		plugin.OrderFrameFieldsByMetaData(fieldOrder, frame)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "order_frame_fields_no_meta", frame, false)
	})
	t.Run("string fields with numbers in them return as strings", func(t *testing.T) {
		events := []map[string]any{
			{"stringField": "100", "numberField": "1"},
			{"stringField": "f", "numberField": "2"},
			{"stringField": "hello", "numberField": "3"},
			{"stringField": "23", "numberField": "3"},
			{"stringField": "hello", "numberField": "4"},
			{"stringField": "100", "numberField": "5"},
		}
		converters := plugin.GetConverters(events)
		frames, _ := framestruct.ToDataFrame("field", events, converters...)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "string_number_fields", frames, false)
	})
}

func TestPrependTimestampField(t *testing.T) {
	t.Run("places timestamp field at beginning of frame", func(t *testing.T) {
		frame := data.NewFrame("test",
			data.NewField("c", nil, []string{"d", "e", "f"}),
			data.NewField("a", nil, []string{"g", "h", "i"}),
			data.NewField("@timestamp", nil, []string{"a", "b", "c"}),
		)
		plugin.PrependTimestampField(frame)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "prepend_timestamp_field", frame, true)
	})
}

func TestConvertToWideFormat(t *testing.T) {
	t.Run("wide format with no fields", func(t *testing.T) {
		frame := data.NewFrame("test")
		frame, err := plugin.ConvertToWideFormat(frame)
		require.NoError(t, err)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "wide_format_no_fields", frame, false)
	})
	t.Run("wide format with fields", func(t *testing.T) {
		frame := data.NewFrame("test",
			//time fields
			data.NewField("time", nil, []time.Time{
				time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
				time.Date(2020, 1, 1, 1, 0, 0, 0, time.UTC),
				time.Date(2020, 1, 1, 2, 0, 0, 0, time.UTC),
			}),
			data.NewField("num", nil, []float64{1, 2, 3}),
			data.NewField("label", nil, []string{"g", "h", "i"}),
		)
		frame, err := plugin.ConvertToWideFormat(frame)
		require.NoError(t, err)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "wide_format_fields", frame, false)
	})
}

func TestValidateQuery(t *testing.T) {
	t.Run("query is valid", func(t *testing.T) {
		query := humio.Query{
			Repository: "repo",
		}
		err := plugin.ValidateQuery(query)
		require.NoError(t, err)
	})
	t.Run("no repository in query returns an error", func(t *testing.T) {
		query := humio.Query{
			Repository: "",
		}
		err := plugin.ValidateQuery(query)
		require.Error(t, err, "select a repository")
	})
}

func newFakeFalconClient() *fakeFalconClient {
	return &fakeFalconClient{}
}

type fakeFalconClient struct {
}

type fakeQueryRunner struct {
	req      humio.Query
	ret      chan humio.QueryResult
	errs     chan error
	views    []string
	viewsErr error
}

func (qr *fakeQueryRunner) Run(req humio.Query) ([]humio.QueryResult, error) {
	qr.req = req

	var ret humio.QueryResult
	select {
	case ret = <-qr.ret:
		return []humio.QueryResult{ret}, qr.err()
	default:
		return nil, qr.err()
	}
}

func (qr *fakeQueryRunner) RunChannel(context.Context, humio.Query, *chan humio.StreamingResults, *chan any) {
}

func (qr *fakeQueryRunner) GetAllRepoNames() ([]string, error) {
	return qr.views, qr.viewsErr
}

func (qr *fakeQueryRunner) err() error {
	select {
	case err := <-qr.errs:
		return err
	default:
		return nil
	}
}

func (qr *fakeQueryRunner) SetAuthHeaders(authHeaders map[string]string) {}

type fakeFrameMarshaller struct {
	req  interface{}
	ret  *data.Frame
	errs chan error
}

func (f *fakeFrameMarshaller) ToDataFrame(name string, any interface{}, options ...framestruct.FramestructOption) (*data.Frame, error) {
	f.req = any

	select {
	case err := <-f.errs:
		return f.ret, err
	default:
		return f.ret, nil
	}
}
