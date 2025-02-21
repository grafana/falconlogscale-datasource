package plugin_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
	"github.com/stretchr/testify/require"
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

func TestSubscribeStream(t *testing.T) {
	t.Run("returns error for invalid path", func(t *testing.T) {
		handler, _ := setup()
		ctx := context.Background()
		ctx = backend.WithPluginContext(ctx, backend.PluginContext{
			OrgID: 1,
		})
		req := &backend.SubscribeStreamRequest{Path: "invalid/path/1"}
		resp, err := handler.SubscribeStream(ctx, req)

		require.Error(t, err)
		require.Equal(t, backend.SubscribeStreamStatusNotFound, resp.Status)
	})

	t.Run("subscribes successfully with valid path", func(t *testing.T) {
		handler, _ := setup()
		ctx := context.Background()
		ctx = backend.WithPluginContext(ctx, backend.PluginContext{
			OrgID: 1,
		})
		req := &backend.SubscribeStreamRequest{
			Path: "tail/dsId/test-path/1",
			Data: json.RawMessage(`{"repository":"test-repository"}`),
		}
		resp, err := handler.SubscribeStream(ctx, req)

		require.NoError(t, err)
		require.Equal(t, backend.SubscribeStreamStatusOK, resp.Status)
	})

	t.Run("subscribe fails if org ID in path does not match plugin request", func(t *testing.T) {
		handler, _ := setup()
		ctx := context.Background()
		ctx = backend.WithPluginContext(ctx, backend.PluginContext{
			OrgID: 1,
		})
		req := &backend.SubscribeStreamRequest{
			Path: "tail/dsId/test-path/2",
			Data: json.RawMessage(`{"repository":"test-repository"}`),
		}
		resp, err := handler.SubscribeStream(ctx, req)

		require.Error(t, err)
		require.Equal(t, backend.SubscribeStreamStatusPermissionDenied, resp.Status)
	})
}

func TestRunStream(t *testing.T) {
	t.Run("runs stream and sends frame successfully", func(t *testing.T) {
		handler, tc := setup()

		req := &backend.RunStreamRequest{
			Data: json.RawMessage(`{
				"repository": "test"
			}`),
		}

		handler.FrameMarshaller = func(string, interface{}, ...framestruct.FramestructOption) (*data.Frame, error) {
			frame := &data.Frame{Name: "TestFrame"}
			return frame, nil
		}
		sentCount := 0
		mockPacketSender := &mockStreamPacketSender{
			sendFunc: func(packet *backend.StreamPacket) error {
				sentCount++
				return nil
			},
		}

		mockSender := backend.NewStreamSender(mockPacketSender)

		err := handler.RunStream(tc.queryRunner.ctx, req, mockSender)
		require.ErrorIs(t, err, context.Canceled)
		require.True(t, sentCount == 1)
	})
}
