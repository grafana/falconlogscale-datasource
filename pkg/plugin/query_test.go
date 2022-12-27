package plugin_test

import (
	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/falconlogscale-datasource-backend/pkg/plugin"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
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

func newFakeFalconClient() *fakeFalconClient {
	return &fakeFalconClient{}
}

type fakeFalconClient struct {
	err         error
	stringValue string
}

func (c *fakeFalconClient) HealthString() (string, error) {
	return c.stringValue, c.err
}

type fakeQueryRunner struct {
	req  humio.Query
	ret  chan humio.QueryResult
	errs chan error
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
