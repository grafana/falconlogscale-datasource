package plugin

import (
	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
)

type humioClient interface {
	HealthString() (string, error)
}

type queryRunner interface {
	Run(humio.Query) ([]humio.QueryResult, error)
}

// Handler encapsulates the lifecycle management of the handler components.
type Handler struct {
	Client          humioClient
	QueryRunner     queryRunner
	ResourceHandler backend.CallResourceHandler
	FrameMarshaller func(string, interface{}, ...framestruct.FramestructOption) (*data.Frame, error)
	Settings        Settings
}

// Handler takes a *Handler and modifies it for configuration purposes
type HandlerOption func(h *Handler)

// NewHandler returns a Humio handler
func NewHandler(
	client humioClient,
	runner queryRunner,
	resourceHandler backend.CallResourceHandler,
	marshaller func(string, interface{}, ...framestruct.FramestructOption) (*data.Frame, error),
	settings Settings,
	opts ...HandlerOption,
) *Handler {
	h := &Handler{
		Client:          client,
		QueryRunner:     runner,
		ResourceHandler: resourceHandler,
		FrameMarshaller: marshaller,
		Settings:        settings,
	}

	for _, o := range opts {
		o(h)
	}

	return h
}
