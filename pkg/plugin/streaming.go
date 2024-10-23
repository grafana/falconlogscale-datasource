package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

func (h *Handler) SubscribeStream(ctx context.Context, req *backend.SubscribeStreamRequest) (*backend.SubscribeStreamResponse, error) {
	if !strings.HasPrefix(req.Path, "tail/") {
		return &backend.SubscribeStreamResponse{
			Status: backend.SubscribeStreamStatusNotFound,
		}, fmt.Errorf("expected tail in channel path")
	}

	var qr humio.Query
	if err := json.Unmarshal(req.Data, &qr); err != nil {
		return nil, err
	}

	if err := ValidateQuery(qr); err != nil {
		return nil, err
	}

	h.streamsMu.RLock()
	defer h.streamsMu.RUnlock()

	cache, ok := h.Streams[req.Path]
	if ok {
		msg, err := backend.NewInitialData(cache.Bytes(data.IncludeAll))
		return &backend.SubscribeStreamResponse{
			Status:      backend.SubscribeStreamStatusOK,
			InitialData: msg,
		}, err
	}

	// nothing yet
	return &backend.SubscribeStreamResponse{
		Status: backend.SubscribeStreamStatusOK,
	}, nil
}

func (h *Handler) PublishStream(context.Context, *backend.PublishStreamRequest) (*backend.PublishStreamResponse, error) {
	return &backend.PublishStreamResponse{
		Status: backend.PublishStreamStatusPermissionDenied,
	}, nil
}

func (h *Handler) RunStream(ctx context.Context, req *backend.RunStreamRequest, sender *backend.StreamSender) error {
	var qr humio.Query
	if err := json.Unmarshal(req.Data, &qr); err != nil {
		return err
	}
	err := ValidateQuery(qr)
	if err != nil {
		return err
	}

	c := make(chan humio.StreamingResults)
	prev := data.FrameJSONCache{}
	done := make(chan any)

	h.QueryRunner.RunChannel(ctx, qr, c, done)

	for {
		select {
		case <-done:
			log.DefaultLogger.Info("Received done signal in RunStream")
			return nil
		case r := <-c:
			if len(r) == 0 {
				continue
			}
			f, err := h.FrameMarshaller("events", r)
			if err != nil {
				log.DefaultLogger.Error("Failed to marshal frame", "err", err, "data", r)
				return err
			}
			if f != nil {
				next, _ := data.FrameToJSONCache(f)
				if next.SameSchema(&prev) {
					err = sender.SendFrame(f, data.IncludeDataOnly)
				} else {
					err = sender.SendFrame(f, data.IncludeAll)
				}
				if err != nil {
					log.DefaultLogger.Error(("Websocket write:"), "err", err)
					return err
				}
				prev = next

				// Cache the initial data
				h.streamsMu.Lock()
				h.Streams[req.Path] = prev
				h.streamsMu.Unlock()
			}
		case <-ctx.Done():
			// If the context is canceled, clean up
			log.DefaultLogger.Info("Stream context canceled")
			return ctx.Err()
		}
	}
}
