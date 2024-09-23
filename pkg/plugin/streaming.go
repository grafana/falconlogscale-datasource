package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

func (h *Handler) SubscribeStream(ctx context.Context, req *backend.SubscribeStreamRequest) (*backend.SubscribeStreamResponse, error) {
	// Expect tail/${key}
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
	//logger := s.logger.FromContext(ctx)
	var qr humio.Query
	if err := json.Unmarshal(req.Data, &qr); err != nil {
		return err
	}
	qr.Live = true
	qr.Start = "1m"
	c := make(chan humio.StreamingResults)
	prev := data.FrameJSONCache{}
	done := make(chan any)
	var sm sync.RWMutex
	defer close(done)

	h.QueryRunner.RunChannel(ctx, qr, &c, &done)
	for r := range c {
		if len(r) == 0 {
			continue
		}
		sm.Lock()

		f, err := h.FrameMarshaller("events", r)
		if err != nil {
			//logger.Error("Websocket write:", "err", err, "raw", message)
			return err
		}
		sm.Unlock()

		// r := rand.New(rand.NewSource(99))
		// f :=
		// 	data.NewFrame("test",
		// 		data.NewField("time", nil, []time.Time{time.Unix(1, 0)}),
		// 		data.NewField("test-value1", nil, []*float64{fp(r.ExpFloat64())}),
		// 		data.NewField("test-value2", nil, []*float64{fp(r.ExpFloat64())}))

		//PrependTimestampField(f)
		if f != nil {
			next, _ := data.FrameToJSONCache(f)
			if next.SameSchema(&prev) {
				err = sender.SendFrame(f, data.IncludeDataOnly)
			} else {
				err = sender.SendFrame(f, data.IncludeAll)
			}
			if err != nil {
				//logger.Error("Websocket write:", "err", err, "raw", message)
				//return
			}
			prev = next

			// Cache the initial data
			h.streamsMu.Lock()
			h.streams[req.Path] = prev
			h.streamsMu.Unlock()
		}
	}
	//c <- humio.QueryResult{}
	return nil
}
func fp(f float64) *float64 {
	return &f
}
