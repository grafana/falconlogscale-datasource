package plugin

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// CallResource handles gRPC requests from the frontend to get non-query resources.
// This implementation delegates to an httpadapter to the actual request handing
func (h *Handler) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	return h.ResourceHandler.CallResource(ctx, req, sender)
}

// ResourceHandler handles http calls for resources from the api
func ResourceHandler(c *humio.Client) http.Handler {
	r := mux.NewRouter()
	r.HandleFunc("/repositories", handleRepositories(c.ListRepos))

	return r
}

func handleRepositories(repositories func(humio.AuthHeaders) ([]string, error)) func(w http.ResponseWriter, req *http.Request) {
	return func(w http.ResponseWriter, req *http.Request) {
		authHeaders := humio.AuthHeaders{
			"Authorization": req.Header.Get("Authorization"),
			"X-Id-Token":    req.Header.Get("X-Id-Token"),
		}
		resp, err := repositories(authHeaders)
		writeResponse(resp, err, w)
	}
}

func writeResponse(resp interface{}, err error, w http.ResponseWriter) {
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error())) //nolint
		return
	}

	b, err := json.Marshal(resp)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error())) //nolint
		return
	}

	w.Write(b) //nolint
}
