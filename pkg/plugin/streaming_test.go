package plugin_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/falconlogscale-datasource-backend/pkg/plugin"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
	"github.com/stretchr/testify/require"
)

var (
	testMux     *http.ServeMux
	testServer  *httptest.Server
	testHandler *plugin.Handler
)

func setupStreamingTests() {
	// Setup test server and handlers
	testMux = http.NewServeMux()
	testServer = httptest.NewServer(testMux)

	// Initialize the Handler
	testHandler = &plugin.Handler{
		Streams: make(map[string]data.FrameJSONCache),
		FrameMarshaller: func(string, interface{}, ...framestruct.FramestructOption) (*data.Frame, error) {
			frame := &data.Frame{Name: "TestFrame"}
			return frame, nil
		},
	}
}

func TestSubscribeStream(t *testing.T) {
	setupStreamingTests()

	t.Run("returns error for invalid path", func(t *testing.T) {
		req := &backend.SubscribeStreamRequest{Path: "invalid/path"}
		resp, err := testHandler.SubscribeStream(context.Background(), req)

		require.Error(t, err)
		require.Equal(t, backend.SubscribeStreamStatusNotFound, resp.Status)
	})

	t.Run("subscribes successfully with valid path", func(t *testing.T) {
		req := &backend.SubscribeStreamRequest{
			Path: "tail/somepath",
			Data: json.RawMessage(`{"repository":"test-repository"}`),
		}
		resp, err := testHandler.SubscribeStream(context.Background(), req)

		require.NoError(t, err)
		require.Equal(t, backend.SubscribeStreamStatusOK, resp.Status)
	})
}

func TestRunStream(t *testing.T) {
	setupStreamingTests()

	t.Run("runs stream and sends frame successfully", func(t *testing.T) {
		req := &backend.RunStreamRequest{
			Path: "tail/somepath",
			Data: json.RawMessage(`{"repository":"test-repository-1"}`),
		}

		// Create a channel to simulate the streaming results
		c := make(chan humio.StreamingResults, 1)
		done := make(chan any)
		defer close(done)

		go func() {
			c <- humio.StreamingResults{"event": "some data"}
			close(c)
		}()

		testHandler.FrameMarshaller = func(string, interface{}, ...framestruct.FramestructOption) (*data.Frame, error) {
			frame := &data.Frame{Name: "TestFrame"}
			return frame, nil
		}

		sender := &backend.StreamSender{}
		err := testHandler.RunStream(context.Background(), req, sender)
		require.NoError(t, err)
	})
}
