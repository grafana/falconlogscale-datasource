package plugin

import (
	"context"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func (h *Handler) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	authHeaders := map[string]string{
		backend.OAuthIdentityTokenHeaderName:   req.GetHTTPHeader(backend.OAuthIdentityTokenHeaderName),
		backend.OAuthIdentityIDTokenHeaderName: req.GetHTTPHeader(backend.OAuthIdentityIDTokenHeaderName),
	}
	err := h.QueryRunner.SetAuthHeaders(authHeaders)
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}

	// Verify authentication using mode-appropriate method
	var message string

	switch h.Settings.Mode {
	case "NGSIEM":
		// NGSIEM mode doesn't support GraphQL
		err = h.QueryRunner.OauthClientSecretHealthCheck()
		if err != nil {
			return &backend.CheckHealthResult{
				Status:  backend.HealthStatusError,
				Message: "Authentication failed: " + err.Error(),
			}, nil
		}
		message = "Successfully authenticated"

	default:
		// LogScale mode supports GraphQL, list repositories
		repos, err := h.QueryRunner.GetAllRepoNames()
		if err != nil {
			return &backend.CheckHealthResult{
				Status:  backend.HealthStatusError,
				Message: "Authentication failed: " + err.Error(),
			}, nil
		}
		message = fmt.Sprintf("Successfully authenticated (%d repositories found)", len(repos))
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: message,
	}, nil
}
