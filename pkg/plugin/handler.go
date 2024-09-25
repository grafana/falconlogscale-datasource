package plugin

import (
	"context"
	"sync"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
)

type humioClient interface {
}

type queryRunner interface {
	Run(humio.Query) ([]humio.QueryResult, error)
	RunChannel(context.Context, humio.Query, *chan humio.StreamingResults, *chan any)
	GetAllRepoNames() ([]string, error)
	SetAuthHeaders(authHeaders map[string]string)
}

// Handler encapsulates the lifecycle management of the handler components.
type Handler struct {
	Client          humioClient
	StreamingClient humioClient
	QueryRunner     queryRunner
	ResourceHandler backend.CallResourceHandler
	FrameMarshaller func(string, interface{}, ...framestruct.FramestructOption) (*data.Frame, error)
	Settings        Settings

	// open streams
	streams   map[string]data.FrameJSONCache
	streamsMu sync.RWMutex
}

var (
	_ backend.QueryDataHandler    = (*Handler)(nil)
	_ backend.StreamHandler       = (*Handler)(nil)
	_ backend.CallResourceHandler = (*Handler)(nil)
)

// Handler takes a *Handler and modifies it for configuration purposes
type HandlerOption func(h *Handler)

// NewHandler returns a Humio handler
func NewHandler(
	client humioClient,
	streamingClient humioClient,
	runner queryRunner,
	resourceHandler backend.CallResourceHandler,
	marshaller func(string, interface{}, ...framestruct.FramestructOption) (*data.Frame, error),
	settings Settings,
	opts ...HandlerOption,
) *Handler {
	h := &Handler{
		Client:          client,
		StreamingClient: streamingClient,
		QueryRunner:     runner,
		ResourceHandler: resourceHandler,
		FrameMarshaller: marshaller,
		Settings:        settings,
		streams:         make(map[string]data.FrameJSONCache),
	}

	for _, o := range opts {
		o(h)
	}

	return h
}
