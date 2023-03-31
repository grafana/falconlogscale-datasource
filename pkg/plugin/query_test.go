package plugin_test

import (
	"testing"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/falconlogscale-datasource-backend/pkg/plugin"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
	"github.com/grafana/grafana-plugin-sdk-go/experimental"
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
		events := []map[string]any{{"numberField": "100", "stringField": "hello"}}
		converters := plugin.GetConverters(events)
		frames, _ := framestruct.ToDataFrame("field", events, converters...)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "converter_all_field_types", frames, false)
	})
	t.Run("gets number in second entry", func(t *testing.T) {
		events := []map[string]any{{}, {"numberField": "3"}}
		converters := plugin.GetConverters(events)
		frames, _ := framestruct.ToDataFrame("field", events, converters...)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "convert_num_second", frames, false)
	})
	t.Run("string fields with numbers in them return as strings", func(t *testing.T) {
		events := []map[string]any{
			{"stringField": "100", "numberField": "1"},
			{"stringField": "f", "numberField": "2"},
			{"stringField": "hellol", "numberField": "3"},
			{"stringField": "23", "numberField": "3"},
			{"stringField": "hello", "numberField": "4"},
			{"stringField": "100", "numberField": "5"},
		}
		converters := plugin.GetConverters(events)
		frames, _ := framestruct.ToDataFrame("field", events, converters...)
		experimental.CheckGoldenJSONFrame(t, "../test_data", "convert_inconsistent_fields", frames, true)
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
