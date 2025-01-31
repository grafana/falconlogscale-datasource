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

type mockStreamPacketSender struct {
	sendFunc func(*backend.StreamPacket) error
}

func (m *mockStreamPacketSender) Send(packet *backend.StreamPacket) error {
	if m.sendFunc != nil {
		return m.sendFunc(packet)
	}
	return nil
}

var mockSender *backend.StreamSender

type mockQueryRunner struct {
	runFunc            func(humio.Query) ([]humio.QueryResult, error)
	runChannelFunc     func(context.Context, humio.Query, chan humio.StreamingResults, chan any)
	getRepoNamesFunc   func() ([]string, error)
	setAuthHeadersFunc func(authHeaders map[string]string)
}

func (m *mockQueryRunner) Run(q humio.Query) ([]humio.QueryResult, error) {
	if m.runFunc != nil {
		return m.runFunc(q)
	}
	return nil, nil
}

func (m *mockQueryRunner) RunChannel(ctx context.Context, qr humio.Query, c chan humio.StreamingResults) {
	done := make(chan any)
	if m.runChannelFunc != nil {
		m.runChannelFunc(ctx, qr, c, done)
	}
}

func (m *mockQueryRunner) GetAllRepoNames() ([]string, error) {
	if m.getRepoNamesFunc != nil {
		return m.getRepoNamesFunc()
	}
	return nil, nil
}

func (m *mockQueryRunner) SetAuthHeaders(authHeaders map[string]string) {
	if m.setAuthHeadersFunc != nil {
		m.setAuthHeadersFunc(authHeaders)
	}
}

func setupStreamingTests(t *testing.T) {
	testMux = http.NewServeMux()
	testServer = httptest.NewServer(testMux)

	t.Cleanup(func() {
		testServer.Close()
	})

	mockPacketSender := &mockStreamPacketSender{
		sendFunc: func(packet *backend.StreamPacket) error {
			return nil
		},
	}

	mockSender = backend.NewStreamSender(mockPacketSender)

	mockQueryRunner := &mockQueryRunner{
		runChannelFunc: func(ctx context.Context, qr humio.Query, c chan humio.StreamingResults, done chan any) {
			go func() {
				c <- humio.StreamingResults{"event": "mock event data"}
				close(c)
				close(done)
			}()
		},
	}

	testHandler = &plugin.Handler{
		Streams: make(map[string]data.FrameJSONCache),
		FrameMarshaller: func(string, interface{}, ...framestruct.FramestructOption) (*data.Frame, error) {
			frame := &data.Frame{Name: "TestFrame"}
			return frame, nil
		},
		QueryRunner: mockQueryRunner,
	}
}

func TestSubscribeStream(t *testing.T) {
	setupStreamingTests(t)

	t.Run("returns error for invalid path", func(t *testing.T) {
		ctx := context.Background()
		ctx = backend.WithPluginContext(ctx, backend.PluginContext{
			OrgID: 1,
		})
		req := &backend.SubscribeStreamRequest{Path: "invalid/path/1"}
		resp, err := testHandler.SubscribeStream(ctx, req)

		require.Error(t, err)
		require.Equal(t, backend.SubscribeStreamStatusNotFound, resp.Status)
	})

	t.Run("subscribes successfully with valid path", func(t *testing.T) {
		ctx := context.Background()
		ctx = backend.WithPluginContext(ctx, backend.PluginContext{
			OrgID: 1,
		})
		req := &backend.SubscribeStreamRequest{
			Path: "tail/dsId/test-path/1",
			Data: json.RawMessage(`{"repository":"test-repository"}`),
		}
		resp, err := testHandler.SubscribeStream(ctx, req)

		require.NoError(t, err)
		require.Equal(t, backend.SubscribeStreamStatusOK, resp.Status)
	})

	t.Run("subscribe fails if org ID in path does not match plugin request", func(t *testing.T) {
		ctx := context.Background()
		ctx = backend.WithPluginContext(ctx, backend.PluginContext{
			OrgID: 1,
		})
		req := &backend.SubscribeStreamRequest{
			Path: "tail/dsId/test-path/2",
			Data: json.RawMessage(`{"repository":"test-repository"}`),
		}
		resp, err := testHandler.SubscribeStream(ctx, req)

		require.Error(t, err)
		require.Equal(t, backend.SubscribeStreamStatusPermissionDenied, resp.Status)
	})
}

func TestRunStream(t *testing.T) {
	setupStreamingTests(t)

	t.Run("runs stream and sends frame successfully", func(t *testing.T) {
		req := &backend.RunStreamRequest{
			Path: "tail/test-path",
			Data: json.RawMessage(`{
				"repository": "test-repository-1",
				"timeRange": {
					"from": "1633046400000", 
					"to": "1633132800000"   
				}
			}`),
		}

		testHandler.FrameMarshaller = func(string, interface{}, ...framestruct.FramestructOption) (*data.Frame, error) {
			frame := &data.Frame{Name: "TestFrame"}
			return frame, nil
		}

		err := testHandler.RunStream(context.Background(), req, mockSender)
		require.NoError(t, err)
	})
}
