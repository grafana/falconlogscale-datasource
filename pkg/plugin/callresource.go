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
	r.HandleFunc("/repositories", handleRepositories(c, c.ListRepos))

	return r
}

func handleRepositories(c *humio.Client, repositories func() ([]string, error)) func(w http.ResponseWriter, req *http.Request) {
	return func(w http.ResponseWriter, req *http.Request) {
		idTokenHeader := req.Header.Get(backend.OAuthIdentityIDTokenHeaderName)

		// We don't lint the next line as the headers are expected to be canonical but this is not the case
		//nolint:all
		if len(req.Header["X-ID-Token"]) > 0 {
			idTokenHeader = req.Header["X-ID-Token"][0]
		}
		authHeaders := map[string]string{
			backend.OAuthIdentityTokenHeaderName:   req.Header.Get(backend.OAuthIdentityTokenHeaderName),
			backend.OAuthIdentityIDTokenHeaderName: idTokenHeader,
		}
		c.SetAuthHeaders(authHeaders)
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
