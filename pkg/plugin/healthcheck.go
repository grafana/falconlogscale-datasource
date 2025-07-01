package plugin

import (
	"context"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func (h *Handler) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	authHeaders := map[string]string{
		backend.OAuthIdentityTokenHeaderName:   req.GetHTTPHeader(backend.OAuthIdentityTokenHeaderName),
		backend.OAuthIdentityIDTokenHeaderName: req.GetHTTPHeader(backend.OAuthIdentityIDTokenHeaderName),
	}
	h.QueryRunner.SetAuthHeaders(authHeaders)

	backend.Logger.Info("checkHealth", "authHeaderName", backend.OAuthIdentityTokenHeaderName, "idHeaderName", backend.OAuthIdentityIDTokenHeaderName, "authHeaders", authHeaders)
	// Check if we can view our humio repos
	_, err := h.QueryRunner.GetAllRepoNames()

	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Data source is working",
	}, nil
}
