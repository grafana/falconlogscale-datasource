package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
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

	//todo: dont run an invalid query and return an error

	h.streamsMu.RLock()
	defer h.streamsMu.RUnlock()

	cache, ok := h.streams[req.Path]
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
	// note from andrew: this should be set by the user in the query
	qr.Start = "1m"
	c := make(chan humio.StreamingResults)
	prev := data.FrameJSONCache{}
	done := make(chan any)
	defer close(done)

	h.QueryRunner.RunChannel(ctx, qr, c, done)

	for {
		select {
		case r := <-c:
			if len(r) == 0 {
				continue
			}
			f, err := h.FrameMarshaller("events", r)
			if err != nil {
				// note from andrew: we need logging all over this function!
				// logger.Error("Websocket write:", "err", err, "raw", message)
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
					//logger.Error("Websocket write:", "err", err, "raw", message)
					return err
				}
				prev = next

				// Cache the initial data
				h.streamsMu.Lock()
				h.streams[req.Path] = prev
				h.streamsMu.Unlock()
			}
		// note from andrew: this isnt called. we need to trigger the done channel from the runner
		case <-done:
			//stream over
			return nil
		}
	}
}
