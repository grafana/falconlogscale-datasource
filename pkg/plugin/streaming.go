package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

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

	pluginCfg := backend.PluginConfigFromContext(ctx)
	orgId, err := strconv.ParseInt(strings.Split(req.Path, "/")[3], 10, 64)
	if err != nil {
		return &backend.SubscribeStreamResponse{
			Status: backend.SubscribeStreamStatusNotFound,
		}, fmt.Errorf("unable to determine orgId from request")
	}

	if orgId != pluginCfg.OrgID {
		return &backend.SubscribeStreamResponse{
			Status: backend.SubscribeStreamStatusPermissionDenied,
		}, fmt.Errorf("invalid orgId supplied in request")
	}
	var qr humio.Query
	if err := json.Unmarshal(req.Data, &qr); err != nil {
		return nil, err
	}

	err = ValidateQuery(qr)
	if err != nil {
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

	return &backend.SubscribeStreamResponse{
		Status: backend.SubscribeStreamStatusOK,
	}, nil
}

func (h *Handler) PublishStream(context.Context, *backend.PublishStreamRequest) (*backend.PublishStreamResponse, error) {
	return &backend.PublishStreamResponse{
		Status: backend.PublishStreamStatusPermissionDenied,
	}, nil
}

func formatDuration(d time.Duration) string {
	return fmt.Sprintf("%.0fs", d.Seconds())
}

// calculate relative time for live query
func getQueryStartTime(req *backend.RunStreamRequest) (string, error) {
	type TimeRange struct {
		From string `json:"from"`
		To   string `json:"to"`
	}

	type reqData struct {
		Repository string    `json:"repository"`
		QueryType  string    `json:"queryType"`
		Version    string    `json:"version"`
		TimeRange  TimeRange `json:"timeRange"`
	}

	var queryTimeRange reqData

	err := json.Unmarshal(req.Data, &queryTimeRange)
	if err != nil {
		log.DefaultLogger.Error("Error converting JSON to struct:", err)
		return "", err
	}

	fromTime := queryTimeRange.TimeRange.From
	toTime := queryTimeRange.TimeRange.To

	from, err1 := strconv.ParseInt(fromTime, 10, 64)
	to, err2 := strconv.ParseInt(toTime, 10, 64)

	if err1 != nil || err2 != nil {
		log.DefaultLogger.Error("Error converting strings to integers:", err1, err2)
		return "", err
	}

	timeDifference := to - from
	duration := time.Duration(timeDifference) * time.Millisecond
	relativeTime := formatDuration(duration)

	return relativeTime, nil
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

	var queryStartTime string
	queryStartTime, err = getQueryStartTime(req)
	if err != nil {
		return err
	}

	qr.Start = queryStartTime
	c := make(chan humio.StreamingResults)
	prev := data.FrameJSONCache{}
	done := make(chan any)

	h.QueryRunner.RunChannel(ctx, qr, c, done)

	for {
		select {
		case <-ctx.Done():
			log.DefaultLogger.Info("Context done, exiting stream", "reason", ctx.Err())
			return ctx.Err()
		case <-done:
			log.DefaultLogger.Info("Received done signal in RunStream")
			return nil
		case r := <-c:
			f, err := convertResultsToFrame(qr.FormatAs, r)
			if err != nil {
				log.DefaultLogger.Error("Failed to convert streaming results to frames", "err", err, "data", r)
				continue
			}
			if f != nil && len(f.Fields) > 0 {
				next, err := data.FrameToJSONCache(f)
				if err != nil {
					log.DefaultLogger.Error("Failed to get next frame cache", err)
					continue
				}
				if next.SameSchema(&prev) {
					err = sender.SendFrame(f, data.IncludeDataOnly)
				} else {
					err = sender.SendFrame(f, data.IncludeAll)
				}
				if err != nil {
					log.DefaultLogger.Error("Websocket write:", "err", err)
					continue
				}
				prev = next

				// Cache the initial data
				h.streamsMu.Lock()
				h.Streams[req.Path] = prev
				h.streamsMu.Unlock()
			}
		}
	}
}

func convertResultsToFrame(formatAs string, results humio.StreamingResults) (*data.Frame, error) {
	f := data.NewFrame(
		"results",
		data.NewField("@timestamp", nil, []*time.Time{}),
		data.NewField("@rawstring", nil, []string{}),
	)
	if formatAs == humio.FormatLogs {
		f.Meta = &data.FrameMeta{
			PreferredVisualization: data.VisTypeLogs,
		}
	}
	timestampString, ok := results["@timestamp"]
	if !ok {
		return nil, fmt.Errorf("no @timestamp field")
	}
	timestamp, err := ConverterForStringToTime(timestampString)
	if err != nil {
		return nil, err
	}
	rawstring, ok := results["@rawstring"]
	if !ok {
		return nil, fmt.Errorf("no @rawstring field")
	}
	f.AppendRow(
		timestamp,
		rawstring,
	)
	return f, err
}
