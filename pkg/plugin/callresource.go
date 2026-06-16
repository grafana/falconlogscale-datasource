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
func ResourceHandler(c *humio.Client, settings Settings) http.Handler {
	r := mux.NewRouter()
	r.HandleFunc("/repositories", handleRepositories(c, c.ListRepos))

	return r
}

func handleRepositories(c *humio.Client, repositories func() ([]string, error)) func(w http.ResponseWriter, req *http.Request) {
	return func(w http.ResponseWriter, req *http.Request) {
		authHeaders := map[string]string{
			backend.OAuthIdentityTokenHeaderName:   req.Header.Get(backend.OAuthIdentityTokenHeaderName),
			backend.OAuthIdentityIDTokenHeaderName: req.Header.Get(backend.OAuthIdentityIDTokenHeaderName),
		}
		err := c.SetAuthHeaders(authHeaders)
		if err != nil {
			writeResponse(nil, err, w)
			return
		}
		resp, err := repositories()
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
