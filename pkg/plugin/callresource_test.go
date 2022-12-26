package plugin_test

import (
	"context"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/stretchr/testify/require"
)

func TestCallResource(t *testing.T) {
	t.Run("it passes calls to the injected CallResourceHandler", func(t *testing.T) {
		handler, tc := setup()

		req := &backend.CallResourceRequest{Path: "repositories"}
		handler.CallResource(context.Background(), req, fakeSender{}) //nolint

		require.Equal(t, "repositories", tc.callHandler.req.Path)
	})
}

type fakeSender struct{}

func (fn fakeSender) Send(resp *backend.CallResourceResponse) error {
	return nil
}

type fakeCallHandler struct {
	req *backend.CallResourceRequest
}

func (ch *fakeCallHandler) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	ch.req = req
	return nil
}
